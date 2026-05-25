import { Injectable, Logger } from '@nestjs/common';
import { env } from '../../config/env';
import { DirectusClient } from '../directus/directus.client';
import { EmailService } from '../email/email.service';
import { firstEventWelcome } from '../email/templates/first-event-welcome';

// C-4b-2 — BadgeAwarderService.
//
// Reads the operator-editable badge_definitions taxonomy and decides
// which badges a member earns when their state changes. Idempotent
// at the storage layer: member_badges rows are keyed by
// (user, badge_type, source_ref) and we check before insert.
//
// This first slice handles `count_attended` rules only. Streak,
// profile_complete, early_member, referee_attended_count, and the
// first-event-welcome email trigger come in follow-up PRs (the
// service surface is shaped to accept them — see TODOs below).
//
// Cache: badge_definitions is read on every call right now (1 small
// Directus round-trip). If/when this becomes a hot path, swap to a
// 5-minute in-memory TTL — the data is operator-edited, not
// performance-critical to be fresh.

type BadgeCategory = 'role' | 'achievement' | 'special';
type BadgeAwardRule =
  | 'manual'
  | 'count_attended'
  | 'streak_months'
  | 'profile_complete'
  | 'referee_attended_count'
  | 'early_member';

interface BadgeDefinitionRow {
  key: string;
  category: BadgeCategory;
  award_rule: BadgeAwardRule;
  threshold: number | null;
  active: boolean;
}

@Injectable()
export class BadgeAwarderService {
  private readonly logger = new Logger(BadgeAwarderService.name);

  constructor(
    private readonly directus: DirectusClient,
    private readonly email: EmailService,
  ) {}

  // C-4b-2b — first-event-welcome dispatch.
  //
  // Called from registrations register() right after the row is inserted.
  // If this is the user's first-ever registration (any status), fires the
  // welcome email (template at apps/api/src/modules/email/templates/
  // first-event-welcome.ts). Idempotent because the "first-ever" check
  // counts the user's total registrations; if they cancelled and
  // re-registered, they don't get a second welcome.
  //
  // Failure is swallowed — never blocks the register() flow.
  async onRegistrationCreated(input: {
    directusUserId: string;
    recipientEmail: string;
    recipientName?: string | undefined;
    eventTitle: string;
    eventStartsAt: Date;
  }): Promise<void> {
    try {
      const total = await this.countRegistrationsFor(input.directusUserId);
      if (total > 1) return; // not their first
      const message = firstEventWelcome({
        recipientEmail: input.recipientEmail,
        ...(input.recipientName ? { recipientName: input.recipientName } : {}),
        eventTitle: input.eventTitle,
        eventStartsAt: input.eventStartsAt,
        webBaseUrl: env.WEB_BASE_URL,
      });
      await this.email.send(message);
      this.logger.log(
        `first-event-welcome sent to=${input.recipientEmail} event=${input.eventTitle}`,
      );
    } catch (err) {
      this.logger.warn(
        `onRegistrationCreated failed user=${input.directusUserId}: ${err instanceof Error ? err.message : 'unknown'}`,
      );
    }
  }

  // Called from registrations checkin() after status flips to 'attended'.
  // Failure must never block check-in — wrap in try/catch at the caller.
  async onAttendanceRecorded(input: {
    refereeUserId: string; // Directus user id of the attendee
    eventId: string;
  }): Promise<void> {
    const attendedCount = await this.countAttendedFor(input.refereeUserId);
    const defs = await this.activeCountAttendedDefs();
    for (const def of defs) {
      if (def.threshold == null) continue;
      if (attendedCount < def.threshold) continue;
      await this.awardOnce({
        userId: input.refereeUserId,
        badgeKey: def.key,
        sourceRef: input.eventId,
      });
    }
  }

  // ─── internals ────────────────────────────────────────────────────────

  private async countRegistrationsFor(directusUserId: string): Promise<number> {
    const filter = encodeURIComponent(JSON.stringify({ user: { _eq: directusUserId } }));
    const body = await this.directus.get<{ data: Array<{ count: { id: number | string } }> }>(
      `/items/registrations?filter=${filter}&aggregate[count]=id`,
    );
    return Number(body.data[0]?.count?.id ?? 0);
  }

  private async countAttendedFor(directusUserId: string): Promise<number> {
    const filter = encodeURIComponent(
      JSON.stringify({
        _and: [{ user: { _eq: directusUserId } }, { status: { _eq: 'attended' } }],
      }),
    );
    const body = await this.directus.get<{ data: Array<{ count: { id: number | string } }> }>(
      `/items/registrations?filter=${filter}&aggregate[count]=id`,
    );
    return Number(body.data[0]?.count?.id ?? 0);
  }

  private async activeCountAttendedDefs(): Promise<BadgeDefinitionRow[]> {
    const params = new URLSearchParams({
      'filter[active][_eq]': 'true',
      'filter[award_rule][_eq]': 'count_attended',
      fields: 'key,category,award_rule,threshold,active',
      limit: '50',
      sort: 'threshold',
    });
    const body = await this.directus.get<{ data: BadgeDefinitionRow[] }>(
      `/items/badge_definitions?${params.toString()}`,
    );
    return body.data;
  }

  // Insert iff no matching member_badges row exists. Dedupe key is
  // (user, badge_type, source_ref). For count_attended badges,
  // source_ref is the event id that pushed them over the threshold —
  // collision after that point means a re-run of checkin, which is
  // already short-circuited upstream but we belt-and-suspenders here.
  private async awardOnce(input: {
    userId: string;
    badgeKey: string;
    sourceRef: string;
  }): Promise<void> {
    try {
      const filter = encodeURIComponent(
        JSON.stringify({
          _and: [{ user: { _eq: input.userId } }, { badge_type: { _eq: input.badgeKey } }],
        }),
      );
      const existing = await this.directus.get<{ data: Array<{ id: string }> }>(
        `/items/member_badges?filter=${filter}&fields=id&limit=1`,
      );
      if (existing.data.length > 0) return;
      await this.directus.post('/items/member_badges', {
        user: input.userId,
        badge_type: input.badgeKey,
        source_ref: input.sourceRef,
      });
      this.logger.log(
        `awarded badge ${input.badgeKey} to user=${input.userId} src=${input.sourceRef}`,
      );
    } catch (err) {
      this.logger.warn(
        `awardOnce failed user=${input.userId} badge=${input.badgeKey}: ${err instanceof Error ? err.message : 'unknown'}`,
      );
    }
  }
}
