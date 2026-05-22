import { createHash, randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { env } from '../../config/env';
import { AuditEventsService } from '../audit/audit-events.service';
import { DirectusUsersBridgeService } from '../directus/directus-users-bridge.service';
import { DirectusClient } from '../directus/directus.client';
import { AuthentikClient, AuthentikError } from './authentik.client';
import { CloudflareRoutingClient } from './cloudflare-routing.client';
import { ResendAdminClient } from './resend-admin.client';

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
  // F-S2.8: when set AND email ends with @aiqadam.org, the service
  // also provisions a Cloudflare Email Routing rule + per-operator
  // Resend API key. Optional; omitted = fully manual setup (the F-S2.7
  // baseline behaviour, unchanged).
  destination_gmail?: string | undefined;
}

export interface CreateInviteResult {
  invite_id: string;
  invite_url: string; // plaintext token in URL — admin sees this once
  token_prefix: string;
  expires_at: string;
  // F-S2.8 — present when CF/Resend automation ran. Absent when no
  // destination_gmail was supplied or the email isn't @aiqadam.org.
  email_automation?: EmailAutomationResult | undefined;
}

export interface EmailAutomationResult {
  // Cloudflare rule outcome. Either both or neither populated.
  cf_rule_id?: string | undefined;
  cf_rule_already_existed?: boolean | undefined;
  // Resend per-operator key outcome. token is plaintext, shown once.
  resend_key_id?: string | undefined;
  resend_key_plaintext?: string | undefined;
  // Human-readable failure reasons for the parts that didn't run.
  // Empty array means full success; admin still gets the invite_url
  // even when this isn't empty.
  partial_failures: string[];
}

interface InviteRow {
  id: string;
  email: string;
  display_name: string | null;
  role_groups: RoleGroup[];
  country: 'uz' | 'kz' | 'tj' | 'xx' | null;
  status: 'pending' | 'consumed' | 'revoked' | 'expired';
  token_hash: string;
  token_prefix: string;
  created_at: string;
  expires_at: string;
  authentik_user_id: number | null;
  delivery_channel: 'email' | 'telegram' | 'copy_paste' | null;
}

export interface InviteSummary {
  id: string;
  email: string;
  display_name: string | null;
  role_groups: RoleGroup[];
  country: 'uz' | 'kz' | 'tj' | 'xx' | null;
  status: InviteRow['status'];
  token_prefix: string;
  created_at: string;
  expires_at: string;
  delivery_channel: InviteRow['delivery_channel'];
}

export interface InvitePreview {
  email: string;
  display_name: string | null;
  role_groups: RoleGroup[];
  country: 'uz' | 'kz' | 'tj' | 'xx' | null;
  expires_at: string;
  aup_version: string;
}

export interface ConsumeInviteInput {
  token: string;
  password: string;
  aup_accepted: boolean;
}

@Injectable()
export class AdminInvitesService {
  private readonly logger = new Logger(AdminInvitesService.name);

  constructor(
    private readonly directus: DirectusClient,
    private readonly authentik: AuthentikClient,
    private readonly directusBridge: DirectusUsersBridgeService,
    private readonly audit: AuditEventsService,
    private readonly cloudflare: CloudflareRoutingClient,
    private readonly resendAdmin: ResendAdminClient,
  ) {}

  async createInvite(input: CreateInviteInput, callerId: string): Promise<CreateInviteResult> {
    this.validateInput(input);

    // operator_invites.created_by is FK to directus_users.id. Our local
    // users.id (req.user.sub) is a DIFFERENT uuid — the bridge maps it.
    // Resolution failure is non-fatal: drop the audit FK and proceed
    // (Loki log still carries actor_id below).
    const createdByDirectus = await this.directusBridge.resolveDirectusId(callerId);

    // Create Authentik user FIRST so a failure aborts before we have an
    // orphan invite row. Authentik 4xx (e.g. email already taken) maps
    // to 409 Conflict so the caller gets a meaningful status.
    const username = this.usernameFromEmail(input.email);
    const ak = await this.authentik
      .createUser({
        email: input.email,
        username,
        name: input.display_name ?? username,
      })
      .catch((err: unknown) => {
        if (err instanceof AuthentikError && err.status >= 400 && err.status < 500) {
          throw new ConflictException(`authentik_create_failed:${err.status}`);
        }
        throw err;
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
      created_by: createdByDirectus,
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

    await this.audit.emit({
      event: 'invite.created',
      severity: 'high',
      actorId: callerId,
      targetKind: 'invite',
      targetId: created.data.id,
      country: input.country ?? null,
      payload: {
        target_email: input.email,
        role_groups: input.role_groups,
        delivery_channel: input.delivery_channel,
        token_prefix: tokenPrefix,
      },
      ts: now.toISOString(),
    });

    // F-S2.8: best-effort email automation. Runs only when the invite
    // email is @aiqadam.org AND admin supplied destination_gmail.
    // Failures populate partial_failures but never abort the invite —
    // the manual runbook is always a valid fallback path.
    const emailAutomation = await this.maybeProvisionEmailAutomation(input);

    return {
      invite_id: created.data.id,
      invite_url: `${env.INVITE_URL_BASE.replace(/\/$/, '')}/onboard?token=${tokenPlain}`,
      token_prefix: tokenPrefix,
      expires_at: expiresAt.toISOString(),
      email_automation: emailAutomation,
    };
  }

  // F-S2.8 — best-effort CF Email Routing + Resend per-operator key
  // provisioning. Returns undefined when there's nothing to do (no
  // destination_gmail, or invite email isn't @aiqadam.org). Two
  // independent calls; either failing leaves the other intact.
  private async maybeProvisionEmailAutomation(
    input: CreateInviteInput,
  ): Promise<EmailAutomationResult | undefined> {
    const destination = input.destination_gmail?.trim();
    if (!destination) return undefined;
    if (!input.email.toLowerCase().endsWith('@aiqadam.org')) return undefined;

    const partialFailures: string[] = [];
    const result: EmailAutomationResult = { partial_failures: partialFailures };

    const cfPromise = this.cloudflare.isConfigured()
      ? this.cloudflare
          .createRoutingRule({ alias: input.email.toLowerCase(), destination })
          .then((r) => {
            result.cf_rule_id = r.rule_id;
            result.cf_rule_already_existed = r.already_existed;
          })
          .catch((err: unknown) => {
            const msg = err instanceof Error ? err.message : 'unknown';
            this.logger.warn(`cloudflare_provision_failed: ${msg}`);
            partialFailures.push(`cloudflare:${truncate(msg, 120)}`);
          })
      : Promise.resolve(partialFailures.push('cloudflare:not_configured'));

    const resendPromise = this.resendAdmin.isConfigured()
      ? this.resendAdmin
          .createPerOperatorKey({ operatorEmail: input.email.toLowerCase() })
          .then((r) => {
            result.resend_key_id = r.id;
            result.resend_key_plaintext = r.token;
          })
          .catch((err: unknown) => {
            const msg = err instanceof Error ? err.message : 'unknown';
            this.logger.warn(`resend_admin_provision_failed: ${msg}`);
            partialFailures.push(`resend:${truncate(msg, 120)}`);
          })
      : Promise.resolve(partialFailures.push('resend:not_configured'));

    await Promise.all([cfPromise, resendPromise]);
    return result;
  }

  async revokeInvite(inviteId: string, callerId: string): Promise<void> {
    const row = await this.fetchInvite(inviteId);
    if (row.status !== 'pending') {
      throw new ConflictException(`invite_${row.status}`);
    }
    // Same FK consideration as createInvite — resolve local users.id ->
    // directus_users.id before writing.
    const revokedByDirectus = await this.directusBridge.resolveDirectusId(callerId);
    const now = new Date().toISOString();
    await this.directus.patch(`/items/operator_invites/${encodeURIComponent(inviteId)}`, {
      status: 'revoked',
      revoked_at: now,
      revoked_by: revokedByDirectus,
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
    await this.audit.emit({
      event: 'invite.revoked',
      severity: 'high',
      actorId: callerId,
      targetKind: 'invite',
      targetId: inviteId,
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

  // PR-4: admin list. Excludes token_hash so the API never echoes the
  // hash even to super-admins. Filter values are clipped to the status
  // enum at the controller.
  async listInvites(status?: InviteRow['status']): Promise<InviteSummary[]> {
    const fields =
      'id,email,display_name,role_groups,country,status,token_prefix,created_at,expires_at,delivery_channel';
    const filter = status
      ? `&filter=${encodeURIComponent(JSON.stringify({ status: { _eq: status } }))}`
      : '';
    const res = await this.directus.get<{ data: InviteSummary[] }>(
      `/items/operator_invites?fields=${fields}&sort=-created_at&limit=200${filter}`,
    );
    return res.data;
  }

  // PR-4: public — invitee opens /onboard?token=... and we surface the
  // safe shape (no token_hash, no Authentik internals). Token-hash
  // lookup is constant-time-ish at the DB level (single indexed scan).
  async previewInvite(plaintextToken: string): Promise<InvitePreview> {
    const row = await this.lookupByToken(plaintextToken);
    return {
      email: row.email,
      display_name: row.display_name,
      role_groups: row.role_groups,
      country: row.country,
      expires_at: row.expires_at,
      aup_version: AUP_CURRENT_VERSION,
    };
  }

  // PR-4: public — invitee submits new password + AUP acknowledgement.
  // Sets Authentik password, marks invite consumed. RBAC group
  // assignment downstream is left to F-S2.2 RBAC sync OR the next
  // admin action; we do not re-write role_groups to Authentik here
  // because PR-2 only provided setUserGroups (replace semantics) and
  // we'd need to merge with existing groups — punt for v1.
  async consumeInvite(input: ConsumeInviteInput): Promise<{ ok: true }> {
    if (!input.aup_accepted) {
      throw new BadRequestException('aup_not_accepted');
    }
    if (input.password.length < 12) {
      throw new BadRequestException('password_too_short');
    }
    const row = await this.lookupByToken(input.token);
    if (row.authentik_user_id == null) {
      throw new ConflictException('invite_missing_authentik_user');
    }
    await this.authentik.setPassword(row.authentik_user_id, input.password);
    const now = new Date().toISOString();
    await this.directus.patch(`/items/operator_invites/${encodeURIComponent(row.id)}`, {
      status: 'consumed',
      consumed_at: now,
      aup_accepted_at: now,
      aup_version: AUP_CURRENT_VERSION,
    });
    this.logger.log({
      event: 'invite.consumed',
      invite_id: row.id,
      target_email: row.email,
      ts: now,
    });
    // No actorId here — consume is a public path (token IS the credential).
    // The targetId points back to the invite row + the authentik_user_id
    // landed in payload for join-traceability.
    await this.audit.emit({
      event: 'invite.consumed',
      severity: 'high',
      actorId: null,
      targetKind: 'invite',
      targetId: row.id,
      country: row.country,
      payload: {
        target_email: row.email,
        authentik_user_id: row.authentik_user_id,
        aup_version: AUP_CURRENT_VERSION,
      },
      ts: now,
    });
    return { ok: true };
  }

  private async lookupByToken(plaintext: string): Promise<InviteRow> {
    if (plaintext.length < 16 || plaintext.length > 128) {
      throw new GoneException('invite_invalid');
    }
    const hash = createHash('sha256').update(plaintext).digest('hex');
    const filter = encodeURIComponent(JSON.stringify({ token_hash: { _eq: hash } }));
    const res = await this.directus.get<{ data: InviteRow[] }>(
      `/items/operator_invites?filter=${filter}&limit=1`,
    );
    const row = res.data[0];
    if (!row) throw new GoneException('invite_invalid');
    if (row.status === 'consumed') throw new GoneException('invite_consumed');
    if (row.status === 'revoked') throw new GoneException('invite_revoked');
    if (row.status === 'expired' || new Date(row.expires_at) < new Date()) {
      throw new GoneException('invite_expired');
    }
    return row;
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

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}
