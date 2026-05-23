import { createHash } from 'node:crypto';
import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { AuditEventsService } from '../audit/audit-events.service';
import { DirectusClient } from '../directus/directus.client';
import { CloudflareRoutingClient, CloudflareRoutingError } from './cloudflare-routing.client';
import { ResendAdminClient, ResendAdminError } from './resend-admin.client';

// F-S2.8.1 — operator-driven email routing onboarding.
//
// Flow (operator-side, called by the /onboard page after password +
// AUP acceptance):
//   1. POST /v1/onboard/email-routing/destination
//      Operator submits THEIR personal Gmail → we POST it as a CF
//      destination address (which triggers CF to email a verification
//      link), persist `destination_gmail` + `cf_destination_address_id`,
//      flip `email_setup_status` to `destination_pending`.
//   2. GET /v1/onboard/email-routing/status (polled)
//      Returns current status. If still pending, we refresh by querying
//      CF for the destination's verified state and persist any flip.
//   3. POST /v1/onboard/email-routing/finalize
//      Once verified, we create the CF routing rule (`alias` -> Gmail)
//      and a per-operator Resend API key. The Resend plaintext is
//      returned to the operator ONCE — never persisted (matching the
//      invite-token convention).
//
// All three are public — the invite token IS the credential, same as
// /v1/onboard/preview + /v1/onboard/accept (see ADR-0035 §3 token
// security posture).
//
// The state machine is enforced server-side. Direct field mutations
// from anywhere else (Directus admin UI, raw SQL) WILL desync; treat
// this service as the single writer.

export type EmailSetupStatus = 'not_started' | 'destination_pending' | 'ready' | 'failed';

interface InviteEmailSetupRow {
  id: string;
  email: string;
  status: 'pending' | 'consumed' | 'revoked' | 'expired';
  token_hash: string;
  expires_at: string;
  destination_gmail: string | null;
  cf_destination_address_id: string | null;
  cf_destination_verified_at: string | null;
  cf_rule_id: string | null;
  resend_key_id: string | null;
  email_setup_status: EmailSetupStatus;
  email_setup_failed_reason: string | null;
}

export interface SubmitDestinationInput {
  token: string;
  destination_gmail: string;
}

export interface SubmitDestinationResult {
  cf_destination_address_id: string;
  verified: boolean;
  email_setup_status: EmailSetupStatus;
}

export interface StatusResult {
  email_setup_status: EmailSetupStatus;
  destination_gmail: string | null;
  destination_verified: boolean;
  cf_rule_id: string | null;
  email_setup_failed_reason: string | null;
}

export interface FinalizeResult {
  cf_rule_id: string;
  resend_key_id: string;
  resend_key_plaintext: string; // shown ONCE
  email_setup_status: EmailSetupStatus;
}

const TOKEN_MIN_LEN = 16;
const TOKEN_MAX_LEN = 128;
const GMAIL_MAX_LEN = 254;
const FAILED_REASON_MAX_LEN = 500;

@Injectable()
export class OnboardingEmailRoutingService {
  private readonly logger = new Logger(OnboardingEmailRoutingService.name);

  constructor(
    private readonly directus: DirectusClient,
    private readonly cloudflare: CloudflareRoutingClient,
    private readonly resendAdmin: ResendAdminClient,
    private readonly audit: AuditEventsService,
  ) {}

  async submitDestination(input: SubmitDestinationInput): Promise<SubmitDestinationResult> {
    const destination = input.destination_gmail.trim().toLowerCase();
    if (!destination.includes('@') || destination.length > GMAIL_MAX_LEN) {
      throw new BadRequestException('destination_gmail_invalid');
    }
    const row = await this.lookupByToken(input.token);
    if (row.email_setup_status !== 'not_started') {
      throw new ConflictException(`email_setup_already_${row.email_setup_status}`);
    }
    if (!this.cloudflare.isDestinationApiConfigured()) {
      throw new BadGatewayException('cloudflare_destination_api_not_configured');
    }

    let addResult: Awaited<ReturnType<CloudflareRoutingClient['addDestinationAddress']>>;
    try {
      addResult = await this.cloudflare.addDestinationAddress(destination);
    } catch (err) {
      const reason = err instanceof CloudflareRoutingError ? err.message : 'unknown';
      this.logger.warn(`submitDestination CF add failed: ${reason}`);
      await this.markFailed(row.id, `cloudflare_add_destination_failed:${truncate(reason, 200)}`);
      throw new BadGatewayException('cloudflare_add_destination_failed');
    }

    const now = new Date().toISOString();
    const verifiedAt = addResult.verified ? now : null;
    await this.directus.patch(`/items/operator_invites/${encodeURIComponent(row.id)}`, {
      destination_gmail: destination,
      cf_destination_address_id: addResult.tag,
      cf_destination_verified_at: verifiedAt,
      email_setup_status: 'destination_pending',
    });

    await this.audit.emit({
      event: 'invite.email_routing.destination_submitted',
      severity: 'info',
      actorId: null,
      targetKind: 'invite',
      targetId: row.id,
      payload: {
        cf_destination_address_id: addResult.tag,
        already_existed: addResult.already_existed,
        verified: addResult.verified,
      },
      ts: now,
    });

    return {
      cf_destination_address_id: addResult.tag,
      verified: addResult.verified,
      email_setup_status: 'destination_pending',
    };
  }

  async getStatus(token: string): Promise<StatusResult> {
    const row = await this.lookupByToken(token);
    let verifiedAt = row.cf_destination_verified_at;

    // While destination_pending, refresh from CF on every poll so the
    // page can advance the moment the operator clicks the verification
    // link. Tolerate CF flakiness — degrade to the persisted state.
    if (
      row.email_setup_status === 'destination_pending' &&
      verifiedAt === null &&
      row.cf_destination_address_id &&
      this.cloudflare.isDestinationApiConfigured()
    ) {
      try {
        const dest = await this.cloudflare.getDestinationByTag(row.cf_destination_address_id);
        if (dest?.verified) {
          verifiedAt = dest.verified;
          await this.directus.patch(`/items/operator_invites/${encodeURIComponent(row.id)}`, {
            cf_destination_verified_at: verifiedAt,
          });
        }
      } catch (err) {
        // Soft failure on poll — keep returning persisted state, log + move on.
        const reason = err instanceof Error ? err.message : 'unknown';
        this.logger.warn(`getStatus CF poll failed (invite=${row.id}): ${truncate(reason, 200)}`);
      }
    }

    return {
      email_setup_status: row.email_setup_status,
      destination_gmail: row.destination_gmail,
      destination_verified: verifiedAt !== null,
      cf_rule_id: row.cf_rule_id,
      email_setup_failed_reason: row.email_setup_failed_reason,
    };
  }

  async finalize(token: string): Promise<FinalizeResult> {
    const row = await this.lookupByToken(token);
    this.assertFinalizePreconditions(row);
    // Non-null assertions are safe — assertFinalizePreconditions guarantees them.
    const destination = row.destination_gmail as string;
    const cfRuleId = await this.createRoutingRuleOrFail(row.id, row.email, destination);
    const { id: resendKeyId, token: resendKeyPlaintext } = await this.createResendKeyOrFail(
      row.id,
      row.email,
    );

    const now = new Date().toISOString();
    await this.directus.patch(`/items/operator_invites/${encodeURIComponent(row.id)}`, {
      cf_rule_id: cfRuleId,
      resend_key_id: resendKeyId,
      email_setup_status: 'ready',
    });

    this.logger.log(`invite.email_routing.ready invite=${row.id} cf_rule=${cfRuleId}`);
    await this.audit.emit({
      event: 'invite.email_routing.ready',
      severity: 'high',
      actorId: null,
      targetKind: 'invite',
      targetId: row.id,
      payload: { cf_rule_id: cfRuleId, resend_key_id: resendKeyId },
      ts: now,
    });

    return {
      cf_rule_id: cfRuleId,
      resend_key_id: resendKeyId,
      resend_key_plaintext: resendKeyPlaintext,
      email_setup_status: 'ready',
    };
  }

  private assertFinalizePreconditions(row: InviteEmailSetupRow): void {
    if (row.email_setup_status === 'ready' && row.cf_rule_id && row.resend_key_id) {
      throw new ConflictException('email_setup_already_ready');
    }
    if (row.email_setup_status !== 'destination_pending') {
      throw new ConflictException(`email_setup_in_state_${row.email_setup_status}`);
    }
    if (!row.destination_gmail || !row.cf_destination_address_id) {
      throw new ConflictException('email_setup_missing_destination');
    }
    if (row.cf_destination_verified_at === null) {
      throw new ConflictException('email_setup_destination_not_verified');
    }
    if (!this.cloudflare.isConfigured() || !this.resendAdmin.isConfigured()) {
      throw new BadGatewayException('cloudflare_or_resend_not_configured');
    }
  }

  private async createRoutingRuleOrFail(
    inviteId: string,
    aliasEmail: string,
    destination: string,
  ): Promise<string> {
    try {
      const rule = await this.cloudflare.createRoutingRule({
        alias: aliasEmail.toLowerCase(),
        destination,
      });
      return rule.rule_id;
    } catch (err) {
      const reason = err instanceof CloudflareRoutingError ? err.message : 'unknown';
      this.logger.warn(`finalize CF rule create failed: ${reason}`);
      await this.markFailed(inviteId, `cloudflare_create_rule_failed:${truncate(reason, 200)}`);
      throw new BadGatewayException('cloudflare_create_rule_failed');
    }
  }

  private async createResendKeyOrFail(
    inviteId: string,
    operatorEmail: string,
  ): Promise<{ id: string; token: string }> {
    try {
      return await this.resendAdmin.createPerOperatorKey({
        operatorEmail: operatorEmail.toLowerCase(),
      });
    } catch (err) {
      const reason = err instanceof ResendAdminError ? err.message : 'unknown';
      this.logger.warn(`finalize Resend key create failed: ${reason}`);
      await this.markFailed(inviteId, `resend_create_key_failed:${truncate(reason, 200)}`);
      throw new BadGatewayException('resend_create_key_failed');
    }
  }

  private async markFailed(inviteId: string, reason: string): Promise<void> {
    try {
      await this.directus.patch(`/items/operator_invites/${encodeURIComponent(inviteId)}`, {
        email_setup_status: 'failed',
        email_setup_failed_reason: truncate(reason, FAILED_REASON_MAX_LEN),
      });
    } catch (err) {
      // Don't let a failed-state PATCH mask the original error to the caller.
      const msg = err instanceof Error ? err.message : 'unknown';
      this.logger.warn(`markFailed PATCH failed for invite=${inviteId}: ${msg}`);
    }
  }

  // Mirror of AdminInvitesService.lookupByToken — duplicated here to keep
  // F-S2.8.1 purely additive. F-S2.8.2 will refactor to a shared helper.
  private async lookupByToken(plaintext: string): Promise<InviteEmailSetupRow> {
    if (plaintext.length < TOKEN_MIN_LEN || plaintext.length > TOKEN_MAX_LEN) {
      throw new GoneException('invite_invalid');
    }
    const hash = createHash('sha256').update(plaintext).digest('hex');
    const filter = encodeURIComponent(JSON.stringify({ token_hash: { _eq: hash } }));
    const fields =
      'id,email,status,token_hash,expires_at,destination_gmail,cf_destination_address_id,' +
      'cf_destination_verified_at,cf_rule_id,resend_key_id,email_setup_status,email_setup_failed_reason';
    const res = await this.directus.get<{ data: InviteEmailSetupRow[] }>(
      `/items/operator_invites?filter=${filter}&fields=${fields}&limit=1`,
    );
    const row = res.data[0];
    if (!row) throw new GoneException('invite_invalid');
    if (row.status === 'consumed') {
      // Consumed = password was set; email_routing flow is allowed in either
      // pre- or post-consume order. We DON'T 410 here. Only revoked / expired
      // / unknown are terminal-bad.
    }
    if (row.status === 'revoked') throw new GoneException('invite_revoked');
    if (row.status === 'expired' || new Date(row.expires_at) < new Date()) {
      throw new GoneException('invite_expired');
    }
    return row;
  }
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}
