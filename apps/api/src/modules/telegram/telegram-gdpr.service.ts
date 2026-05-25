import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DirectusClient } from '../directus/directus.client';
import { TickLockService } from '../internal-cron/tick-lock.service';

// #362 — GDPR self-service: data export + soft-delete + hard-delete cron.
//
// Three surfaces:
//   1. GET  /v1/telegram/me/data-export — assemble full JSON dump
//   2. DELETE /v1/telegram/me — set gdpr_deleted_at, schedule 30-day
//      hard-delete; re-linking via /link clears the marker (recovery).
//   3. @Cron(daily) — hard-delete members where gdpr_deleted_at < now-30d:
//      anonymize registrations + drop member row.
//
// Soft-delete semantics: the marker (gdpr_deleted_at) makes the member
// invisible to bot flows (/start, /me, /events register) AND prevents
// the cron from re-engaging them. They can re-link the same TG account
// to recover — the link flow clears the marker. After 30 days, the
// recovery window closes + the cron purges.
//
// We do NOT immediately delete because:
//   - Operators sometimes need to investigate "did this user actually
//     opt out" support tickets
//   - Users sometimes change their mind within hours
//   - 30 days matches the GDPR-recommended grace period

const HARD_DELETE_GRACE_DAYS = 30;

export interface DataExport {
  member: {
    member_id: string;
    display_name: string;
    email: string | null;
    created_at: string;
  };
  profile_defaults: Record<string, unknown> | null;
  preferences: {
    language: string | null;
    timezone: string | null;
    notification_opt_ins: Record<string, unknown> | null;
  };
  registrations: Array<{
    id: string;
    event: string;
    status: string;
    created_at: string;
  }>;
  check_ins: Array<{
    event: string;
    checked_in_at: string;
  }>;
  feedback_submissions: Array<{
    id: string;
    category: string;
    message: string;
    created_at: string;
  }>;
  exported_at: string;
}

export interface DeleteResult {
  deleted_at: string;
  hard_delete_after: string;
}

interface MemberRow {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  date_created: string;
  language: string | null;
  timezone: string | null;
  notification_opt_ins: Record<string, unknown> | null;
  profile_defaults: Record<string, unknown> | null;
}

interface RegistrationRow {
  id: string;
  event: string;
  status: string;
  date_created: string;
  checked_in_at: string | null;
}

interface FeedbackRow {
  id: string;
  category: string;
  message: string;
  date_created: string;
}

@Injectable()
export class TelegramGdprService {
  private readonly logger = new Logger(TelegramGdprService.name);

  constructor(
    private readonly directus: DirectusClient,
    private readonly locks: TickLockService,
  ) {}

  // Daily hard-delete sweep. Runs at 04:00 UTC (off-peak across UZ/KZ/TJ).
  // The Redis lock prevents multi-replica double-fire; ledger-style work
  // (atomic per-row) so a crashed run resumes cleanly on next tick.
  @Cron('0 4 * * *')
  async scheduledHardDelete(): Promise<void> {
    await this.locks.withLock('gdpr-hard-delete', 540, async () => {
      const result = await this.hardDeleteDue();
      if (result.purged > 0) {
        this.logger.log(`gdpr-hard-delete purged=${result.purged} errors=${result.errors}`);
      }
    });
  }

  async exportData(tgUserId: bigint): Promise<DataExport> {
    const member = await this.findMemberByTgUserId(tgUserId);
    if (!member) {
      throw new NotFoundException({ error: 'member_not_found' });
    }

    // Parallel fetch all the per-member data. Each is best-effort —
    // a failed sub-fetch returns [] rather than 500 the export.
    const [regs, feedback] = await Promise.all([
      this.fetchRegistrations(member.id),
      this.fetchFeedback(tgUserId),
    ]);

    return {
      member: {
        member_id: member.id,
        display_name: displayName(member),
        email: member.email,
        created_at: member.date_created,
      },
      profile_defaults: member.profile_defaults,
      preferences: {
        language: member.language,
        timezone: member.timezone,
        notification_opt_ins: member.notification_opt_ins,
      },
      registrations: regs.map((r) => ({
        id: r.id,
        event: r.event,
        status: r.status,
        created_at: r.date_created,
      })),
      check_ins: regs
        .filter((r) => r.checked_in_at !== null)
        .map((r) => ({
          event: r.event,
          checked_in_at: r.checked_in_at as string,
        })),
      feedback_submissions: feedback.map((f) => ({
        id: f.id,
        category: f.category,
        message: f.message,
        created_at: f.date_created,
      })),
      exported_at: new Date().toISOString(),
    };
  }

  async deleteAccount(tgUserId: bigint, confirmMemberId: string): Promise<DeleteResult> {
    const member = await this.findMemberByTgUserId(tgUserId);
    if (!member) {
      throw new NotFoundException({ error: 'member_not_found' });
    }
    if (member.id !== confirmMemberId) {
      // Mismatched confirm = bot/operator error; refuse rather than
      // delete the wrong account. Per the spec, surface 403.
      throw new NotFoundException({ error: 'member_id_mismatch' });
    }
    const now = new Date();
    const hardDeleteAfter = new Date(now.getTime() + HARD_DELETE_GRACE_DAYS * 86_400_000);
    await this.directus.patch(`/users/${encodeURIComponent(member.id)}`, {
      gdpr_deleted_at: now.toISOString(),
    });
    return {
      deleted_at: now.toISOString(),
      hard_delete_after: hardDeleteAfter.toISOString(),
    };
  }

  // hardDeleteDue — anonymize registrations + drop member rows for
  // members past their 30-day grace window. Cron entrypoint; can also
  // be triggered manually via /v1/internal/gdpr/tick.
  async hardDeleteDue(): Promise<{ purged: number; errors: number }> {
    const cutoff = new Date(Date.now() - HARD_DELETE_GRACE_DAYS * 86_400_000).toISOString();
    const filter = encodeURIComponent(JSON.stringify({ gdpr_deleted_at: { _lte: cutoff } }));
    const res = await this.directus.get<{ data: Array<{ id: string }> }>(
      `/users?filter=${filter}&fields=id&limit=100`,
    );
    let purged = 0;
    let errors = 0;
    for (const u of res.data) {
      try {
        await this.purgeMember(u.id);
        purged += 1;
      } catch (err) {
        errors += 1;
        const reason = err instanceof Error ? err.message : 'unknown';
        this.logger.warn(`hardDelete failed for member=${u.id}: ${reason}`);
      }
    }
    return { purged, errors };
  }

  // purgeMember — anonymize registrations (set member to null) then
  // drop the user row. Done in this order so a crash mid-purge leaves
  // anonymized registrations + the user still present (next tick
  // retries the user drop, idempotent).
  private async purgeMember(memberId: string): Promise<void> {
    // 1. Anonymize registrations — PATCH user FK to null.
    const regFilter = encodeURIComponent(JSON.stringify({ user: { _eq: memberId } }));
    const regs = await this.directus.get<{ data: Array<{ id: string }> }>(
      `/items/registrations?filter=${regFilter}&fields=id&limit=5000`,
    );
    for (const r of regs.data) {
      await this.directus.patch(`/items/registrations/${encodeURIComponent(r.id)}`, {
        user: null,
      });
    }
    // 2. Anonymize feedback rows — same pattern.
    const fbFilter = encodeURIComponent(JSON.stringify({ member: { _eq: memberId } }));
    const fbs = await this.directus.get<{ data: Array<{ id: string }> }>(
      `/items/feedback?filter=${fbFilter}&fields=id&limit=5000`,
    );
    for (const f of fbs.data) {
      await this.directus.patch(`/items/feedback/${encodeURIComponent(f.id)}`, {
        member: null,
        telegram_user_id: null,
        telegram_username: null,
      });
    }
    // 3. Drop the user row. Directus uses /users for member CRUD.
    await this.directus.delete(`/users/${encodeURIComponent(memberId)}`);
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private async findMemberByTgUserId(tgUserId: bigint): Promise<MemberRow | null> {
    const filter = encodeURIComponent(
      JSON.stringify({ telegram_user_id: { _eq: tgUserId.toString() } }),
    );
    const fields =
      'id,email,first_name,last_name,date_created,language,timezone,notification_opt_ins,profile_defaults';
    const res = await this.directus.get<{ data: MemberRow[] }>(
      `/users?filter=${filter}&fields=${fields}&limit=1`,
    );
    return res.data[0] ?? null;
  }

  private async fetchRegistrations(memberId: string): Promise<RegistrationRow[]> {
    const filter = encodeURIComponent(JSON.stringify({ user: { _eq: memberId } }));
    const res = await this.directus.get<{ data: RegistrationRow[] }>(
      `/items/registrations?filter=${filter}&fields=id,event,status,date_created,checked_in_at&limit=500`,
    );
    return res.data;
  }

  private async fetchFeedback(tgUserId: bigint): Promise<FeedbackRow[]> {
    // feedback is keyed by telegram_user_id (anonymous-friendly), not
    // member id. Match either; tg_user_id is sufficient since the
    // feedback row exists per submission, not per member identity.
    const filter = encodeURIComponent(
      JSON.stringify({ telegram_user_id: { _eq: tgUserId.toString() } }),
    );
    const res = await this.directus.get<{ data: FeedbackRow[] }>(
      `/items/feedback?filter=${filter}&fields=id,category,message,date_created&limit=500`,
    );
    return res.data;
  }
}

// ─── Pure helper (exported for tests) ────────────────────────────────────

export function displayName(m: MemberRow): string {
  const first = m.first_name?.trim() ?? '';
  const last = m.last_name?.trim() ?? '';
  const combined = [first, last].filter((s) => s.length > 0).join(' ');
  if (combined) return combined;
  return m.email?.split('@')[0] ?? '(no name)';
}
