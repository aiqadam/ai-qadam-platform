import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { and, eq, gt, lt, sql } from 'drizzle-orm';
import { DB, type Db } from '../../db';
import { DirectusClient, DirectusError } from '../directus/directus.client';
import { EmailService } from '../email/email.service';
import { telegramLinkCode } from '../email/templates/telegram-link-code';
import { tgLinkChallenges } from './schema';

// Business logic for the bot's account-link flow per ADR-0034 §"NestJS-side
// endpoints (the sync surface)". Owns the OTP lifecycle (issue, verify,
// consume) and the Directus write that persists the link on
// directus_users.

// ─── Constants ────────────────────────────────────────────────────────────────

// 6-digit code lifetime. Long enough for an email round-trip on a slow
// connection; short enough to limit replay window if the email is leaked.
const CODE_TTL_MS = 5 * 60 * 1000;
const CODE_TTL_MIN = 5;

// Per-tg_user_id ceiling for active (unconsumed, unexpired) challenges.
// Throttles "send me a code" spam from a single TG account.
const MAX_ACTIVE_CHALLENGES_PER_TG_USER = 3;

// Per-challenge ceiling for confirm attempts. After this many wrong-code
// submissions the challenge is invalidated.
const MAX_CONFIRM_ATTEMPTS = 5;

// ─── Types ────────────────────────────────────────────────────────────────────

interface DirectusUserRow {
  id: string;
  email: string;
  // Directus collection extension fields (see PR description on A3 +
  // ADR-0034 §"Component layout"). These exist as nullable columns on
  // directus_users; operator task to add them before A2 ships in prod.
  country?: string | null;
  telegram_user_id?: number | string | null; // bigint may serialize as string
  telegram_username?: string | null;
  telegram_linked_at?: string | null;
  telegram_opted_out_at?: string | null;
}

export interface LinkStartResult {
  challengeId: string;
  sentToEmailMasked: string;
}

export interface LinkConfirmResult {
  memberId: string;
  tenant: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly directus: DirectusClient,
    private readonly emails: EmailService,
  ) {}

  // ─── /link/start ────────────────────────────────────────────────────────────

  async startLink(tgUserId: bigint, email: string): Promise<LinkStartResult> {
    await this.enforceRateLimit(tgUserId);

    // Issue + persist the code regardless of whether the email matches
    // a member. Returning an "ok" envelope either way prevents email
    // enumeration. We still SEND the email only if a member exists —
    // sending to arbitrary addresses would be a free spam vector.
    const code = generateSixDigitCode();
    const challenge = await this.persistChallenge(tgUserId, email, code);
    const member = await this.findDirectusUserByEmail(email);
    await this.maybeSendCodeEmail({ email, code, memberExists: member !== null });
    return {
      challengeId: challenge.id,
      sentToEmailMasked: maskEmail(email),
    };
  }

  private async enforceRateLimit(tgUserId: bigint): Promise<void> {
    const activeCount = await this.activeChallengeCount(tgUserId);
    if (activeCount >= MAX_ACTIVE_CHALLENGES_PER_TG_USER) {
      // Soft-deny: don't leak whether the email exists or rate state.
      // The bot tells the user "try again in a minute" generically.
      throw new BadRequestException('rate_limited');
    }
  }

  private async persistChallenge(
    tgUserId: bigint,
    email: string,
    code: string,
  ): Promise<{ id: string }> {
    const codeHash = sha256Hex(code);
    const expiresAt = new Date(Date.now() + CODE_TTL_MS);
    const [inserted] = await this.db
      .insert(tgLinkChallenges)
      .values({ tgUserId, email, codeHash, expiresAt })
      .returning({ id: tgLinkChallenges.id });
    if (!inserted) {
      // Should be unreachable — Drizzle returns the inserted row on success.
      throw new Error('tg_link_challenges insert returned no row');
    }
    return inserted;
  }

  private async maybeSendCodeEmail(opts: {
    email: string;
    code: string;
    memberExists: boolean;
  }): Promise<void> {
    if (!opts.memberExists) {
      this.logger.debug(`telegram-link: no member for ${maskEmail(opts.email)}; silent`);
      return;
    }
    const message = telegramLinkCode({
      recipientEmail: opts.email,
      code: opts.code,
      expiresInMinutes: CODE_TTL_MIN,
    });
    try {
      await this.emails.send(message);
    } catch (err) {
      // Email failure shouldn't leak; treat as if sent. Log loudly.
      const reason = err instanceof Error ? err.message : 'unknown';
      this.logger.warn(`telegram-link email send failed for ${maskEmail(opts.email)}: ${reason}`);
    }
  }

  // ─── /link/confirm ──────────────────────────────────────────────────────────

  async confirmLink(input: {
    challengeId: string;
    code: string;
    tgUserId: bigint;
    tgUsername: string | null;
  }): Promise<LinkConfirmResult> {
    const challenge = await this.loadValidChallenge(input.challengeId, input.tgUserId, input.code);
    const member = await this.resolveMemberOrThrow(challenge.email);
    await this.writeLinkToDirectus(challenge.id, member.id, input);
    await this.db
      .update(tgLinkChallenges)
      .set({ consumedAt: new Date() })
      .where(eq(tgLinkChallenges.id, challenge.id));
    // tenant is validated non-empty inside resolveMemberOrThrow.
    return { memberId: member.id, tenant: member.country ?? '' };
  }

  private async loadValidChallenge(
    challengeId: string,
    tgUserId: bigint,
    code: string,
  ): Promise<{ id: string; email: string; codeHash: string }> {
    const now = new Date();
    const [challenge] = await this.db
      .select()
      .from(tgLinkChallenges)
      .where(eq(tgLinkChallenges.id, challengeId))
      .limit(1);

    if (
      !challenge ||
      challenge.consumedAt ||
      challenge.expiresAt <= now ||
      challenge.attempts >= MAX_CONFIRM_ATTEMPTS
    ) {
      throw new UnauthorizedException('invalid_code');
    }
    // The same TG account that started the challenge must confirm it.
    // Anchors the link to a single Telegram identity — even if the email
    // is shared / leaked, only the original tg_user_id can complete.
    if (challenge.tgUserId !== tgUserId) {
      await this.bumpAttempts(challenge.id);
      throw new UnauthorizedException('invalid_code');
    }
    if (!this.codeMatches(code, challenge.codeHash)) {
      await this.bumpAttempts(challenge.id);
      throw new UnauthorizedException('invalid_code');
    }
    return challenge;
  }

  private codeMatches(provided: string, expectedHash: string): boolean {
    const providedHash = sha256Hex(provided);
    return (
      providedHash.length === expectedHash.length &&
      timingSafeEqual(Buffer.from(providedHash), Buffer.from(expectedHash))
    );
  }

  private async resolveMemberOrThrow(email: string): Promise<DirectusUserRow> {
    const member = await this.findDirectusUserByEmail(email);
    if (!member) {
      // Email-enum-safe path: /link/start was called for a non-member, the
      // user typed the right code, but no member exists. Surface as 404 so
      // the bot can show "no AI Qadam account for this email".
      throw new NotFoundException('member_not_found');
    }
    if (!member.country) {
      this.logger.warn(`directus_user ${member.id} has no country; rejecting link`);
      throw new BadRequestException('member_missing_tenant');
    }
    return member;
  }

  private async writeLinkToDirectus(
    challengeId: string,
    memberId: string,
    input: { tgUserId: bigint; tgUsername: string | null },
  ): Promise<void> {
    try {
      await this.directus.patch(`/users/${memberId}`, {
        telegram_user_id: input.tgUserId.toString(),
        telegram_username: input.tgUsername,
        telegram_linked_at: new Date().toISOString(),
        // Re-linking clears any prior opt-out — explicit intent to receive.
        telegram_opted_out_at: null,
      });
    } catch (err) {
      const reason = err instanceof DirectusError ? `directus_${err.status}` : 'unknown';
      this.logger.error(`telegram-link directus PATCH failed for ${memberId}: ${reason}`);
      await this.bumpAttempts(challengeId);
      throw new BadRequestException('link_write_failed');
    }
  }

  // ─── /opt-out ──────────────────────────────────────────────────────────────

  async optOut(memberId: string): Promise<void> {
    // Idempotent: setting telegram_opted_out_at when already set is a no-op
    // semantically. The Directus side is the source of truth.
    try {
      await this.directus.patch(`/users/${memberId}`, {
        telegram_opted_out_at: new Date().toISOString(),
      });
    } catch (err) {
      if (err instanceof DirectusError && err.status === 404) {
        throw new NotFoundException('member_not_found');
      }
      throw err;
    }
  }

  // ─── Cleanup (call from a cron / on read) ──────────────────────────────────

  /** Delete consumed + expired challenges older than `olderThan`. */
  async purgeOldChallenges(olderThan: Date): Promise<number> {
    const result = await this.db
      .delete(tgLinkChallenges)
      .where(lt(tgLinkChallenges.expiresAt, olderThan))
      .returning({ id: tgLinkChallenges.id });
    return result.length;
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private async activeChallengeCount(tgUserId: bigint): Promise<number> {
    const now = new Date();
    const rows = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(tgLinkChallenges)
      .where(
        and(
          eq(tgLinkChallenges.tgUserId, tgUserId),
          gt(tgLinkChallenges.expiresAt, now),
          sql`${tgLinkChallenges.consumedAt} IS NULL`,
        ),
      );
    return rows[0]?.count ?? 0;
  }

  private async bumpAttempts(challengeId: string): Promise<void> {
    await this.db
      .update(tgLinkChallenges)
      .set({ attempts: sql`${tgLinkChallenges.attempts} + 1` })
      .where(eq(tgLinkChallenges.id, challengeId));
  }

  private async findDirectusUserByEmail(email: string): Promise<DirectusUserRow | null> {
    const encoded = encodeURIComponent(email);
    const lookup = await this.directus.get<{ data: DirectusUserRow[] }>(
      `/users?filter[email][_eq]=${encoded}&fields=id,email,country,telegram_user_id,telegram_username,telegram_linked_at,telegram_opted_out_at&limit=1`,
    );
    return lookup.data[0] ?? null;
  }
}

// ─── Standalone helpers (exported for tests) ────────────────────────────────

export function sha256Hex(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

export function generateSixDigitCode(): string {
  // Cryptographically secure 0–999999 → zero-padded to 6 digits.
  // randomInt is uniform over the half-open range.
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***@***';
  const head = local.slice(0, 1);
  const tail = local.length > 1 ? '***' : '';
  return `${head}${tail}@${domain}`;
}
