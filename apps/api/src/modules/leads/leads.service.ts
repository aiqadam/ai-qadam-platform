import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { DirectusClient, DirectusError } from '../directus/directus.client';
import { InteractionsService } from '../interactions/interactions.service';
import { LeadVerifyTokenService } from './lead-verify-token.service';

// F-S1.6 — lead capture + 3-email nurture.
//
// Flow:
//   POST /v1/leads → create or upsert directus_users row (state='lead',
//                    email_verified=false), dispatch T+0 verify email
//   GET  /v1/leads/verify?token=... → flip email_verified=true
//   cron T+3 (in flows-bootstrap.sh) → for each lead with verified email +
//                    created_at ≈ now()-3d → dispatch community-value email
//   cron T+7 → next-event teaser (event-aware fallback inside template)
//   POST /v1/internal/leads/convert (called from auth callback) →
//                    if existing lead matches Authentik email, upgrade
//                    state to 'member' + dispatch conversion email
//
// Duplicate-email handling: if a row already exists with the same email,
// we update its lead-side fields and re-dispatch the verify email IF the
// existing row is still state='lead' and not yet verified. If the row is
// already a member, no nurture is sent — the operator should target them
// via /workspace/announce instead.

export interface CreateLeadInput {
  email: string;
  city?: string;
  interestTopics?: string[];
  sourceUrl?: string;
  acquisitionSource?: Record<string, unknown>;
}

export interface CreateLeadResult {
  status: 'created' | 'already_member' | 'reverification_sent' | 'already_verified';
  userId: string;
}

interface DirectusUserRow {
  id: string;
  email: string;
  state?: string | null;
  email_verified?: boolean | null;
}

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);

  constructor(
    private readonly directus: DirectusClient,
    private readonly interactions: InteractionsService,
    private readonly tokens: LeadVerifyTokenService,
  ) {}

  async create(input: CreateLeadInput): Promise<CreateLeadResult> {
    const email = normalizeEmail(input.email);
    if (!email) throw new BadRequestException('email required');

    const existing = await this.findByEmail(email);
    if (existing?.state && existing.state !== 'lead') {
      this.logger.log(
        `lead create skipped — email already a member (state=${existing.state}) user=${existing.id}`,
      );
      return { status: 'already_member', userId: existing.id };
    }

    // Guard: address already verified — patching would reset email_verified to false
    // and dispatchVerifyEmail would send a duplicate. Return early to prevent both.
    if (existing?.email_verified) {
      this.logger.log(`lead create skipped — email already verified user=${existing.id}`);
      return { status: 'already_verified', userId: existing.id };
    }

    const userId = existing
      ? await this.patchLead(existing.id, input)
      : await this.insertLead(email, input);
    await this.dispatchVerifyEmail(userId, email, input.city);
    return { status: existing ? 'reverification_sent' : 'created', userId };
  }

  private async patchLead(id: string, input: CreateLeadInput): Promise<string> {
    await this.directus.patch(`/users/${id}`, {
      state: 'lead',
      email_verified: false,
      ...leadFields(input),
    });
    return id;
  }

  private async insertLead(email: string, input: CreateLeadInput): Promise<string> {
    const created = await this.directus.post<{ data: { id: string } }>('/users', {
      email,
      state: 'lead',
      email_verified: false,
      ...leadFields(input),
    });
    return created.data.id;
  }

  async verify(token: string): Promise<{ userId: string; email: string } | null> {
    const claims = await this.tokens.verify(token);
    if (!claims) return null;
    // Idempotent flip — re-clicking the link is fine.
    await this.directus.patch(`/users/${claims.sub}`, {
      email_verified: true,
      email_verified_at: new Date().toISOString(),
    });
    return { userId: claims.sub, email: claims.email };
  }

  /**
   * Called from auth.controller.ts OIDC callback. If an existing lead
   * row matches the Authentik email, upgrade state to 'member' +
   * dispatch the conversion email. No-op if no lead exists OR if the
   * user is already a member.
   */
  async convertLeadToMember(userId: string, email: string): Promise<{ converted: boolean }> {
    let row: DirectusUserRow | null;
    try {
      const res = await this.directus.get<{ data: DirectusUserRow }>(
        `/users/${userId}?fields=id,email,state,email_verified`,
      );
      row = res.data ?? null;
    } catch (err) {
      if (err instanceof DirectusError && err.status === 404) return { converted: false };
      throw err;
    }
    if (!row || row.state !== 'lead') return { converted: false };

    await this.directus.patch(`/users/${userId}`, {
      state: 'member',
      email_verified: true,
      email_verified_at: row.email_verified ? undefined : new Date().toISOString(),
    });

    await this.interactions
      .dispatch({
        initiatorActor: 'system',
        audience: { userIds: [userId] },
        intent: 'lead_converted_to_member',
        payload: {
          subject: "You're in — welcome to AI Qadam",
          text: 'Hi,\n\nThanks for confirming your email and signing up for an account. You can manage your event preferences anytime at https://aiqadam.org/me/preferences.\n\nSee you at the next event.\n\n— AI Qadam',
        },
        consentBasis: 'operational_contract',
        allowedChannels: ['email'],
      })
      .catch((err) =>
        this.logger.warn(
          `lead conversion email dispatch failed for ${userId}: ${err instanceof Error ? err.message : 'unknown'}`,
        ),
      );

    this.logger.log(`lead converted to member user=${userId} email=${email}`);
    return { converted: true };
  }

  private async dispatchVerifyEmail(userId: string, email: string, city?: string): Promise<void> {
    const token = await this.tokens.mint(userId, email);
    const link = `https://aiqadam.org/api/v1/leads/verify?token=${encodeURIComponent(token)}`;
    const cityLine = city ? `events in ${city}` : 'AI Qadam events';
    await this.interactions
      .dispatch({
        initiatorActor: 'system',
        audience: { userIds: [userId] },
        intent: 'lead_welcome_verify',
        payload: {
          subject: `Confirm your AI Qadam updates${city ? ` for ${city}` : ''}`,
          text: `Hi,\n\nTap the link below to confirm you'd like updates about ${cityLine}. We send around two emails per month, max — no spam.\n\n${link}\n\n— AI Qadam\n\nIf you didn't sign up, ignore this email.`,
        },
        // operational because consent_basis enforcement at this stage
        // is: "did the visitor type their own email into our form" =
        // implicit + immediate; dispatcher will not block.
        consentBasis: 'operational_contract',
        allowedChannels: ['email'],
      })
      .catch((err) =>
        this.logger.warn(
          `lead verify email dispatch failed for ${userId}: ${err instanceof Error ? err.message : 'unknown'}`,
        ),
      );
  }

  private async findByEmail(email: string): Promise<DirectusUserRow | null> {
    const fields = 'id,email,state,email_verified';
    const filter = encodeURIComponent(JSON.stringify({ email: { _eq: email } }));
    const res = await this.directus.get<{ data: DirectusUserRow[] }>(
      `/users?fields=${fields}&filter=${filter}&limit=1`,
    );
    return res.data[0] ?? null;
  }
}

function normalizeEmail(raw: string | undefined): string {
  if (!raw) return '';
  return raw.trim().toLowerCase();
}

function leadFields(input: CreateLeadInput): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (input.city) out.city = input.city;
  if (input.interestTopics) out.interest_topics = input.interestTopics;
  if (input.sourceUrl) out.source_url = input.sourceUrl;
  if (input.acquisitionSource) out.acquisition_source = input.acquisitionSource;
  return out;
}
