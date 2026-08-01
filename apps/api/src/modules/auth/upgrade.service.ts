import { createHash, randomBytes } from 'node:crypto';
import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { DB, type Db } from '../../db';
import { emailField } from '../../lib/email-schema';
import { env } from '../../config/env';
import { AuthentikClient } from '../admin-invites/authentik.client';
import { type UpgradeIntent, upgradeIntents } from './upgrade-intent.schema';
import { telegramIdSchema } from './telegram-auth.service';

// FR-AUTH-006 — Temporary account upgrade (Telegram-only → full member).
//
// Own sibling service, not folded into TelegramAuthService or AuthService —
// mirrors MagicLinkService's precedent (02-impact-analysis.md's explicit
// recommendation): this is Authentik-attribute + email-verification
// orchestration, closer in shape to MagicLinkService than to
// TelegramAuthService's bot-internal-endpoint surface or AuthService's
// OIDC-flow-only concerns.
//
// ── Mechanism (supersedes 01-requirement-validation.md's original step
//    1(e)/2 ordering — see 02-impact-analysis.md's "Finding #0" for the
//    full source trace; this header restates the conclusion) ──
//
// Two Authentik facts, live-verified by reading Authentik 2024.12.3's
// actual source inside the running container
// (`/authentik/core/api/users.py`'s `recovery_email` action) and querying
// its Django model directly, drive this design:
//
//   1. `AuthentikClient.sendMagicLinkEmail` (→ Authentik's `recovery_email`
//      action) ALWAYS sends to the user's CURRENT on-file `email` — there
//      is no target-email override parameter of any kind, documented or
//      undocumented. So the target email MUST already be on the Authentik
//      user's record before we call sendMagicLinkEmail, not after
//      verification.
//   2. Authentik's `User.email` field has `unique=False` — Authentik does
//      NOT enforce email uniqueness at its own data layer. Our own
//      `getUserByEmail`-based collision check is the ONLY guard preventing
//      a duplicate email across two Authentik users; it must be re-run
//      defensively immediately before every PATCH that sets an email, not
//      just once, earlier.
//
// Given (1), the design is: `requestUpgrade()` (the /upgrade-temp handler)
// does the ENTIRE email-collision-check + email-PATCH itself, synchronously,
// as part of request handling — not deferred to the callback. `is_temporary`
// stays `true` throughout the verification window; only the email-of-record
// changes. `completeUpgrade()` (called from AuthController.callback()) then
// only has to flip `is_temporary=false` and consume the upgrade_intents row
// — the email is already correct by the time callback() runs, since
// completeAuthorization() reads it fresh off the verified id_token.
//
// ── Correlation mechanism: authentikUserPk lookup, NOT a token round-
//    tripped through `next` ──
//
// 01-requirement-validation.md's original mechanism sketched threading the
// upgrade_intents token through the OIDC `next` query param so callback()
// could look the row up by token. This does NOT survive contact with how
// Authentik's magic-link email URL is actually generated: neither
// `AuthentikClient.sendMagicLinkEmail` (→ POST .../recovery_email/) NOR
// `createRecoveryLink` (→ POST .../recovery/) accept ANY caller-supplied
// redirect/state/next parameter — confirmed by reading both methods' own
// doc comments in authentik.client.ts (sendMagicLinkEmail's CORRECTION
// note in particular: the emailed link's target flow is determined
// entirely server-side by Authentik's `_create_recovery_link()`, keyed
// only on `Brand.flow_recovery` resolved from the request's Host header —
// there is no query-string/state channel we control at all). So there is
// no way to put a token in the emailed link's URL in the first place.
//
// Decision: correlate purely by `authentikUserPk`. `callback()` calls
// `tryCompleteUpgrade(email)` with the verified email
// completeAuthorization() just read off the id_token (NOT the OIDC `sub`
// claim, which is Authentik's `hashed_user_id`, not the integer pk this
// table is keyed by — see tryCompleteUpgrade's own doc comment for why
// email, not sub, is the right handle here). This service resolves
// email -> pk (via AuthentikClient.getUserByEmail — the same primitive
// MagicLinkService already uses for its own lookup-or-create step) and
// looks up the most recent live (unexpired, unconsumed) upgrade_intents
// row for that pk, using the existing
// `upgrade_intents_authentik_user_pk_idx` index. The fact that THIS
// specific Authentik user just completed Authentik's own verified
// email-stage flow IS the proof of intent — no separate secret needs to
// round-trip through the browser at all.
//
// Consequence for the migration's `token`/`tokenHash` columns: they
// become VESTIGIAL for this simplified design (not used for correlation),
// but are kept rather than dropped — see this file's requestUpgrade() doc
// comment for why, and 03-code-summary.md for the full write-up of this
// decision.

const UPGRADE_INTENT_TTL_MS = 30 * 60 * 1000; // 30 min — see module doc: capped at-or-below the underlying magic-link email's own Authentik session TTL (~29 min observed for FR-AUTH-004), matching RequirementAnalyst's open-question recommendation.

export const upgradeTempBodySchema = z.object({
  telegramId: telegramIdSchema,
  email: emailField(200),
});

export type UpgradeTempBody = z.infer<typeof upgradeTempBodySchema>;

@Injectable()
export class UpgradeService {
  private readonly logger = new Logger(UpgradeService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly authentik: AuthentikClient,
  ) {}

  // POST /v1/internal/telegram/upgrade-temp's business logic — steps
  // (a)-(g) per the task brief / this file's module doc.
  async requestUpgrade(telegramId: string, targetEmail: string): Promise<{ ok: true }> {
    // (a) Look up the Authentik user by telegram_id.
    const authentikUser = await this.authentik.getUserByTelegramId(telegramId);
    if (!authentikUser) {
      throw new NotFoundException({ error: 'telegram_user_not_found' });
    }

    // (b) Must be a temp account — calling /upgrade twice, or on an
    // already-full account, is a genuinely new error case with no prior
    // art to copy.
    if (authentikUser.attributes.is_temporary !== true) {
      throw new ConflictException({ error: 'not_a_temp_account' });
    }

    // (c) Collision-check the target email. No mutation on this path.
    const collision = await this.authentik.getUserByEmail(targetEmail);
    if (collision && collision.pk !== authentikUser.pk) {
      throw new ConflictException({ error: 'email_already_in_use' });
    }

    // (c-2) SecurityReviewer MAJOR-1 (04-security-review.md): re-check
    // immediately before the PATCH, per setUserEmail's own doc comment
    // ("Callers MUST re-check email availability immediately before
    // calling this"). Step (c) above and this call are NOT the same
    // check reused — a second concurrent /upgrade-temp request for a
    // DIFFERENT temp user could complete its own step (c) in the window
    // between this request's step (c) and here. This doesn't eliminate
    // the race (no distributed lock / Authentik-side unique constraint
    // exists to do that — see module doc and the security review's own
    // recommendation against over-engineering this), but it narrows the
    // check-then-act window to the theoretical minimum for a single-
    // process check achievable here.
    const recheck = await this.authentik.getUserByEmail(targetEmail);
    if (recheck && recheck.pk !== authentikUser.pk) {
      throw new ConflictException({ error: 'email_already_in_use' });
    }

    // (d) PATCH the Authentik user's email to the target address NOW —
    // per Finding #0, this must happen before sendMagicLinkEmail, since
    // that call always emails whatever is currently on-file.
    // `is_temporary` is untouched here — stays `true` until
    // completeUpgrade() runs post-verification.
    await this.authentik.setUserEmail(authentikUser.pk, targetEmail);

    // (e) Mint an upgrade_intents row. The token/tokenHash columns are
    // vestigial for this design's actual correlation mechanism (see
    // module doc — completeUpgrade() correlates by authentikUserPk, not
    // by this token) but are still populated: (1) the migration/schema
    // already define tokenHash NOT NULL UNIQUE, so a value is required
    // regardless; (2) keeping a real, unguessable, hashed value here
    // costs nothing and preserves a forward-compatible audit trail /
    // potential future defense-in-depth check (e.g. "was a token ever
    // issued for this pk") without inventing a second migration later.
    const token = randomBytes(32).toString('base64url');
    const tokenHash = sha256Hex(token);
    const now = new Date();
    await this.db.insert(upgradeIntents).values({
      tokenHash,
      authentikUserPk: authentikUser.pk,
      telegramId,
      targetEmail,
      expiresAt: new Date(now.getTime() + UPGRADE_INTENT_TTL_MS),
    });

    // (f) Trigger Authentik's native magic-link send — now correctly
    // targets the just-patched email (step d). Fail-closed if magic-link
    // isn't configured; this mirrors MagicLinkService.requestMagicLink's
    // own degraded-mode posture for the identical config gap.
    const emailStageUuid = env.AUTHENTIK_MAGIC_LINK_EMAIL_STAGE_UUID;
    const brandDomain = env.AUTHENTIK_MAGIC_LINK_BRAND_DOMAIN;
    if (!emailStageUuid || !brandDomain) {
      this.logger.warn(
        `upgrade-temp: magic-link not configured (telegramId=${telegramId}) — email patched but no verification link sent`,
      );
    } else {
      await this.authentik.sendMagicLinkEmail(authentikUser.pk, emailStageUuid, brandDomain);
    }

    // (g) Anti-enumeration-consistent success shape (AC-7's 409s ARE
    // deliberately specific per RequirementAnalyst — see this method's
    // early-return branches above).
    return { ok: true };
  }

  // AuthController.callback()'s upgrade branch. Takes the verified email
  // completeAuthorization() just returned off the id_token — NOT the OIDC
  // `sub` claim, which is Authentik's `hashed_user_id` (see
  // refresh-token.service.ts's own comment on this), not the integer pk
  // this table is keyed by. Per Finding #0's revised ordering, by the time
  // any browser reaches callback() the Authentik user's email-of-record
  // has ALREADY been patched to the target address in requestUpgrade()
  // step (d) — so the id_token's email claim IS the target email, and
  // resolving pk via AuthentikClient.getUserByEmail is a correct,
  // single-round-trip way to recover it without threading anything
  // through `next` (see module doc for the full correlation-mechanism
  // decision).
  //
  // SecurityReviewer MAJOR-1 (04-security-review.md), part (b) — split
  // into resolve/commit so callback() can defer committing the upgrade
  // until AFTER upsertByAuthentikSubject() has actually succeeded. Chose
  // "reorder" over "catch and revert" (the review's two suggested
  // options): reordering means there is nothing to roll back in the
  // first place — is_temporary is never flipped and the intent row is
  // never consumed until the platform.users write is durable, so a
  // losing racer's Authentik record simply stays is_temporary=true with
  // its intent row still live (and, per AC-8-style "no upgrade pending"
  // semantics, they can retry /upgrade-temp or ride out the TTL and try
  // again — never a mixed state). Catch-and-revert would leave a window,
  // however small, where is_temporary really was false with no member
  // row, and it also means threading a compensating write back through
  // AuthentikClient inside callback()'s existing try/catch — this is the
  // more surgical change: two small methods instead of new error-path
  // branching in an already-delicate method.
  //
  // resolvePendingUpgrade(): side-effect-free. Resolves the Authentik pk
  // for `email` and looks up the most recent live (unexpired, unconsumed)
  // upgrade_intents row for that pk. Returns null when there's no upgrade
  // pending (AC-8's overwhelmingly common case: every ordinary sign-in) —
  // never throws for that case, since an ordinary sign-in must never be
  // describable as broken by upgrade-branch edge cases.
  async resolvePendingUpgrade(email: string): Promise<PendingUpgrade | null> {
    const authentikUser = await this.authentik.getUserByEmail(email);
    if (!authentikUser) {
      return null;
    }

    const now = new Date();
    const [intent] = await this.db
      .select()
      .from(upgradeIntents)
      .where(
        and(
          eq(upgradeIntents.authentikUserPk, authentikUser.pk),
          isNull(upgradeIntents.consumedAt),
          gt(upgradeIntents.expiresAt, now),
        ),
      )
      .orderBy(desc(upgradeIntents.createdAt))
      .limit(1);

    if (!intent) {
      return null;
    }

    return { intent, authentikUserPk: authentikUser.pk };
  }

  // commitUpgrade(): the actual mutation — flips is_temporary=false
  // (merge-patch, preserving telegram_id) and consumes the intent row.
  // Callers MUST only invoke this AFTER whatever platform-side write the
  // upgrade is gating on (callback()'s upsertByAuthentikSubject) has
  // already succeeded — see this method's callback()-side comment for
  // why. The email is NOT patched here — it was already corrected in
  // requestUpgrade() step (d), per Finding #0's revised ordering.
  // Re-fetches the Authentik user fresh (not trusting any value cached
  // since resolvePendingUpgrade) so the attributes merge is never stale.
  async commitUpgrade(pending: PendingUpgrade): Promise<void> {
    const authentikUser = await this.authentik.getUserById(pending.authentikUserPk);
    if (!authentikUser) {
      // Extremely unlikely (the user just completed an Authentik-verified
      // session against this exact pk) but defensive: treat as no-op
      // rather than throw and break sign-in.
      this.logger.warn(
        `upgrade: authentikUserPk=${pending.authentikUserPk} not found at completion time — skipping`,
      );
      return;
    }

    await this.authentik.patchAttributes(pending.authentikUserPk, {
      ...authentikUser.attributes,
      is_temporary: false,
    });

    await this.db
      .update(upgradeIntents)
      .set({ consumedAt: new Date() })
      .where(eq(upgradeIntents.id, pending.intent.id));
  }
}

export interface PendingUpgrade {
  intent: UpgradeIntent;
  authentikUserPk: number;
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}
