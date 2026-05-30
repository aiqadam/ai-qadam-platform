import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DB, type Db } from '../../db';
import { DirectusClient, DirectusError } from '../directus/directus.client';
import { OutboxPublisher } from './outbox-publisher.service';
import {
  DEFAULT_REGISTRATION_CONSENTS,
  DEFAULT_REGISTRATION_FIELDS,
  type RegistrationConsent,
  type RegistrationField,
} from './telegram-registration-schema.service';

const TELEGRAM_STREAM = 'tg.dispatch.v1';

// #324 — registration ids are UUIDs; pre-check before any Directus
// query so non-UUID paths don't crash on Postgres cast errors (same
// shape as #316 fix for checkin tokens).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// #475 — statuses that occupy an (event, user) registration slot. This
// list MUST mirror the partial unique index
// `registrations_event_user_active_unique`
// (infrastructure/postgres/migrations/2026-05-24-registrations-unique-event-user.sql),
// which covers exactly these three. The dup-checks behind the 409 filter
// on it so a soft-deleted `cancelled` row no longer triggers a false
// `already_registered` — a cancel→re-register cycle is intended to work
// (see cancel()'s "keep the row … so a user who cancelled can re-register").
// Mirroring the index (rather than `_neq=cancelled`) keeps the pre-check
// and the constraint in lockstep and future-proofs against new
// non-slot-occupying statuses.
const ACTIVE_REGISTRATION_STATUSES = 'registered,waitlisted,attended';

// Phase Bot-B PR-1.3b — Telegram-as-IdP activation per ADR-0034
// acquisition rewrite. The bot's /register_<slug> FSM POSTs here once
// the user has answered all schema-driven fields. We:
//
//   1. Validate the event is open + payload matches the live schema
//   2. Look up existing Directus member by email (silent match)
//   3. If no match → create a Directus member from the profile values
//      (Telegram-as-IdP; no Authentik identity yet — created lazily
//      when the member first requests web sign-in, matching the
//      F-S1.6 lead pattern)
//   4. Backfill the matched/created member with the TG link fields
//      (telegram_user_id/_username/_linked_at) if not set
//   5. Insert the registration row (idempotent on (event,user) → 409)
//   6. Record each consented purpose as a member_consents row
//   7. Return the wire shape the bot's pydantic RegistrationResult
//      expects
//
// ADR-0037 layer triage: this is the multi-layer flow.
//   - Customer (bot writes via service token)
//   - Operational (Directus member graph + registration storage)
//   - Engineering (Authentik identity create — DEFERRED to lazy path;
//     web sign-in later triggers the AuthentikClient.createUser flow,
//     reusing the F-S2.7 / Phase A3 primitive without a code change here)
// Cross-layer contract: the body shape + member_consents.purpose enum.

// ─── Wire types (match bot's pydantic exactly) ───────────────────────────────

export interface RegisterInput {
  event_id: string;
  telegram_user_id: bigint;
  telegram_username: string | null;
  profile: Record<string, unknown>;
  consents: Record<string, boolean>;
}

export interface RegistrationResult {
  registration_id: string;
  member_id: string;
  was_new_member: boolean;
  qr_token: string | null; // Bundle 3 PR-3.3 wires this; null until then
  starts_at: string;
  title: string;
  // #325 — registration status. Default 'registered' for backward
  // compatibility (bot's pydantic treats absent as registered too).
  // 'waitlisted' fires when event is at capacity + waitlist_enabled.
  status?: 'registered' | 'waitlisted';
  // #325 — 1-based position in the waitlist; present only when
  // status='waitlisted'. Bot shows "⌛ Waitlist #N" badge.
  waitlist_position?: number;
}

export interface MemberLookupResult {
  member_id: string;
  display_name: string;
}

// #324
export interface CancelResult {
  registration_id: string;
  event: { id: string; title: string };
  cancelled_at: string;
}

// ─── Internal Directus shapes ────────────────────────────────────────────────

interface EventRow {
  id: string;
  slug: string | null;
  title: string;
  starts_at: string;
  country: string;
  location: string | null;
  status: string;
  visibility_scope: string | null;
  registration_open?: boolean | null;
  registration_schema?: { fields: RegistrationField[]; consents?: RegistrationConsent[] } | null;
  // #325 — operator-set capacity + waitlist toggle.
  capacity?: number | null;
  waitlist_enabled?: boolean | null;
}

interface DirectusMemberRow {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  telegram_user_id?: number | string | null;
}

interface RegistrationRow {
  id: string;
  event: string;
  user: string;
  checkin_code: string | null;
}

// Maps the bot's consent keys (operator-defined) to the canonical
// member_consents.purpose enum from F-S3.6. Unknown keys are SKIPPED
// (logged) — they don't write a member_consents row but they DO get
// recorded in registrations.consents jsonb so the operator can see
// what the user agreed to.
const CONSENT_KEY_TO_PURPOSE: Record<string, string> = {
  events: 'events',
  newsletter: 'marketing',
  marketing: 'marketing',
  research: 'research',
  recruiting: 'recruiting',
  sponsor_share: 'sponsor_share',
  content: 'content',
  paid_premium: 'paid_premium',
};

@Injectable()
export class TelegramRegistrationsService {
  private readonly logger = new Logger(TelegramRegistrationsService.name);

  constructor(
    private readonly directus: DirectusClient,
    private readonly outbox: OutboxPublisher,
    @Inject(DB) private readonly db: Db,
  ) {}

  // ─── GET /members/lookup-by-email/:email ───────────────────────────────────
  //
  // Silent member match used by the bot's registration FSM before
  // walking the schema fields. If hit, bot says "Welcome back, X" and
  // the operator-defined schema still renders for any per-event
  // questions. If miss, bot proceeds to "new member" treatment.
  //
  // 404 on miss is intentional — see bot's lookup_member_by_email
  // docstring for the swallow-vs-raise contract.
  async lookupByEmail(email: string): Promise<MemberLookupResult> {
    const row = await this.findMemberByEmail(email);
    if (!row) {
      throw new NotFoundException({ error: 'member_not_found' });
    }
    return {
      member_id: row.id,
      display_name: formatMemberDisplayName(row),
    };
  }

  // ─── DELETE /registrations/:id (cancellation, #324) ──────────────────────
  //
  // Bot's `/me` cancel button posts here. We verify the caller owns
  // the registration via `user.telegram_user_id` (canonical column on
  // directus_users; same join principle as #328/#332). Soft-delete:
  // status='cancelled' + cancelled_at=now() — keep the row for the
  // operator's analytics + downstream consumers (point_awards rollback,
  // future waitlist auto-promote per #325).
  //
  // Errors map per the contract in #324:
  //   * non-UUID id → 404 registration_not_found (don't crash Postgres cast)
  //   * Directus 404 → 404 registration_not_found
  //   * caller's tg_user_id ≠ owner's → 403 not_your_registration
  //   * row already cancelled → 410 already_cancelled
  //   * event already started → 409 event_started
  async cancel(registrationId: string, tgUserId: bigint): Promise<CancelResult> {
    if (!UUID_RE.test(registrationId)) {
      throw new NotFoundException({ error: 'registration_not_found' });
    }
    const row = await this.findRegistrationForCancel(registrationId);
    if (!row) {
      throw new NotFoundException({ error: 'registration_not_found' });
    }
    const ownerTgId = row.user?.telegram_user_id;
    if (ownerTgId == null || String(ownerTgId) !== tgUserId.toString()) {
      throw new ForbiddenException({ error: 'not_your_registration' });
    }
    if (row.status === 'cancelled') {
      throw new GoneException({ error: 'already_cancelled' });
    }
    // Defensive: event row missing → treat as not_found rather than 500.
    if (!row.event) {
      this.logger.warn(`cancel registration=${registrationId} has no event; refusing`);
      throw new NotFoundException({ error: 'registration_not_found' });
    }
    if (Date.now() >= new Date(row.event.starts_at).getTime()) {
      throw new ConflictException({ error: 'event_started' });
    }
    const cancelledAt = new Date().toISOString();
    await this.directus.patch(`/items/registrations/${encodeURIComponent(registrationId)}`, {
      status: 'cancelled',
      cancelled_at: cancelledAt,
    });
    this.logger.log(
      `cancelled registration=${registrationId} event=${row.event.id} member_tg=${tgUserId}`,
    );
    return {
      registration_id: registrationId,
      event: { id: row.event.id, title: row.event.title },
      cancelled_at: cancelledAt,
    };
  }

  private async findRegistrationForCancel(id: string): Promise<{
    id: string;
    status: string;
    event: { id: string; title: string; starts_at: string } | null;
    user: { telegram_user_id: number | string | null } | null;
  } | null> {
    try {
      const res = await this.directus.get<{
        data: {
          id: string;
          status: string;
          event: { id: string; title: string; starts_at: string } | null;
          user: { telegram_user_id: number | string | null } | null;
        };
      }>(
        `/items/registrations/${encodeURIComponent(id)}?fields=id,status,event.id,event.title,event.starts_at,user.telegram_user_id`,
      );
      return res.data ?? null;
    } catch (err) {
      if (err instanceof DirectusError && (err.status === 404 || err.status === 403)) {
        return null;
      }
      throw err;
    }
  }

  // ─── POST /registrations ──────────────────────────────────────────────────

  async register(input: RegisterInput): Promise<RegistrationResult> {
    // Pull the event + the live schema in one round trip; everything
    // downstream depends on these.
    const event = await this.findEventOrThrow(input.event_id);

    if (event.status !== 'published') {
      throw new BadRequestException({ error: 'event_not_published' });
    }
    if (event.registration_open === false) {
      throw new BadRequestException({ error: 'registration_closed' });
    }

    const schemaFields = event.registration_schema?.fields ?? DEFAULT_REGISTRATION_FIELDS;
    const schemaConsents = event.registration_schema?.consents ?? DEFAULT_REGISTRATION_CONSENTS;

    // Server-side re-validation: bot validates first as a UX hint, but
    // aiqadam is canonical (the bot may be running an outdated schema
    // snapshot if the operator changed it mid-form).
    validateProfile(input.profile, schemaFields);
    validateConsents(input.consents, schemaConsents);

    // Email is a required field per the default schema + by convention
    // for every operator schema (silent member match needs it). Reject
    // schemas that omit it at the bot layer; here we just enforce
    // presence so the caller sees a clean 400 instead of an inscrutable
    // member-create failure.
    const email = typeof input.profile.email === 'string' ? input.profile.email.trim() : '';
    if (!email) {
      throw new BadRequestException({ error: 'profile_missing_email' });
    }
    const displayName =
      typeof input.profile.name === 'string' && input.profile.name.trim().length > 0
        ? input.profile.name.trim()
        : email;

    // Silent member match — two-key lookup so the same TG user retrying
    // with a different email doesn't create a duplicate member.
    //
    // Order matters: tg_user_id FIRST because it's the more reliable
    // identity (the bot can't fake it; httpx + Telegram guarantee it
    // belongs to the chatting user). Email second for the "registered
    // on web before, now coming via the bot" path. Falling all the way
    // through → create a fresh Directus member from the profile.
    const byTg = await this.findMemberByTgUserId(input.telegram_user_id);
    let existing = byTg;
    if (!existing) {
      existing = await this.findMemberByEmail(email);
    }
    let memberId: string;
    let wasNewMember: boolean;
    if (existing) {
      memberId = existing.id;
      wasNewMember = false;
    } else {
      memberId = await this.createMemberFromProfile({
        email,
        displayName,
        country: event.country,
      });
      wasNewMember = true;
    }

    // Backfill TG link fields on the matched/created member if not set
    // already. Best-effort — a failure here doesn't block the registration
    // (the bot has its own opt-out path that resolves by tg_user_id).
    await this.backfillMemberTgLink({
      memberId,
      tgUserId: input.telegram_user_id,
      tgUsername: input.telegram_username,
      existingTgUserId: existing?.telegram_user_id ?? null,
    });

    // Idempotency check — POST /registrations is at-least-once from
    // the bot's perspective (network retries). Pre-check on (event,
    // member_id) catches the canonical case. Also pre-check on (event,
    // telegram_user_id) for the case where the bot user is somehow
    // mid-flight on a member-merge — same TG identity, registration
    // already counted, we don't want a second row for the same person.
    const dupe = await this.findRegistration(input.event_id, memberId);
    if (dupe) {
      throw new ConflictException({
        error: 'already_registered',
        registration_id: dupe.id,
        member_id: memberId,
      });
    }
    const dupeByTg = await this.findRegistrationByTgUserId(input.event_id, input.telegram_user_id);
    if (dupeByTg) {
      throw new ConflictException({
        error: 'already_registered',
        registration_id: dupeByTg.id,
        member_id: dupeByTg.user,
      });
    }

    // #325 — capacity + waitlist branch.
    //
    // Resolve the target status BEFORE inserting:
    //   * No capacity set → 'registered' (unlimited).
    //   * Below capacity → 'registered'.
    //   * At/above capacity + waitlist_enabled → 'waitlisted' (queued).
    //   * At/above capacity + !waitlist_enabled → 400 capacity_full.
    //
    // Race note: capacity check + insert is best-effort. Two concurrent
    // submissions racing the threshold could both land 'registered'
    // (overbook by 1). Operator can resolve in Directus. A strict fix
    // would require a Postgres advisory lock or a sequence — out of
    // scope for v1; logged on overbook.
    const insertStatus = await this.resolveInsertStatus(event);
    if (insertStatus === 'capacity_full') {
      throw new BadRequestException({ error: 'capacity_full' });
    }

    // #277 — server-side idempotency. Insert with race-recovery; see
    // insertRegistrationWithRecovery for the catch-and-requery details.
    const recovery = await this.insertRegistrationWithRecovery({
      eventId: input.event_id,
      memberId,
      profile: input.profile,
      consents: input.consents,
      telegramUserId: input.telegram_user_id,
      telegramUsername: input.telegram_username,
      wasNewMember,
      status: insertStatus,
    });
    if (recovery.kind === 'recovered') {
      // The pre-existing row's status is the truth on a race recovery
      // (we don't know whether to label it 'registered' or 'waitlisted'
      // without re-reading). Bot's pydantic treats absent `status` as
      // 'registered' — fine for the common dup case (same-status repeat).
      return {
        registration_id: recovery.registrationId,
        member_id: memberId,
        was_new_member: false,
        qr_token: null,
        starts_at: event.starts_at,
        title: event.title,
      };
    }
    const registrationId = recovery.registrationId;

    // Consent records are best-effort per-purpose. A single failure
    // doesn't roll back the registration — the registration row carries
    // the consents jsonb as the auditable source of truth.
    await this.recordConsents(memberId, input.consents);

    // Bundle 2 MVP — fire the registration_confirmed push. Fire-and-forget
    // semantics: a failure to enqueue the envelope MUST NOT fail the
    // registration response (the user has already been registered). The
    // outbox publish is itself idempotent (envelopeId UNIQUE); a future
    // cron could backfill missed confirmations by scanning registrations
    // with no corresponding tg_send_log row.
    await this.dispatchRegistrationConfirmed({
      memberId,
      tgUserId: input.telegram_user_id,
      tenant: event.country,
      eventTitle: event.title,
      eventStartsAt: event.starts_at,
      eventLocation: event.location,
    });

    const result: RegistrationResult = {
      registration_id: registrationId,
      member_id: memberId,
      was_new_member: wasNewMember,
      qr_token: null, // Bundle 3 PR-3.3 will populate
      starts_at: event.starts_at,
      title: event.title,
    };
    // #325 — augment with waitlist details when applicable.
    if (insertStatus === 'waitlisted') {
      result.status = 'waitlisted';
      result.waitlist_position = await this.waitlistPositionOf(input.event_id, registrationId);
    }
    return result;
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private async findEventOrThrow(eventId: string): Promise<EventRow> {
    try {
      const res = await this.directus.get<{ data: EventRow }>(
        `/items/events/${encodeURIComponent(eventId)}?fields=id,slug,title,starts_at,country,location,status,visibility_scope,registration_open,registration_schema,capacity,waitlist_enabled`,
      );
      return res.data;
    } catch (err) {
      if (err instanceof DirectusError && (err.status === 404 || err.status === 403)) {
        throw new NotFoundException({ error: 'event_not_found' });
      }
      throw err;
    }
  }

  private async findMemberByEmail(email: string): Promise<DirectusMemberRow | null> {
    const encoded = encodeURIComponent(email);
    const res = await this.directus.get<{ data: DirectusMemberRow[] }>(
      `/users?filter[email][_eq]=${encoded}&fields=id,email,first_name,last_name,telegram_user_id&limit=1`,
    );
    return res.data[0] ?? null;
  }

  // Used by the silent member match: if this TG user already has a
  // Directus member (from a prior /link OR a prior Telegram-as-IdP
  // registration), prefer that member regardless of which email they
  // type this time. Prevents duplicate-member creation when the same
  // user retries with different email variants.
  private async findMemberByTgUserId(tgUserId: bigint): Promise<DirectusMemberRow | null> {
    const encoded = encodeURIComponent(tgUserId.toString());
    const res = await this.directus.get<{ data: DirectusMemberRow[] }>(
      `/users?filter[telegram_user_id][_eq]=${encoded}&fields=id,email,first_name,last_name,telegram_user_id&limit=1`,
    );
    return res.data[0] ?? null;
  }

  private async createMemberFromProfile(input: {
    email: string;
    displayName: string;
    country: string;
  }): Promise<string> {
    const created = await this.directus.post<{ data: { id: string } }>('/users', {
      email: input.email,
      first_name: input.displayName,
      country: input.country,
      provider: 'telegram',
      external_identifier: input.email,
      status: 'active',
      // No password; the user has no Authentik identity yet. They claim
      // one via email verification when they first request web sign-in.
    });
    return created.data.id;
  }

  private async backfillMemberTgLink(input: {
    memberId: string;
    tgUserId: bigint;
    tgUsername: string | null;
    existingTgUserId: number | string | null;
  }): Promise<void> {
    // Only PATCH if not already linked — preserve the original link timestamp.
    if (input.existingTgUserId != null) return;
    try {
      await this.directus.patch(`/users/${input.memberId}`, {
        telegram_user_id: input.tgUserId.toString(),
        telegram_username: input.tgUsername,
        telegram_linked_at: new Date().toISOString(),
        // Re-acquisition clears any prior opt-out — explicit intent.
        telegram_opted_out_at: null,
      });
    } catch (err) {
      const reason = err instanceof DirectusError ? `directus_${err.status}` : 'unknown';
      this.logger.warn(`backfill_tg_link member=${input.memberId} reason=${reason}`);
    }
  }

  private async findRegistration(
    eventId: string,
    memberId: string,
  ): Promise<RegistrationRow | null> {
    const e = encodeURIComponent(eventId);
    const m = encodeURIComponent(memberId);
    // #475 — exclude cancelled rows; only an active row (in the unique
    // index) should trigger the 409 / be returned as the race-recovery winner.
    const res = await this.directus.get<{ data: RegistrationRow[] }>(
      `/items/registrations?filter[event][_eq]=${e}&filter[user][_eq]=${m}&filter[status][_in]=${ACTIVE_REGISTRATION_STATUSES}&fields=id,event,user,checkin_code&limit=1`,
    );
    return res.data[0] ?? null;
  }

  // Companion to findRegistration: catches the case where the same TG
  // identity already has a registration for this event via a DIFFERENT
  // member_id (e.g. operator manually merged members, or stale data
  // from before the tg-uid-first lookup landed). Result drives 409
  // with the original registration_id + the original member_id so the
  // bot UI shows "you're already in" + the correct member identity.
  //
  // #328/#332 — Filter via user.telegram_user_id (canonical column on
  // directus_users) rather than the denormalized
  // registrations.telegram_user_id snapshot, which drifts when
  // silent-email-match resolves to a member whose existing row was
  // written by a different tg_user_id.
  private async findRegistrationByTgUserId(
    eventId: string,
    tgUserId: bigint,
  ): Promise<RegistrationRow | null> {
    const e = encodeURIComponent(eventId);
    const t = encodeURIComponent(tgUserId.toString());
    // #475 — exclude cancelled rows (mirrors findRegistration); a
    // cancelled row under this TG identity must not block re-registration.
    const res = await this.directus.get<{ data: RegistrationRow[] }>(
      `/items/registrations?filter[event][_eq]=${e}&filter[user][telegram_user_id][_eq]=${t}&filter[status][_in]=${ACTIVE_REGISTRATION_STATUSES}&fields=id,event,user,checkin_code&limit=1`,
    );
    return res.data[0] ?? null;
  }

  // #277 — insert + on unique-constraint violation, re-query and
  // return the existing row. Requires the partial unique index in
  // infrastructure/postgres/migrations/2026-05-24-registrations-unique-event-user.sql
  // — applied separately by the operator since Directus's schema API
  // doesn't model partial indexes.
  //
  // Returns either { kind: 'inserted', registrationId } or
  // { kind: 'recovered', registrationId } so the caller can decide
  // whether to run post-insert side effects (recordConsents, dispatch).
  private async insertRegistrationWithRecovery(input: {
    eventId: string;
    memberId: string;
    profile: Record<string, unknown>;
    consents: Record<string, boolean>;
    telegramUserId: bigint;
    telegramUsername: string | null;
    wasNewMember: boolean;
    // #325 — caller resolves capacity first (see resolveInsertStatus).
    status: 'registered' | 'waitlisted';
  }): Promise<{ kind: 'inserted' | 'recovered'; registrationId: string }> {
    try {
      const registrationId = await this.insertRegistration(input);
      return { kind: 'inserted', registrationId };
    } catch (err) {
      if (!this.isUniqueViolation(err)) throw err;
      const recovered = await this.findRegistration(input.eventId, input.memberId);
      if (!recovered) throw err;
      this.logger.warn(
        `register_race_recovered event=${input.eventId} member=${input.memberId} registration=${recovered.id}`,
      );
      return { kind: 'recovered', registrationId: recovered.id };
    }
  }

  // Directus surfaces Postgres unique-constraint violations as 400
  // with a body containing `RECORD_NOT_UNIQUE` in the errors[].extensions.
  // We match on the raw body since DirectusError doesn't parse it.
  private isUniqueViolation(err: unknown): boolean {
    return (
      err instanceof DirectusError && err.status === 400 && err.body.includes('RECORD_NOT_UNIQUE')
    );
  }

  private async insertRegistration(input: {
    eventId: string;
    memberId: string;
    profile: Record<string, unknown>;
    consents: Record<string, boolean>;
    telegramUserId: bigint;
    telegramUsername: string | null;
    wasNewMember: boolean;
    status: 'registered' | 'waitlisted';
  }): Promise<string> {
    const created = await this.directus.post<{ data: { id: string } }>('/items/registrations', {
      event: input.eventId,
      user: input.memberId,
      status: input.status,
      profile: input.profile,
      consents: input.consents,
      telegram_user_id: input.telegramUserId.toString(),
      telegram_username: input.telegramUsername,
      was_new_member: input.wasNewMember,
    });
    return created.data.id;
  }

  // #325 — decide what status the new row should land in. Returns
  // 'registered' (under-capacity OR no cap), 'waitlisted' (full +
  // waitlist_enabled), or 'capacity_full' (full + !waitlist_enabled,
  // caller throws 400). Returns 'registered' on lookup failure so
  // a transient Directus blip doesn't lock new registrations out.
  private async resolveInsertStatus(
    event: EventRow,
  ): Promise<'registered' | 'waitlisted' | 'capacity_full'> {
    if (event.capacity == null) return 'registered';
    const taken = await this.countActiveRegistrations(event.id);
    if (taken < event.capacity) return 'registered';
    if (event.waitlist_enabled) return 'waitlisted';
    return 'capacity_full';
  }

  // #325 — count registrations that consume capacity. Mirrors the
  // partial unique index in the #277 migration: status IN
  // (registered, waitlisted, attended) but excluding waitlisted
  // (waitlisted rows do NOT consume capacity).
  private async countActiveRegistrations(eventId: string): Promise<number> {
    const e = encodeURIComponent(eventId);
    try {
      const res = await this.directus.get<{ data: Array<{ count: { id: number } }> }>(
        `/items/registrations?filter[event][_eq]=${e}&filter[status][_in]=registered,attended&aggregate[count]=id&limit=1`,
      );
      return Number(res.data[0]?.count?.id ?? 0);
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'unknown';
      this.logger.warn(
        `countActiveRegistrations event=${eventId} reason=${reason} — defaulting to 0 (registered)`,
      );
      return 0;
    }
  }

  // #325 — 1-based position in the waitlist. Used in the response for
  // a freshly-waitlisted row. Counts rows older-or-equal to this one
  // (date_created <=) so the just-inserted row gets its true position.
  private async waitlistPositionOf(eventId: string, registrationId: string): Promise<number> {
    const e = encodeURIComponent(eventId);
    const r = encodeURIComponent(registrationId);
    try {
      const ahead = await this.directus.get<{ data: Array<{ id: string }> }>(
        `/items/registrations?filter[event][_eq]=${e}&filter[status][_eq]=waitlisted&filter[id][_neq]=${r}&fields=id,date_created&sort=date_created&limit=1000`,
      );
      // ahead.length older rows are in front; +1 for the caller's row.
      return ahead.data.length + 1;
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'unknown';
      this.logger.warn(
        `waitlistPositionOf event=${eventId} reg=${registrationId} reason=${reason} — defaulting to 1`,
      );
      return 1;
    }
  }

  // Bundle 2 MVP. Renders the hardcoded registration_confirmed template,
  // builds a tg.dispatch.v1 envelope matching TelegramAdapter's shape,
  // and writes it through OutboxPublisher inside a Postgres tx so the
  // relay loop will publish.
  //
  // Fire-and-forget at the caller: a thrown error here is logged + swallowed
  // (returned as void). Idempotency: envelopeId is a fresh UUID per call;
  // re-runs can't double-publish because outbox has a UNIQUE constraint.
  //
  // Future: this will read from tg_push_templates Directus collection
  // (Bundle 2 PR-2.1-templates) instead of the inline template. The
  // envelope shape stays unchanged.
  private async dispatchRegistrationConfirmed(input: {
    memberId: string;
    tgUserId: bigint;
    tenant: string;
    eventTitle: string;
    eventStartsAt: string;
    eventLocation: string | null;
  }): Promise<void> {
    try {
      const text = renderRegistrationConfirmedTemplate({
        eventTitle: input.eventTitle,
        eventStartsAt: input.eventStartsAt,
        eventLocation: input.eventLocation,
      });
      const envelopeId = randomUUID();
      const correlationId = randomUUID();
      const envelope = {
        schema: TELEGRAM_STREAM,
        id: envelopeId,
        occurred_at: new Date().toISOString(),
        correlation_id: correlationId,
        causation_id: null,
        producer: 'aiqadam-api',
        meta: { tenant: input.tenant, intent: 'registration_confirmed' },
        payload: {
          kind: 'dm' as const,
          target: {
            chat_id: Number(input.tgUserId),
            member_id: input.memberId,
            tenant: input.tenant,
          },
          template: {
            text,
            parse_mode: 'None' as const,
            disable_web_page_preview: true,
            media_url: null,
            media_kind: null,
            inline_buttons: null,
          },
          delivery_key: envelopeId,
          max_retries: 5,
          expires_at: null,
        },
      };
      await this.db.transaction(async (tx) => {
        await this.outbox.publish(tx, {
          envelopeId,
          stream: TELEGRAM_STREAM,
          payload: envelope,
        });
      });
      this.logger.debug(
        `registration_confirmed dispatch envelope=${envelopeId} member=${input.memberId}`,
      );
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'unknown';
      this.logger.warn(
        `registration_confirmed dispatch failed (registration persisted, push lost) member=${input.memberId} reason=${reason}`,
      );
    }
  }

  private async recordConsents(memberId: string, consents: Record<string, boolean>): Promise<void> {
    const now = new Date().toISOString();
    for (const [key, granted] of Object.entries(consents)) {
      const purpose = CONSENT_KEY_TO_PURPOSE[key];
      if (!purpose) {
        // Schema-only key (operator-defined; not part of the 7 member_consents
        // purposes). Recorded in registrations.consents but no member_consents
        // row written.
        continue;
      }
      try {
        await this.directus.post('/items/member_consents', {
          member: memberId,
          purpose,
          granted_at: granted ? now : null,
          revoked_at: granted ? null : now,
          source: 'bot_registration',
        });
      } catch (err) {
        const reason = err instanceof DirectusError ? `directus_${err.status}` : 'unknown';
        this.logger.warn(`record_consent purpose=${purpose} member=${memberId} reason=${reason}`);
      }
    }
  }
}

// ─── Pure helpers (exported for tests) ───────────────────────────────────────

export function validateProfile(
  profile: Record<string, unknown>,
  fields: RegistrationField[],
): void {
  for (const field of fields) {
    const value = profile[field.key];
    const missing = value == null || (typeof value === 'string' && value.trim() === '');
    if (field.required && missing) {
      throw new BadRequestException({ error: 'profile_field_required', field: field.key });
    }
    if (missing) continue;

    // Type checks (best-effort; bot does the heavy validation as a UX hint).
    if (field.type === 'email' && typeof value === 'string') {
      // Minimal RFC-shaped check; full validation is the EmailService's job.
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        throw new BadRequestException({ error: 'profile_field_invalid_email', field: field.key });
      }
    }
    if (field.type === 'number' && typeof value !== 'number') {
      throw new BadRequestException({ error: 'profile_field_invalid_number', field: field.key });
    }
    if (field.validation && typeof value === 'string') {
      if (field.validation.min_length != null && value.length < field.validation.min_length) {
        throw new BadRequestException({ error: 'profile_field_too_short', field: field.key });
      }
      if (field.validation.max_length != null && value.length > field.validation.max_length) {
        throw new BadRequestException({ error: 'profile_field_too_long', field: field.key });
      }
    }
  }
}

export function validateConsents(
  consents: Record<string, boolean>,
  required: RegistrationConsent[],
): void {
  for (const consent of required) {
    if (!consent.required) continue;
    if (consents[consent.key] !== true) {
      throw new BadRequestException({ error: 'consent_required', consent: consent.key });
    }
  }
}

export function formatMemberDisplayName(row: {
  first_name: string | null;
  last_name: string | null;
  email: string;
}): string {
  const full = [row.first_name, row.last_name].filter(Boolean).join(' ').trim();
  if (full.length > 0) return full;
  return row.email;
}

// Bundle 2 MVP — hardcoded confirmation template. Moves to
// tg_push_templates Directus collection in PR-2.1-templates with
// {{handlebars}} rendering. For now the template is fixed; only the
// event values vary.
//
// starts_at_localized intentionally renders the raw ISO timestamp
// at first. Locale-aware formatting (per countries.tz from F-S4.5)
// lands when the cron-based reminders (T-24h / T-1h) need the same
// helper. Keeping the MVP free of timezone math means no edge cases
// at confirmation time.
export function renderRegistrationConfirmedTemplate(input: {
  eventTitle: string;
  eventStartsAt: string;
  eventLocation: string | null;
}): string {
  const lines = [`✅ You're registered for ${input.eventTitle}.`, `When: ${input.eventStartsAt}`];
  if (input.eventLocation && input.eventLocation.trim().length > 0) {
    lines.push(`Where: ${input.eventLocation}`);
  }
  return lines.join('\n');
}
