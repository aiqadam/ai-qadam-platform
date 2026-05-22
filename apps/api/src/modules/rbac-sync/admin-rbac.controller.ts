import { Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { SuperAdminGuard } from '../admin-invites/super-admin.guard';
import { AuthGuard } from '../auth/auth.guard';
import { type EngineStatus, type RbacSyncJobRow, RbacSyncService } from './rbac-sync.service';

// F-S2.2-g (ADR-0021 §7) — super-admin cabinet endpoints for the
// /workspace/admin/rbac-sync UI. Distinct from the internal webhook
// (token-as-cred) and the poll endpoint (Bearer X-Internal-Auth) —
// these are operator-facing.

const VALID_STATUSES = new Set<EngineStatus>([
  'pending',
  'applied',
  'failed',
  'skipped',
  'dry_run',
]);

@Controller('v1/admin/rbac-sync')
@UseGuards(AuthGuard, SuperAdminGuard)
export class AdminRbacController {
  constructor(private readonly rbac: RbacSyncService) {}

  @Get('jobs')
  async list(
    @Query('status') status?: string,
    @Query('only_failed') onlyFailed?: string,
  ): Promise<{ jobs: RbacSyncJobRow[] }> {
    const onlyFailedBool = onlyFailed === 'true' || onlyFailed === '1';
    const validStatus =
      status && VALID_STATUSES.has(status as EngineStatus) ? (status as EngineStatus) : undefined;
    const jobs = await this.rbac.listJobs({
      ...(validStatus ? { status: validStatus } : {}),
      ...(onlyFailedBool ? { only_failed: true } : {}),
    });
    return { jobs };
  }

  @Post('jobs/:id/retry')
  @HttpCode(202)
  async retry(@Param('id') id: string): Promise<{ new_job_id: string }> {
    return this.rbac.retryJob(id);
  }
}
