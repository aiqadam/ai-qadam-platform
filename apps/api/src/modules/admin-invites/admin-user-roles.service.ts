import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AuditEventsService } from '../audit/audit-events.service';
import { AuthentikClient, MAX_SUPER_ADMINS, SUPER_ADMIN_GROUP } from './authentik.client';

// FR-ADM-011 — admin user/role management. Closes the silent-failure gap
// (GitHub issue #107) by re-reading live Authentik state after every
// grant/revoke and returning that re-read state to the caller, never an
// optimistic assumption based on the write request having been accepted.
//
// Country-scoped groups (organizer, country_lead) require a country;
// global groups (member, speaker, sponsor_rep, super_admin) do not.
// Service-account groups (aiqadam-svc-bot, aiqadam-svc-worker) are
// deliberately excluded — ADR-0021 §8: "A human user must never be a
// member of a aiqadam-svc-* group."

export const HUMAN_ROLE_GROUPS = [
  'aiqadam-member',
  'aiqadam-speaker',
  'aiqadam-sponsor-rep',
  'aiqadam-organizer',
  'aiqadam-country-lead',
  'aiqadam-super-admin',
] as const;
export type HumanRoleGroup = (typeof HUMAN_ROLE_GROUPS)[number];

const COUNTRY_SCOPED_GROUPS: ReadonlySet<HumanRoleGroup> = new Set([
  'aiqadam-organizer',
  'aiqadam-country-lead',
]);

export const ALLOWED_COUNTRIES = ['uz', 'kz', 'tj', 'xx'] as const;
export type AllowedCountry = (typeof ALLOWED_COUNTRIES)[number];

// Both interfaces return RAW Authentik group names, not plain-language
// labels — the label mapping (roleLabel() in apps/web-next/src/lib/roles.ts)
// is a frontend-only concern (it's UI copy, not API data), so the API's
// job is to hand back ground truth and let the client render it.
export interface AdminUserSummary {
  id: number; // Authentik pk
  email: string;
  name: string;
  isActive: boolean;
  groups: string[]; // raw Authentik group names
}

export interface AdminUserRoles {
  id: number;
  email: string;
  name: string;
  groups: string[]; // raw Authentik group names
}

export interface RoleChangeInput {
  grant?: HumanRoleGroup | undefined;
  revoke?: HumanRoleGroup | undefined;
  country?: AllowedCountry | undefined;
}

@Injectable()
export class AdminUserRolesService {
  private readonly logger = new Logger(AdminUserRolesService.name);

  constructor(
    private readonly authentik: AuthentikClient,
    private readonly audit: AuditEventsService,
  ) {}

  // AC-1: search by email/name substring. AuthentikClient has no
  // filtered search endpoint today — listActiveUsers() is capped at 500
  // (documented as sufficient "at our scale... foreseeable future"), so
  // client-side (here, server-side-in-our-API) filtering over that page
  // is the pragmatic v1 approach rather than adding a new Authentik API
  // dependency for a low-cardinality admin search.
  async searchUsers(query: string): Promise<AdminUserSummary[]> {
    const trimmed = query.trim().toLowerCase();
    if (trimmed.length === 0) {
      throw new BadRequestException('query_empty');
    }
    const users = await this.authentik.listActiveUsers();
    return users
      .filter(
        (u) => u.email.toLowerCase().includes(trimmed) || u.name.toLowerCase().includes(trimmed),
      )
      .map((u) => ({
        id: u.pk,
        email: u.email,
        name: u.name,
        isActive: u.is_active,
        groups: (u.groups_obj ?? []).map((g) => g.name),
      }));
  }

  async getRoles(userPk: number): Promise<AdminUserRoles> {
    const user = await this.authentik.getUserById(userPk);
    if (!user) throw new NotFoundException('user_not_found');
    const groups = (user.groups_obj ?? []).map((g) => g.name);
    return {
      id: user.pk,
      email: user.email,
      name: user.name,
      groups,
    };
  }

  // AC-2/AC-3/AC-4: apply a single grant or revoke, enforcing the
  // ADR-0021 <=3 super-admin cap and the symmetric >=1 floor (a
  // super-admin must never be able to revoke the last remaining
  // super-admin through this screen — the FR only states the upper
  // bound, but the same "the platform must always have between 1 and 3
  // super-admins" invariant applies to prevent a total-lockout state
  // this screen itself would then be unable to recover from).
  async changeRole(userPk: number, input: RoleChangeInput, actorId: string): Promise<AdminUserRoles> {
    this.validateInput(input);

    const user = await this.authentik.getUserById(userPk);
    if (!user) throw new NotFoundException('user_not_found');
    const beforeGroups = (user.groups_obj ?? []).map((g) => g.name);

    const targetGroupName = this.resolveTargetGroupName(input);
    const isGrant = input.grant !== undefined;

    if (isGrant && targetGroupName === SUPER_ADMIN_GROUP) {
      await this.assertSuperAdminCapNotExceeded(beforeGroups);
    }
    if (!isGrant && targetGroupName === SUPER_ADMIN_GROUP) {
      await this.assertSuperAdminFloorNotBreached(beforeGroups);
    }

    const afterGroupNames = isGrant
      ? [...new Set([...beforeGroups, targetGroupName])]
      : beforeGroups.filter((g) => g !== targetGroupName);

    // resolveGroupNames() silently DROPS any name it can't resolve
    // (authentik.client.ts's own doc comment) — if that happened here
    // for one of the user's PRE-EXISTING groups (not just the target),
    // setUserGroups() below would write a set smaller than intended,
    // silently revoking an unrelated role. Refuse to write on a count
    // mismatch rather than risk that silent-drop class of bug — this is
    // the exact "appeared to succeed but didn't" failure mode FR-ADM-011
    // exists to close (GitHub issue #107), so the write path itself must
    // not introduce a new instance of it.
    const resolved = await this.authentik.resolveGroupNames(afterGroupNames);
    if (resolved.length !== afterGroupNames.length) {
      const resolvedNames = new Set(resolved.map((g) => g.name));
      const unresolved = afterGroupNames.filter((n) => !resolvedNames.has(n));
      throw new ConflictException(`groups_unresolved:${unresolved.join(',')}`);
    }
    await this.authentik.setUserGroups(userPk, resolved.map((g) => g.pk));

    // Re-read — never trust the write succeeded just because it didn't
    // throw. This is the exact gap that caused GitHub issue #107.
    const reread = await this.authentik.getUserById(userPk);
    if (!reread) throw new NotFoundException('user_not_found_after_change');
    const afterGroups = (reread.groups_obj ?? []).map((g) => g.name);

    this.logger.log({
      event: isGrant ? 'admin.role.granted' : 'admin.role.revoked',
      actor_id: actorId,
      target_user_pk: userPk,
      target_email: reread.email,
      role: targetGroupName,
      before: beforeGroups,
      after: afterGroups,
    });
    await this.audit.emit({
      event: isGrant ? 'admin.role.granted' : 'admin.role.revoked',
      severity: 'high',
      actorId,
      targetKind: 'user',
      targetId: String(userPk),
      payload: {
        target_email: reread.email,
        role: targetGroupName,
        before: beforeGroups,
        after: afterGroups,
      },
    });

    return {
      id: reread.pk,
      email: reread.email,
      name: reread.name,
      groups: afterGroups,
    };
  }

  private validateInput(input: RoleChangeInput): void {
    const hasGrant = input.grant !== undefined;
    const hasRevoke = input.revoke !== undefined;
    if (hasGrant === hasRevoke) {
      throw new BadRequestException('exactly_one_of_grant_or_revoke_required');
    }
    const group = (input.grant ?? input.revoke) as HumanRoleGroup;
    if (!HUMAN_ROLE_GROUPS.includes(group)) {
      throw new BadRequestException(`role_group_unknown:${group}`);
    }
    const isCountryScoped = COUNTRY_SCOPED_GROUPS.has(group);
    if (isCountryScoped && !input.country) {
      throw new BadRequestException('country_required_for_scoped_role');
    }
    if (!isCountryScoped && input.country) {
      throw new BadRequestException('country_not_applicable_for_this_role');
    }
  }

  private resolveTargetGroupName(input: RoleChangeInput): string {
    const group = (input.grant ?? input.revoke) as HumanRoleGroup;
    if (COUNTRY_SCOPED_GROUPS.has(group)) {
      return `${group}-${input.country}`;
    }
    return group;
  }

  private async assertSuperAdminCapNotExceeded(beforeGroups: string[]): Promise<void> {
    const alreadyMember = beforeGroups.includes(SUPER_ADMIN_GROUP);
    if (alreadyMember) return; // no-op grant, count unchanged
    // Re-check immediately before the write (not just once, earlier in
    // the request) to narrow the TOCTOU window flagged by ImpactAnalyzer
    // — acceptable residual risk for a human-paced, low-frequency admin
    // action rather than building distributed locking for a <=3 cap.
    const count = await this.authentik.getSuperAdminCount();
    if (count >= MAX_SUPER_ADMINS) {
      throw new ConflictException(
        `super_admin_cap_exceeded:max_${MAX_SUPER_ADMINS}_per_adr_0021`,
      );
    }
  }

  private async assertSuperAdminFloorNotBreached(beforeGroups: string[]): Promise<void> {
    const isMember = beforeGroups.includes(SUPER_ADMIN_GROUP);
    if (!isMember) return; // no-op revoke, count unchanged
    const count = await this.authentik.getSuperAdminCount();
    if (count <= 1) {
      throw new ConflictException('super_admin_floor_breached:at_least_1_required');
    }
  }
}
