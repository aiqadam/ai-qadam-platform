import { randomBytes } from 'node:crypto';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { AuthentikClient, AuthentikError } from '../admin-invites/authentik.client';
import { DirectusUsersBridgeService } from '../directus/directus-users-bridge.service';
import { DirectusClient } from '../directus/directus.client';
import { InteractionsService } from '../interactions/interactions.service';

// ISS-USR-REG-001 — AI-Qadam-branded self-registration.
//
// Public, rate-limited flow that self-provisions a full member account:
//   1. Honeypot short-circuit (bot trap — same shape as leads.controller.ts).
//   2. Duplicate-email check — never leaks which emails already exist
//      (mirrors leads.service.ts's non-leaking precedent for its own
//      duplicate-lead case). Same success response either way.
//   3. Create the Authentik user (no password yet).
//   4. Set the submitted password. See "Orphaned account" note below for
//      what happens if this step fails after step 3 succeeded.
//   5. Resolve + assign the baseline `aiqadam-member` group.
//   6. Get-or-create the linked Directus member row.
//   7. Write the submitted country onto that row.
//   8. Mint an Authentik recovery link (one-time login URL) and EMAIL it
//      to the registrant rather than returning it to the controller — see
//      "Location-header enumeration fix" below. The controller always
//      redirects to the literal '/v1/auth/login' string, identical to the
//      honeypot/duplicate-email paths.
//
// ── Location-header enumeration fix (SecurityReviewer MAJOR-1, retry pass) ──
//
// Originally, a genuine registration's RegisterResult carried the REAL
// Authentik recovery URL, and the controller 302-redirected straight to
// it — while honeypot/duplicate-email redirected to the literal string
// '/v1/auth/login'. A scripted (non-browser) client could read the
// `Location` header of a single POST and deterministically tell "this
// email is new" (real Authentik URL) apart from "this email already
// exists or was bot-trapped" (`/v1/auth/login`) — a low-noise, one-
// request-per-candidate email-enumeration oracle. See
// 04-security-review.md's "Additional finding" section.
//
// Fix (Option C from the retry brief — matches leads.service.ts's
// established precedent for the *identical* problem): the recovery link
// is no longer returned to the controller at all. Instead, on success,
// this service dispatches it via email using InteractionsService (the
// same one-entry-point-for-outbound-messages abstraction
// leads.service.ts's dispatchVerifyEmail() already uses — allowedChannels:
// ['email'], consentBasis: 'operational_contract', same as the lead
// verify-email dispatch). RegisterResult.recoveryUrl is now ALWAYS the
// literal '/v1/auth/login' string — for genuine success, duplicate email,
// AND honeypot alike. All three paths are now byte-identical at the HTTP
// layer: same status, same header, same Location content. The only
// observable difference is now purely out-of-band (whether an email
// arrives), which a scripted client probing the endpoint cannot observe
// in the same request/response cycle at all.
//
// Email delivery is best-effort (logged + swallowed on failure, mirroring
// dispatchVerifyEmail's own `.catch(...)` — never fail a registration
// that already succeeded in Authentik over a transient mail-provider
// blip). If it fails, the account still exists and is fully usable; the
// registrant can use the normal "forgot password" flow at /v1/auth/login
// to get back in, same recovery path any existing user already has.
//
// ── Orphaned-account mitigation (create succeeds, setPassword fails) ──────
//
// AuthentikClient.getUserByEmail() does NOT filter on is_active (confirmed
// by reading authentik.client.ts — only listActiveUsers() passes
// is_active=true), so a disabled orphan is STILL returned by the duplicate
// check on any retry. Disabling the orphan therefore cannot by itself
// un-block a retry with the same email — that requires an operator to
// intervene (delete the Authentik user, or manually finish provisioning).
//
// Given that, the mitigation here is:
//   - On setPassword failure, call authentik.disableUser(pk) so the
//     orphan is at minimum inert (is_active=false, unusable, cannot sign
//     in, cannot be mistaken for a live account by anything that DOES
//     filter on is_active — e.g. listActiveUsers/RBAC sync).
//   - Log a structured, greppable error (mirrors admin-invites.service.ts's
//     `this.logger.log({ event: ..., ... })` pattern) with the Authentik
//     pk + email so an operator can find and manually clean up (delete the
//     orphan, or finish provisioning by hand) — this is the safety net.
//   - The caller still gets the generic registration-failed error (not a
//     duplicate-email response) — no information about internal state is
//     leaked, and the caller is told to retry/contact support rather than
//     silently told "success" for a registration that didn't complete.
//   - A retry with the same email will hit the duplicate-email branch
//     (step 2) and get the generic success response, same as any other
//     already-registered email — this is intentionally safe-by-default
//     (no enumeration leak) at the cost of requiring operator cleanup
//     before that user can actually register. The structured log above is
//     what makes that cleanup discoverable.
//
// This is a materially different failure class from admin-invites.service's
// create+setPassword sequence: that one runs at invite-creation time (an
// operator action, low volume, operator already knows to check on it) —
// this one runs from anonymous public traffic, so silent orphaning would
// be invisible without the log line.

const MEMBER_GROUP = 'aiqadam-member';

export interface RegisterInput {
  email: string;
  password: string;
  country: 'uz' | 'kz' | 'tj' | 'xx';
  displayName: string;
}

export interface RegisterResult {
  // ALWAYS the literal '/v1/auth/login' string now — see the
  // "Location-header enumeration fix" module doc above. The controller
  // 302-redirects the browser here for every outcome (success, duplicate
  // email, honeypot). On genuine success, the real one-time Authentik
  // login URL is emailed to the registrant instead of being returned
  // here, so it never appears in this endpoint's own HTTP response.
  recoveryUrl: string;
}

@Injectable()
export class RegistrationService {
  private readonly logger = new Logger(RegistrationService.name);

  constructor(
    private readonly authentik: AuthentikClient,
    private readonly directusBridge: DirectusUsersBridgeService,
    private readonly directus: DirectusClient,
    private readonly interactions: InteractionsService,
  ) {}

  async register(input: RegisterInput): Promise<RegisterResult> {
    // Step 2 — duplicate-email check. Must not leak which emails are
    // registered: an existing account (active OR a disabled orphan, see
    // module doc above) gets the SAME success response shape as a fresh
    // registration. We do not touch the existing account in any way.
    const existing = await this.authentik.getUserByEmail(input.email);
    if (existing) {
      this.logger.log({
        event: 'registration.duplicate_email',
        email: input.email,
      });
      return this.fakeSuccessResult();
    }

    // Step 3 — create the Authentik user (no password yet).
    const username = this.deriveUsername(input.email);
    const akUser = await this.authentik
      .createUser({
        email: input.email,
        username,
        name: input.displayName,
        attributes: {},
      })
      .catch((err: unknown) => {
        if (err instanceof AuthentikError && err.status >= 400 && err.status < 500) {
          // Generic — do not surface Authentik's internal reason (could
          // leak account-existence info via a different code path, e.g.
          // a race with another request for the same email).
          throw new BadRequestException('registration_failed');
        }
        throw err;
      });

    // Step 4 — set the submitted password. THIS is the partial-failure
    // risk documented above: if this throws, akUser already exists in
    // Authentik without a password.
    try {
      await this.authentik.setPassword(akUser.pk, input.password);
    } catch (err) {
      await this.authentik.disableUser(akUser.pk).catch((disableErr: unknown) => {
        // Disabling the orphan is best-effort — even if it fails, the
        // structured log below is the real safety net.
        this.logger.warn(
          `registration: failed to disable orphaned Authentik user pk=${akUser.pk} after setPassword failure: ${
            disableErr instanceof Error ? disableErr.message : String(disableErr)
          }`,
        );
      });
      this.logger.log({
        event: 'registration.orphaned_account',
        authentik_user_id: akUser.pk,
        email: input.email,
        reason: err instanceof Error ? err.message : String(err),
      });
      throw new BadRequestException('registration_failed');
    }

    // Step 5 — resolve + assign the baseline member group. Mirrors
    // admin-invites.service.ts's exact two-call sequence.
    const resolvedGroups = await this.authentik.resolveGroupNames([MEMBER_GROUP]);
    await this.authentik.setUserGroups(
      akUser.pk,
      resolvedGroups.map((g) => g.pk),
    );

    // Step 6 — get-or-create the Directus member row (no platform.users
    // row exists yet at this point — it's created lazily on first OIDC
    // callback, same as every other pre-sign-in provisioning path).
    const directusUserId = await this.directusBridge.ensureLinkedByEmail({
      email: input.email,
      displayName: input.displayName,
    });

    // Step 7 — write the submitted country onto the Directus row. Same
    // field TelegramPreferencesService reads (`country`, not
    // `country_preference` — that field doesn't exist in code).
    // ensureLinkedByEmail already logs+swallows its own Directus errors
    // and can return null; if it did, there is no row to patch and we
    // skip rather than throw — registration has already fully succeeded
    // in Authentik at this point, so we must not fail the whole request
    // over a best-effort Directus write.
    if (directusUserId) {
      await this.directus.patch(`/users/${directusUserId}`, { country: input.country }).catch(
        (err: unknown) => {
          this.logger.warn(
            `registration: failed to write country for directusUserId=${directusUserId} email=${input.email}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        },
      );
    } else {
      this.logger.warn(
        `registration: no directusUserId available to write country for email=${input.email}`,
      );
    }

    this.logger.log({
      event: 'registration.created',
      authentik_user_id: akUser.pk,
      email: input.email,
      country: input.country,
    });

    // Step 8 — mint the one-time login URL and EMAIL it rather than
    // returning it to the controller (see "Location-header enumeration
    // fix" module doc above). Best-effort: a mail-provider blip must not
    // fail a registration that has already fully succeeded in Authentik.
    const recoveryUrl = await this.authentik.createRecoveryLink(akUser.pk);
    await this.dispatchWelcomeEmail({
      directusUserId,
      email: input.email,
      displayName: input.displayName,
      recoveryUrl,
    });
    return this.fakeSuccessResult();
  }

  // Sends the one-time Authentik login link by email — the ONLY place the
  // real recoveryUrl is ever transmitted for a self-registration. Mirrors
  // leads.service.ts's dispatchVerifyEmail(): same InteractionsService
  // entry point, same 'operational_contract' consent basis (the
  // registrant just typed their own email into our own form — the same
  // "implicit + immediate" consent reasoning dispatchVerifyEmail's own
  // comment documents), same email-only channel. Requires a
  // directusUserId (InteractionsService.dispatch resolves recipients via
  // audience.userIds, which are Directus UUIDs) — if the Directus bridge
  // couldn't link/create a row (step 6/7's best-effort failure), there is
  // no recipient to dispatch to; log loudly so an operator can find the
  // stranded recovery link via Authentik directly (the account is real
  // and the operator can mint a fresh recovery link by pk from the admin
  // UI), rather than silently dropping it.
  private async dispatchWelcomeEmail(args: {
    directusUserId: string | null;
    email: string;
    displayName: string;
    recoveryUrl: string;
  }): Promise<void> {
    const { directusUserId, email, displayName, recoveryUrl } = args;
    if (!directusUserId) {
      this.logger.warn(
        `registration: no directusUserId available to dispatch welcome email for email=${email} — recovery link not sent, operator must mint one manually via Authentik`,
      );
      return;
    }
    await this.interactions
      .dispatch({
        initiatorActor: 'system',
        audience: { userIds: [directusUserId] },
        intent: 'registration_welcome',
        payload: {
          subject: 'Welcome to AI Qadam — finish signing in',
          text: `Hi ${displayName},\n\nYour AI Qadam account is ready. Tap the link below to sign in for the first time:\n\n${recoveryUrl}\n\nThis link is one-time use and expires shortly, so use it soon. After that, sign in normally at https://aiqadam.org/auth/sign-in.\n\n— AI Qadam`,
        },
        consentBasis: 'operational_contract',
        allowedChannels: ['email'],
      })
      .catch((err: unknown) => {
        this.logger.warn(
          `registration: welcome email dispatch failed for email=${email}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      });
  }

  // Shared terminal result for ALL THREE outcomes — bot-trap,
  // duplicate-email, AND genuine success alike (retry-pass change: see
  // "Location-header enumeration fix" module doc above). The real
  // recovery link, when one exists, has already been emailed by
  // dispatchWelcomeEmail() by the time this is called for the success
  // path; this method itself never has access to a real Authentik user
  // for the bot-trap/duplicate-email callers, so pointing everyone at the
  // normal sign-in flow is also the only thing those two paths COULD do.
  // The name is kept ("fake") because for 2 of the 3 callers it always
  // was a fake result — now the 3rd (genuine success) deliberately
  // matches it byte-for-byte too.
  private fakeSuccessResult(): RegisterResult {
    return { recoveryUrl: '/v1/auth/login' };
  }

  // Derives a unique-enough Authentik username from the email local-part
  // plus a random suffix. Adapted from admin-invites.service.ts's
  // usernameFromDisplayName (same [a-z0-9.] slug rules) — but keyed off
  // the email local-part (no display_name convention to preserve here)
  // and suffixed with random hex because, unlike admin-invites (one
  // invite per email, created by an operator who'd notice a collision),
  // self-registration is public traffic where two different people could
  // plausibly share an email local-part (e.g. same name, different
  // providers) and Authentik's username field is unique.
  private deriveUsername(email: string): string {
    const local = email.split('@')[0] ?? email;
    const slug = local
      .toLowerCase()
      .replace(/[^a-z0-9.]/g, '')
      .replace(/\.+/g, '.')
      .replace(/^\.+|\.+$/g, '');
    const base = slug === '' ? 'user' : slug;
    const suffix = randomBytes(3).toString('hex');
    return `${base}.${suffix}`;
  }
}
