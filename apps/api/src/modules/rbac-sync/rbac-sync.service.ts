import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { env } from '../../config/env';
import { AuthentikClient } from '../admin-invites/authentik.client';
import { AuditEventsService } from '../audit/audit-events.service';
import { DirectusUsersBridgeService } from '../directus/directus-users-bridge.service';
import { DirectusClient } from '../directus/directus.client';
import { TickLockService } from '../internal-cron/tick-lock.service';
import { DirectusPolicyApplier } from './directus-policy-applier';
import { type ExpectedState, computeExpectedState } from './group-mapping';

// F-S2.2 RBAC sync service. In this PR (F-S2.2-b) the surface is:
//   - intakeWebhook({ userPk, triggeredBy }): fetch canonical group
//     list from Authentik + compute expected state + write a row to
//     rbac_sync_jobs + emit audit_events.rbac.sync.computed.
//
// When RBAC_SYNC_WRITE_ENABLED=false (default), per-engine statuses
// are stamped 'dry_run' so the workspace UI (F-S2.2-g) can show "what
// would have been written". Apply-side engines (Directus + Plausible)
// ship in F-S2.2-d/e and pick up rows with directus_status='pending'
// or 'dry_run' (depending on the flag).

export type TriggeredBy = 'webhook' | 'poll' | 'manual_retry' | 'activate_country';

export interface IntakeInput {
  userPk: number;
  triggeredBy: TriggeredBy;
}

export interface IntakeResult {
  job_id: string;
  user_email: string;
  groups: string[];
  expected_state: ExpectedState;
  dry_run: boolean;
}

interface RbacSyncJobInsertResp {
  data: { id: string };
}

export type EngineStatus = 'pending' | 'applied' | 'failed' | 'skipped' | 'dry_run';

export interface RbacSyncJobRow {
  id: string;
  user: string | null;
  user_email?: string | null;
  triggered_by: TriggeredBy;
  expected_state: ExpectedState;
  directus_status: EngineStatus;
  directus_error: string | null;
  plausible_status: EngineStatus;
  plausible_error: string | null;
  attempt: number;
  started_at: string;
  finished_at: string | null;
}

@Injectable()
export class RbacSyncService {
  private readonly logger = new Logger(RbacSyncService.name);

  constructor(
    private readonly authentik: AuthentikClient,
    private readonly directus: DirectusClient,
    private readonly directusBridge: DirectusUsersBridgeService,
    private readonly audit: AuditEventsService,
    private readonly directusApplier: DirectusPolicyApplier,
    private readonly locks: TickLockService,
  ) {}

  // Nightly poll — 03:30 UTC per ADR-0021 §5 (replaces the deleted
  // .github/workflows/rbac-poll.yml). Belt-and-braces for the
  // Authentik webhook; same intakeWebhook path so behaviour is identical.
  @Cron('30 3 * * *')
  async scheduledTick(): Promise<void> {
    await this.locks.withLock('rbac-sync-poll', 540, async () => {
      const r = await this.pollAllUsers();
      this.logger.log(
        `scheduledTick scanned=${r.scanned} jobs_created=${r.jobs_created} errors=${r.errors}`,
      );
    });
  }

  async intakeWebhook(input: IntakeInput): Promise<IntakeResult> {
    // ADR-0021 §5: do NOT trust the webhook payload's group list alone
    // — pull canonical state from Authentik. Out-of-order webhooks are
    // common; canonical lookup wins.
    const user = await this.authentik.getUserById(input.userPk);
    if (!user) {
      // User deleted between webhook fire + our lookup. Emit + return
      // a synthesized 'skipped' state so the audit trail records the
      // ghost event.
      this.logger.warn(`rbac.intake: Authentik user pk=${input.userPk} not found`);
      const expectedSkipped: ExpectedState = {
        directus: { policies: [], filter_country: null },
        plausible: { sites: [], role: 'viewer' },
      };
      await this.audit.emit({
        event: 'rbac.sync.user_missing',
        severity: 'high',
        targetKind: 'authentik_user',
        targetId: String(input.userPk),
        payload: { triggered_by: input.triggeredBy },
      });
      return {
        job_id: '',
        user_email: '',
        groups: [],
        expected_state: expectedSkipped,
        dry_run: !env.RBAC_SYNC_WRITE_ENABLED,
      };
    }

    const groupNames = (user.groups_obj ?? []).map((g) => g.name);
    const expectedState = computeExpectedState(groupNames);
    const dryRun = !env.RBAC_SYNC_WRITE_ENABLED;
    const initialStatus = dryRun ? 'dry_run' : 'pending';

    // Map Authentik user → directus_users row. Bridge.findOrCreate is
    // called as a side-effect; the FK is required on rbac_sync_jobs.
    const directusUserId = await this.resolveDirectusUserId(user.email);
    if (!directusUserId) {
      this.logger.warn(`rbac.intake: could not resolve directus user for ${user.email}`);
      const expectedSkipped: ExpectedState = expectedState;
      await this.audit.emit({
        event: 'rbac.sync.bridge_missing',
        severity: 'critical',
        targetKind: 'authentik_user',
        targetId: String(input.userPk),
        payload: { email: user.email, triggered_by: input.triggeredBy },
      });
      return {
        job_id: '',
        user_email: user.email,
        groups: groupNames,
        expected_state: expectedSkipped,
        dry_run: dryRun,
      };
    }

    const inserted = await this.directus.post<RbacSyncJobInsertResp>('/items/rbac_sync_jobs', {
      user: directusUserId,
      triggered_by: input.triggeredBy,
      expected_state: expectedState,
      directus_status: initialStatus,
      plausible_status: initialStatus,
      attempt: 1,
    });

    await this.audit.emit({
      event: 'rbac.sync.computed',
      severity: 'info',
      targetKind: 'rbac_job',
      targetId: inserted.data.id,
      payload: {
        authentik_user_pk: input.userPk,
        email: user.email,
        groups: groupNames,
        expected_state: expectedState,
        triggered_by: input.triggeredBy,
        dry_run: dryRun,
      },
    });

    this.logger.log({
      event: 'rbac.sync.computed',
      job_id: inserted.data.id,
      email: user.email,
      groups: groupNames,
      dry_run: dryRun,
    });

    // F-S2.2-c: per-engine apply runs synchronously inside the webhook
    // handler (ADR-0021 §5 amendment 2026-05-22). When dryRun, skip
    // the engine call — the row stays as 'dry_run' for review.
    if (!dryRun) {
      await this.applyEngines(inserted.data.id, directusUserId, expectedState);
    }

    return {
      job_id: inserted.data.id,
      user_email: user.email,
      groups: groupNames,
      expected_state: expectedState,
      dry_run: dryRun,
    };
  }

  // F-S2.2-c — runs each engine in sequence, persisting per-engine
  // status + finished_at after the last call. Engine failures DO NOT
  // throw — they flip the per-engine status to 'failed' and the
  // workspace UI surfaces the row for operator retry (F-S2.2-g).
  // Plausible engine lands in F-S2.2-d; this PR stamps it 'pending'
  // so the next PR's applier picks it up.
  private async applyEngines(
    jobId: string,
    directusUserId: string,
    expected: ExpectedState,
  ): Promise<void> {
    // Directus engine
    const directusOutcome = await this.directusApplier.apply(directusUserId, expected.directus);
    await this.audit.emit({
      event: directusOutcome.status === 'applied' ? 'rbac.sync.applied' : 'rbac.sync.failed',
      severity: directusOutcome.status === 'failed' ? 'high' : 'info',
      targetKind: 'rbac_job',
      targetId: jobId,
      payload: {
        engine: 'directus',
        outcome: directusOutcome,
        expected: expected.directus,
      },
    });

    // Plausible engine (F-S2.2-d): SKIPPED for v1. Plausible CE has no
    // documented membership-management API; site provisioning runs via
    // akadmin screen-scrape (memory reference_coolify_resources +
    // 4 per-country sites provisioned 2026-05-22). Per-user membership
    // management deferred — operators add Plausible members manually
    // until a clean API surface exists. Status flips to 'skipped' per
    // ADR-0021 §7 (extending the "engine not required" semantics).
    await this.audit.emit({
      event: 'rbac.sync.skipped',
      severity: 'info',
      targetKind: 'rbac_job',
      targetId: jobId,
      payload: {
        engine: 'plausible',
        reason: 'no_membership_api_in_plausible_ce',
        expected: expected.plausible,
      },
    });

    // Persist status: Directus = applied/failed, Plausible = skipped.
    const patch: Record<string, unknown> = {
      directus_status: directusOutcome.status,
      directus_error: directusOutcome.error ?? null,
      plausible_status: 'skipped',
      finished_at: new Date().toISOString(),
    };
    await this.directus
      .patch(`/items/rbac_sync_jobs/${encodeURIComponent(jobId)}`, patch)
      .catch((err) => {
        this.logger.warn(
          `rbac.persist.failed job=${jobId}: ${err instanceof Error ? err.message : err}`,
        );
      });
  }

  // F-S2.2-g — admin view. Lists rbac_sync_jobs joined with user email
  // (for the UI table). Filtered by status when provided; otherwise
  // returns the most recent 200 rows.
  async listJobs(filter?: {
    status?: EngineStatus;
    only_failed?: boolean;
  }): Promise<RbacSyncJobRow[]> {
    const fields =
      'id,user,user.email,triggered_by,expected_state,directus_status,directus_error,plausible_status,plausible_error,attempt,started_at,finished_at';
    const filterParts: Record<string, unknown> = {};
    if (filter?.only_failed) {
      filterParts._or = [
        { directus_status: { _eq: 'failed' } },
        { plausible_status: { _eq: 'failed' } },
      ];
    } else if (filter?.status) {
      filterParts._or = [
        { directus_status: { _eq: filter.status } },
        { plausible_status: { _eq: filter.status } },
      ];
    }
    const filterQs =
      Object.keys(filterParts).length > 0
        ? `&filter=${encodeURIComponent(JSON.stringify(filterParts))}`
        : '';
    type RawRow = Omit<RbacSyncJobRow, 'user' | 'user_email'> & {
      user: { id?: string; email?: string } | string | null;
    };
    const res = await this.directus.get<{ data: RawRow[] }>(
      `/items/rbac_sync_jobs?fields=${fields}&sort=-started_at&limit=200${filterQs}`,
    );
    return res.data.map((row) => {
      const { user, ...rest } = row;
      let userId: string | null = null;
      let email: string | null = null;
      if (typeof user === 'string') {
        userId = user;
      } else if (user && typeof user === 'object') {
        userId = user.id ?? null;
        email = user.email ?? null;
      }
      return { ...rest, user: userId, user_email: email } as RbacSyncJobRow;
    });
  }

  // F-S2.2-g — operator retry. Reads the job, re-fetches Authentik
  // canonical state via intakeWebhook with triggered_by=manual_retry.
  // Returns the new job id so the UI can highlight the fresh row.
  async retryJob(jobId: string): Promise<{ new_job_id: string }> {
    const res = await this.directus.get<{
      data: { authentik_user_id?: number | null; user?: { external_identifier?: string } | null };
    }>(
      `/items/rbac_sync_jobs/${encodeURIComponent(jobId)}?fields=user.external_identifier,expected_state`,
    );
    // The original job may not have authentik_user_id stored; we have
    // the directus_users.email as external_identifier. Resolve to pk by
    // re-querying Authentik via email.
    const email = res.data.user?.external_identifier;
    if (!email) {
      throw new NotFoundException('job_user_email_missing');
    }
    const user = await this.authentik.getUserByEmail(email);
    if (!user) {
      throw new NotFoundException('authentik_user_not_found');
    }
    const result = await this.intakeWebhook({
      userPk: user.pk,
      triggeredBy: 'manual_retry',
    });
    return { new_job_id: result.job_id };
  }

  // F-S2.2-f — nightly poll. Called by the internal cron endpoint.
  // Walks every active Authentik user + runs intakeWebhook(triggered_by:
  // 'poll') for each. Catches drift from missed webhooks + hand-edits.
  async pollAllUsers(): Promise<{ scanned: number; jobs_created: number; errors: number }> {
    const start = Date.now();
    const users = await this.authentik.listActiveUsers();
    let jobsCreated = 0;
    let errors = 0;
    for (const user of users) {
      try {
        const r = await this.intakeWebhook({ userPk: user.pk, triggeredBy: 'poll' });
        if (r.job_id) jobsCreated += 1;
      } catch (err) {
        errors += 1;
        this.logger.warn(
          `rbac.poll.user_failed pk=${user.pk}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
    const summary = { scanned: users.length, jobs_created: jobsCreated, errors };
    await this.audit.emit({
      event: 'rbac.sync.poll_completed',
      severity: errors > 0 ? 'high' : 'info',
      targetKind: 'rbac_poll',
      targetId: new Date().toISOString(),
      payload: { ...summary, duration_ms: Date.now() - start },
    });
    this.logger.log({ event: 'rbac.sync.poll_completed', ...summary });
    return summary;
  }

  // The bridge's ensureLinked needs our local users.id; the webhook
  // path only knows the Authentik side. We look the user up in
  // directus_users by email directly. We deliberately do NOT auto-
  // create a directus_users row here — that would race the auth-
  // callback's bridge.findOrCreate. Surface bridge_missing instead;
  // the user signs in once and the next webhook resolves cleanly.
  private async resolveDirectusUserId(email: string): Promise<string | null> {
    const filter = encodeURIComponent(JSON.stringify({ email: { _eq: email } }));
    const res = await this.directus.get<{ data: Array<{ id: string }> }>(
      `/users?filter=${filter}&fields=id&limit=1`,
    );
    return res.data[0]?.id ?? null;
  }
}
