import { randomBytes } from 'node:crypto';
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { z } from 'zod';
import { env } from '../../config/env';
import { emailField } from '../../lib/email-schema';
import { AuthentikClient, AuthentikError } from '../admin-invites/authentik.client';

// FR-AUTH-004 — magic-link (passwordless email) sign-in request.
//
// A third, distinct identity-resolution path alongside registration.service.ts
// (email/password) and telegram-auth.service.ts (Telegram Login Widget) —
// kept as its own sibling service rather than folded into auth.service.ts
// (OIDC-flow-only) or telegram-auth.service.ts (Telegram-identity-only),
// per 02-impact-analysis.md's explicit recommendation.
//
// Flow (see 07-test-results.md's CRITICAL FINDING + 02b-authentik-spike-
// findings.md's correction note for the empirically-resolved mechanism —
// the ORIGINAL understanding below was proven wrong by a live send-and-
// read-the-real-email test and has since been corrected):
//   1. Look up the Authentik user by email.
//   2. If not found, create one — a magic-link request for an email with
//      no existing account self-registers them, same posture as
//      TelegramAuthService.exchangeWidgetPayload's create-if-absent
//      pattern. Unlike Telegram's synthetic tg<id>@telegram.local
//      workaround, magic-link always has a real user-supplied email, so
//      no synthetic domain is needed.
//   3. Call AuthentikClient.sendMagicLinkEmail(pk, emailStageUuid,
//      brandDomain) — this triggers Authentik's OWN native email send
//      (POST .../recovery_email/?email_stage=<uuid>, 204 No Content, sent
//      with a Host header equal to brandDomain). No link/token ever
//      passes through this process, so there is nothing for
//      requestMagicLink()'s return value to leak. The email_stage param
//      only controls the sent email's subject/template — the emailed
//      link's TARGET FLOW is controlled separately, by which Authentik
//      Brand resolves for the request (Authentik resolves Brand per-
//      request Host header; a second Brand, reachable only via this
//      specific Host value, has its flow_recovery bound to the
//      magic-link-login flow — see AuthentikClient.sendMagicLinkEmail's
//      own doc comment for the full mechanism and how it was confirmed).
//      brandDomain is read from AUTHENTIK_MAGIC_LINK_BRAND_DOMAIN, the
//      same "operator runs the provisioning script, pastes its printed
//      output into env" pattern as AUTHENTIK_MAGIC_LINK_EMAIL_STAGE_UUID.
//
// Anti-enumeration posture (mandatory per 02-impact-analysis.md Risk Flag
// #2 — designed in from the start, not retrofitted the way register.ts's
// honeypot/duplicate-email collapse was): AuthController.magicLink() calls
// this method and ALWAYS responds { ok: true } regardless of outcome. This
// service itself does not return a discriminated result for "found" vs.
// "created" vs. "failed" — callers only need to know "did we throw a hard
// 5xx," and even that is swallowed by the controller into the same { ok:
// true } shape except for the genuinely-unreachable-dependency case (see
// requestMagicLink's own doc comment below for the trade-off).

export const magicLinkRequestSchema = z.object({
  email: emailField(200),
});

export type MagicLinkRequestBody = z.infer<typeof magicLinkRequestSchema>;

@Injectable()
export class MagicLinkService {
  private readonly logger = new Logger(MagicLinkService.name);

  constructor(private readonly authentik: AuthentikClient) {}

  // Looks up or creates the Authentik user for `email`, then triggers
  // Authentik's native magic-link email send.
  //
  // Error posture (02-impact-analysis.md Risk Flag #4 + this workflow's
  // own task brief — "lean toward matching this codebase's existing
  // 'Authentik is a hard dependency, surfaced as 502/503' convention
  // UNLESS that would create a distinguishable-response enumeration
  // oracle"): a genuine Authentik-unreachable failure (network error, 5xx,
  // or an AuthentikError of any status) is swallowed HERE and logged, not
  // rethrown — the caller (AuthController.magicLink) always returns
  // { ok: true } no matter what this method does internally. This differs
  // from telegram-auth.service.ts's getBotToken(), which throws
  // ServiceUnavailableException for a *configuration* gap (missing bot
  // token) that every caller hits identically and uniformly, which is not
  // an enumeration oracle since it never varies by the submitted email.
  // An Authentik outage while processing ONE specific email, by contrast,
  // could in principle vary by request in ways an attacker's timing/retry
  // probing might exploit (e.g. a transient failure on user creation vs.
  // a clean lookup-hit path) — so the safer, security-first choice is
  // "always 200," accepting the trade-off that a total Authentik outage
  // is invisible to the caller (documented in
  // 03-code-summary.md's Known Limitations). The one exception: if the
  // Authentik admin client is not configured at all (env var missing),
  // that is a deployment/config gap identical for every request
  // regardless of email — same shape as getBotToken()'s 503 — so this
  // still surfaces as ServiceUnavailableException, matching the
  // documented convention for that class of failure.
  async requestMagicLink(email: string): Promise<void> {
    if (!this.authentik.isConfigured()) {
      throw new ServiceUnavailableException('authentik_not_configured');
    }
    const emailStageUuid = env.AUTHENTIK_MAGIC_LINK_EMAIL_STAGE_UUID;
    if (!emailStageUuid) {
      throw new ServiceUnavailableException('magic_link_not_configured');
    }
    // See this file's header comment + AuthentikClient.sendMagicLinkEmail's
    // doc comment: this Host-header value is what actually determines
    // which Authentik flow the sent email's link targets. Same degraded-
    // mode pattern as emailStageUuid above — both are required for the
    // send to route correctly, so both fail the request closed.
    const brandDomain = env.AUTHENTIK_MAGIC_LINK_BRAND_DOMAIN;
    if (!brandDomain) {
      throw new ServiceUnavailableException('magic_link_not_configured');
    }

    try {
      let user = await this.authentik.getUserByEmail(email);
      if (!user) {
        user = await this.createMagicLinkUser(email);
      }
      await this.authentik.sendMagicLinkEmail(user.pk, emailStageUuid, brandDomain);
    } catch (err) {
      // Swallowed by design — see this method's doc comment above. Never
      // rethrown past this point: the controller must return { ok: true }
      // whether the email resolved to an existing user, a newly-created
      // one, or hit an internal error partway through.
      const reason = err instanceof AuthentikError ? err.message : String(err);
      this.logger.warn(`magic-link: request failed for email=${email}: ${reason}`);
    }
  }

  // Creates a full (non-temporary) Authentik user for a magic-link
  // request where the email did not previously exist. Mirrors
  // telegram-auth.service.ts's createTelegramUser shape, but uses the
  // real submitted email directly — no synthetic domain needed.
  private async createMagicLinkUser(email: string) {
    const username = this.deriveUsername(email);
    return this.authentik.createUser({
      email,
      username,
      name: email.split('@')[0] ?? username,
      attributes: {},
    });
  }

  // Derives a unique-enough Authentik username from the email local-part.
  // Mirrors registration.service.ts's deriveUsername exactly (same
  // [a-z0-9.] slug rules + randomBytes-suffix collision guard — public
  // traffic where two different people could plausibly share an email
  // local-part is the same risk class here as self-registration).
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
