import { Injectable, Logger } from '@nestjs/common';
import { env } from '../../config/env';
import { AuthentikClient } from '../admin-invites/authentik.client';
import { AuditEventsService } from '../audit/audit-events.service';
import { DirectusUsersBridgeService } from '../directus/directus-users-bridge.service';
import { DirectusClient } from '../directus/directus.client';
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

@Injectable()
export class RbacSyncService {
  private readonly logger = new Logger(RbacSyncService.name);

  constructor(
    private readonly authentik: AuthentikClient,
    private readonly directus: DirectusClient,
    private readonly directusBridge: DirectusUsersBridgeService,
    private readonly audit: AuditEventsService,
    private readonly directusApplier: DirectusPolicyApplier,
  ) {}

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

    // Persist status. Plausible stays 'pending' until F-S2.2-d ships.
    const patch: Record<string, unknown> = {
      directus_status: directusOutcome.status,
      directus_error: directusOutcome.error ?? null,
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
