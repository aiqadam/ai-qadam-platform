import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { env } from '../../config/env';
import { AuthentikClient, AuthentikError, SUPER_ADMIN_GROUP } from './authentik.client';

// FR-ADM-010 — platform-admin bootstrap (no manual scripts). On API boot,
// if aiqadam-super-admin has zero members, create exactly one seeded admin
// user in Authentik, assign it to aiqadam-super-admin, and force a
// password change on next login through Authentik's native
// `password_change_next_login` user-body field (live-verified 2026-08-01).
// Idempotent: once >=1 super-admin exists, every later boot is a no-op.
// Replaces the manual procedure at ADR-0021 §9 step 3 (already marked
// superseded there).
//
// Runs as an OnModuleInit hook inside admin-invites (the module that
// already owns AuthentikClient/AuthentikModule) rather than a new module
// or an internal HTTP endpoint — this is the simplest option that
// satisfies AC-1/AC-2 (idempotent create-or-noop on every boot including
// local `pnpm dev`), per RequirementAnalyst's recommended default in
// 01-requirement-validation.md. Precedent for a boot-time concern living
// inside a request-handling module: OutboxRelayService in TelegramModule.
//
// No Postgres writes — the seeded identity lives only in Authentik
// (ADR-0021 §1: Authentik is the source of truth; users.role is
// advisory).

const BOOTSTRAP_USERNAME = 'admin';
const BOOTSTRAP_DISPLAY_NAME = 'AI Qadam Platform Admin';

@Injectable()
export class AdminBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(AdminBootstrapService.name);

  constructor(private readonly authentik: AuthentikClient) {}

  async onModuleInit(): Promise<void> {
    if (!this.authentik.isConfigured()) {
      this.logger.warn(
        'admin-bootstrap: skipped — AUTHENTIK_ADMIN_TOKEN not configured (degraded mode)',
      );
      return;
    }
    if (!env.ADMIN_BOOTSTRAP_DEFAULT_PASSWORD) {
      this.logger.warn(
        'admin-bootstrap: skipped — ADMIN_BOOTSTRAP_DEFAULT_PASSWORD not set (degraded mode)',
      );
      return;
    }

    const alreadyBootstrapped = await this.hasSuperAdminMember();
    if (alreadyBootstrapped) {
      this.logger.debug('admin-bootstrap: skipped — aiqadam-super-admin already has >=1 member');
      return;
    }

    await this.seedAdmin(env.ADMIN_BOOTSTRAP_DEFAULT_PASSWORD);
  }

  // Idempotency check per ImpactAnalyzer's risk-flag recommendation: key
  // on aiqadam-super-admin GROUP MEMBERSHIP COUNT, not "does the seeded
  // email exist." Keying on email existence creates a dangling-zero-admin
  // failure mode — if createUser() succeeds but a prior boot's
  // setUserGroups() call failed, the group would legitimately have zero
  // members forever while every subsequent boot silently treats "user
  // exists" as "already bootstrapped" and never retries the group
  // assignment. Keying on membership count means the next boot always
  // re-attempts until the group actually has a member.
  //
  // FR-ADM-011: reads through AuthentikClient.getSuperAdminCount(), the
  // same shared primitive FR-ADM-011's ongoing grant-time cap check
  // uses — this method's own ">=1" comparison and FR-ADM-011's "> 3"
  // comparison now always agree on what the live count actually is.
  private async hasSuperAdminMember(): Promise<boolean> {
    const count = await this.authentik.getSuperAdminCount();
    return count >= 1;
  }

  private async seedAdmin(password: string): Promise<void> {
    const email = env.ADMIN_BOOTSTRAP_EMAIL;
    const user = await this.createOrRecoverSeedUser(email, password);

    const groups = await this.authentik.resolveGroupNames([SUPER_ADMIN_GROUP]);
    const groupPk = groups[0]?.pk;
    if (!groupPk) {
      // Group must be pre-provisioned by scripts/provision-authentik-rbac-groups.sh.
      // Not a silent partial state: throw loudly rather than leave the
      // seeded user group-less and mark bootstrap "attempted."
      throw new Error(
        `admin-bootstrap: cannot assign — Authentik group not found: ${SUPER_ADMIN_GROUP}`,
      );
    }
    await this.authentik.setUserGroups(user.pk, [groupPk]);
    await this.authentik.setForcePasswordChangeNextLogin(user.pk, true);

    this.logger.log(
      `admin-bootstrap: seeded platform-admin user email=${email} pk=${user.pk} group=${SUPER_ADMIN_GROUP}`,
    );
  }

  // Creates the seeded user. If Authentik reports the email as already
  // taken (AC-6 / ImpactAnalyzer's partial-failure edge: a prior boot's
  // createUser() succeeded but setUserGroups() then failed, leaving an
  // orphaned group-less user), fall back to looking the user up and
  // continuing from there rather than crash-looping every boot.
  private async createOrRecoverSeedUser(
    email: string,
    password: string,
  ): Promise<{ pk: number; attributes: Record<string, unknown> }> {
    try {
      const created = await this.authentik.createUser({
        email,
        username: BOOTSTRAP_USERNAME,
        name: BOOTSTRAP_DISPLAY_NAME,
      });
      await this.authentik.setPassword(created.pk, password);
      return created;
    } catch (err) {
      if (err instanceof AuthentikError && err.status >= 400 && err.status < 500) {
        this.logger.warn(
          `admin-bootstrap: createUser() rejected (status=${err.status}), assuming orphaned partial state — recovering by email lookup: ${email}`,
        );
        const existing = await this.authentik.getUserByEmail(email);
        if (!existing) {
          this.logger.error(
            `admin-bootstrap: createUser() failed with ${err.status} but no existing user found for ${email} — cannot recover`,
          );
          throw err;
        }
        return existing;
      }
      this.logger.error(
        `admin-bootstrap: createUser() failed unexpectedly: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw err;
    }
  }
}
