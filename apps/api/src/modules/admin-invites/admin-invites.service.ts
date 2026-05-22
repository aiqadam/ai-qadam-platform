import { createHash, randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { env } from '../../config/env';
import { DirectusClient } from '../directus/directus.client';
import { AuthentikClient } from './authentik.client';

// F-S2.7 (ADR-0035): operator-invite state machine. Token plaintext is
// shown to the admin exactly once at creation; only SHA256 hash + 8-char
// prefix persist. Status: pending -> consumed | revoked | expired.
//
// This service owns the create + revoke paths; consume lives in the
// onboarding module (PR-4) and writes back here via patch.

export const AUP_CURRENT_VERSION = 'v0.1-placeholder-2026-05-22';

export const ALLOWED_ROLE_GROUPS = [
  'aiqadam-super-admin',
  'aiqadam-staff',
  'country_lead_uz',
  'country_lead_kz',
  'country_lead_tj',
] as const;
export type RoleGroup = (typeof ALLOWED_ROLE_GROUPS)[number];

const COUNTRY_LEAD_GROUPS: ReadonlySet<string> = new Set([
  'country_lead_uz',
  'country_lead_kz',
  'country_lead_tj',
]);

export interface CreateInviteInput {
  email: string;
  display_name?: string | undefined;
  role_groups: RoleGroup[];
  country?: 'uz' | 'kz' | 'tj' | 'xx' | undefined;
  delivery_channel: 'email' | 'telegram' | 'copy_paste';
  notes?: string | undefined;
}

export interface CreateInviteResult {
  invite_id: string;
  invite_url: string; // plaintext token in URL — admin sees this once
  token_prefix: string;
  expires_at: string;
}

interface InviteRow {
  status: 'pending' | 'consumed' | 'revoked' | 'expired';
  authentik_user_id: number | null;
}

@Injectable()
export class AdminInvitesService {
  private readonly logger = new Logger(AdminInvitesService.name);

  constructor(
    private readonly directus: DirectusClient,
    private readonly authentik: AuthentikClient,
  ) {}

  async createInvite(input: CreateInviteInput, callerId: string): Promise<CreateInviteResult> {
    this.validateInput(input);

    // Create Authentik user FIRST so a failure aborts before we have an
    // orphan invite row. Authentik user has no password yet (consume sets it).
    const username = this.usernameFromEmail(input.email);
    const ak = await this.authentik.createUser({
      email: input.email,
      username,
      name: input.display_name ?? username,
    });

    const tokenPlain = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(tokenPlain).digest('hex');
    const tokenPrefix = tokenPlain.slice(0, 8);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + env.INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

    const created = await this.directus.post<{ data: { id: string } }>('/items/operator_invites', {
      email: input.email,
      display_name: input.display_name ?? null,
      role_groups: input.role_groups,
      country: input.country ?? null,
      token_hash: tokenHash,
      token_prefix: tokenPrefix,
      status: 'pending',
      created_at: now.toISOString(),
      created_by: callerId,
      expires_at: expiresAt.toISOString(),
      authentik_user_id: ak.pk,
      delivery_channel: input.delivery_channel,
      notes: input.notes ?? null,
    });

    this.logger.log({
      event: 'invite.created',
      actor_id: callerId,
      target_email: input.email,
      invite_id: created.data.id,
      role_groups: input.role_groups,
      country: input.country ?? null,
      delivery_channel: input.delivery_channel,
      ts: now.toISOString(),
    });

    return {
      invite_id: created.data.id,
      invite_url: `${env.INVITE_URL_BASE.replace(/\/$/, '')}/onboard?token=${tokenPlain}`,
      token_prefix: tokenPrefix,
      expires_at: expiresAt.toISOString(),
    };
  }

  async revokeInvite(inviteId: string, callerId: string): Promise<void> {
    const row = await this.fetchInvite(inviteId);
    if (row.status !== 'pending') {
      throw new ConflictException(`invite_${row.status}`);
    }
    const now = new Date().toISOString();
    await this.directus.patch(`/items/operator_invites/${encodeURIComponent(inviteId)}`, {
      status: 'revoked',
      revoked_at: now,
      revoked_by: callerId,
    });
    // Also disable the Authentik placeholder; tolerate Authentik failures
    // (log divergence) — the Directus side already reflects the operator intent.
    if (row.authentik_user_id != null) {
      try {
        await this.authentik.disableUser(row.authentik_user_id);
      } catch (err) {
        this.logger.warn(
          `revoke: failed to disable Authentik user pk=${row.authentik_user_id} for invite=${inviteId}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
    this.logger.log({
      event: 'invite.revoked',
      actor_id: callerId,
      invite_id: inviteId,
      ts: now,
    });
  }

  private async fetchInvite(inviteId: string): Promise<InviteRow> {
    const res = await this.directus.get<{ data: InviteRow | null }>(
      `/items/operator_invites/${encodeURIComponent(inviteId)}`,
    );
    if (!res.data) throw new NotFoundException('invite_not_found');
    return res.data;
  }

  private validateInput(input: CreateInviteInput): void {
    if (input.role_groups.length === 0) {
      throw new BadRequestException('role_groups_empty');
    }
    for (const g of input.role_groups) {
      if (!ALLOWED_ROLE_GROUPS.includes(g)) {
        throw new BadRequestException(`role_groups_unknown:${g}`);
      }
    }
    const hasCountryLead = input.role_groups.some((g) => COUNTRY_LEAD_GROUPS.has(g));
    if (hasCountryLead && !env.ENABLE_COUNTRY_LEAD_INVITES) {
      throw new BadRequestException('country_lead_invites_disabled');
    }
    if (hasCountryLead && !input.country) {
      throw new BadRequestException('country_required_for_country_lead');
    }
  }

  private usernameFromEmail(email: string): string {
    const local = email.split('@')[0] ?? email;
    return local.toLowerCase().replace(/[^a-z0-9.]/g, '');
  }
}
