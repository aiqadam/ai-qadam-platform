import { Inject, Injectable, Logger } from '@nestjs/common';
import { track } from '../../lib/ops-events';
import { DirectusClient } from '../directus/directus.client';
import { CHANNEL_ADAPTERS, type ChannelAdapter } from './channels/adapter.tokens';
import { ConsentService } from './consent.service';
import {
  type Channel,
  type DeliveryState,
  type DispatchDeliveryResult,
  type DispatchInput,
  type DispatchResult,
  type ResolvedRecipient,
} from './interactions.types';

// Sprint 5.5/4 — InteractionsService.dispatch().
//
// One entry point for every outbound message. The shape:
//
//   1. Resolve recipients     (audience.userIds → ResolvedRecipient[])
//   2. Create interaction row (Directus, policy_state='sending')
//   3. For each recipient:
//      a. Resolve channel     (first of allowed_channels; XOR check)
//      b. Check consent       (operational_contract → pass; others → skip)
//      c. Create delivery row (queued)
//      d. Call adapter.send() → AdapterResult
//      e. Patch delivery row  (state + timestamps)
//   4. Patch interaction.policy_state='sent'
//   5. Return DispatchResult
//
// Deliberate non-features here (see interactions.types.ts header):
//   - team / filter audiences  — Phase 3 + 5.5/5+
//   - fallback chain            — 5.5/5
//   - user channel preferences  — 5.5/6
//
// Consent decisions now live in ConsentService (5.5/5b).
//
// Errors at the per-recipient level produce a delivery row with
// state='failed' or 'skipped_*'; the top-level dispatch never throws
// for recipient-scoped problems. It throws only when:
//   - audience produced zero recipients (caller's bug)
//   - Directus is unreachable creating the interaction row
//   - all allowed_channels are unknown to the adapter registry

interface DirectusUser {
  id: string;
  email: string | null;
  country?: string | null;
  // Bigints over Directus REST may serialize as string or number.
  telegram_user_id?: number | string | null;
  telegram_opted_out_at?: string | null;
}

@Injectable()
export class InteractionsService {
  private readonly logger = new Logger(InteractionsService.name);
  private readonly adapterByChannel: Map<Channel, ChannelAdapter>;

  constructor(
    private readonly directus: DirectusClient,
    private readonly consent: ConsentService,
    @Inject(CHANNEL_ADAPTERS) adapters: ChannelAdapter[],
  ) {
    this.adapterByChannel = new Map(adapters.map((a) => [a.channel, a]));
  }

  async dispatch(input: DispatchInput): Promise<DispatchResult> {
    const recipients = await this.resolveRecipients(input);
    if (recipients.length === 0) {
      throw new Error('dispatch: audience resolved to zero recipients');
    }

    const channel = this.pickPrimaryChannel(input.allowedChannels);
    const interactionId = await this.createInteractionRow(input, 'sending');

    const deliveries: DispatchDeliveryResult[] = [];
    for (const recipient of recipients) {
      deliveries.push(await this.deliverToRecipient({ interactionId, recipient, channel, input }));
    }

    await this.patchInteractionRow(interactionId, { policy_state: 'sent' });

    return { interactionId, deliveries };
  }

  private async deliverToRecipient(args: {
    interactionId: string;
    recipient: ResolvedRecipient;
    channel: Channel;
    input: DispatchInput;
  }): Promise<DispatchDeliveryResult> {
    const { interactionId, recipient, channel, input } = args;

    const consentOk = await this.consent.check({
      userId: recipient.userId,
      initiatorActor: input.initiatorActor,
      intent: input.intent,
      consentBasis: input.consentBasis,
      consentScope: input.consentScope,
    });
    if (!consentOk.ok) {
      const deliveryId = await this.createDeliveryRow({
        interactionId,
        recipient,
        channel,
        state: 'skipped_consent',
        failureReason: consentOk.reason,
      });
      return {
        deliveryId,
        recipientUserId: recipient.userId,
        channel,
        state: 'skipped_consent',
        failureReason: consentOk.reason,
      };
    }

    const deliveryId = await this.createDeliveryRow({
      interactionId,
      recipient,
      channel,
      state: 'queued',
      failureReason: null,
    });

    const adapter = this.adapterByChannel.get(channel);
    if (!adapter) {
      const reason = `no adapter registered for channel=${channel}`;
      await this.patchDeliveryRow(deliveryId, { state: 'failed', failure_reason: reason });
      // Ops event: operator wants to know if a channel is mis-configured.
      void track('dispatch.failed', {
        channel,
        intent: input.intent,
        reason: 'no_adapter',
      });
      return {
        deliveryId,
        recipientUserId: recipient.userId,
        channel,
        state: 'failed',
        failureReason: reason,
      };
    }

    // F-S1.1c ext — per-recipient payload renderer. When set, replaces
    // input.payload for this delivery. Renderer failure marks the
    // delivery `failed` without invoking the adapter — better than
    // sending a half-rendered email.
    let renderedPayload = input.payload;
    if (input.renderPayload) {
      try {
        renderedPayload = await input.renderPayload({
          recipient: { userId: recipient.userId, email: recipient.email ?? null },
          deliveryId,
        });
      } catch (err) {
        const reason = err instanceof Error ? err.message : 'render_failed';
        await this.patchDeliveryRow(deliveryId, { state: 'failed', failure_reason: reason });
        void track('dispatch.failed', {
          channel,
          intent: input.intent,
          reason: 'render_failed',
        });
        return {
          deliveryId,
          recipientUserId: recipient.userId,
          channel,
          state: 'failed',
          failureReason: reason,
        };
      }
    }

    const result = await adapter.send({
      recipient,
      intent: input.intent,
      payload: renderedPayload,
    });

    const patch: Record<string, unknown> = { state: result.state };
    if (result.state === 'sent') {
      patch.delivered_at = new Date().toISOString();
    }
    if (result.failureReason !== undefined) {
      patch.failure_reason = result.failureReason;
    }
    await this.patchDeliveryRow(deliveryId, patch);

    if (result.state === 'failed') {
      // Ops event: adapter returned a failure (SMTP error, API timeout,
      // etc.). reason is the adapter's failure_reason if present, else
      // a short marker.
      void track('dispatch.failed', {
        channel,
        intent: input.intent,
        reason: result.failureReason ?? 'adapter_failed',
      });
    }

    return {
      deliveryId,
      recipientUserId: recipient.userId,
      channel,
      state: result.state,
      failureReason: result.failureReason ?? null,
    };
  }

  // ────────────────────────── private helpers ──────────────────────────

  private pickPrimaryChannel(allowed: readonly Channel[]): Channel {
    const first = allowed[0];
    if (!first) {
      throw new Error('dispatch: allowedChannels is empty');
    }
    return first;
  }

  private async resolveRecipients(input: DispatchInput): Promise<ResolvedRecipient[]> {
    const ids = input.audience.userIds;
    // De-dup defensively — fan-out logic upstream may double-add.
    const unique = Array.from(new Set(ids));
    // Always fetch telegram + tenant fields too — the TelegramAdapter needs
    // them. Adapters that don't (Email, InApp) just ignore them. One batch
    // fetch beats per-channel re-queries.
    const fields = encodeURIComponent('id,email,country,telegram_user_id,telegram_opted_out_at');
    const filter = encodeURIComponent(JSON.stringify({ id: { _in: unique } }));
    const res = await this.directus.get<{ data: DirectusUser[] }>(
      `/users?fields=${fields}&filter=${filter}&limit=${unique.length}`,
    );
    const byId = new Map(res.data.map((u) => [u.id, u]));
    return unique
      .map((id) => byId.get(id))
      .filter((u): u is DirectusUser => Boolean(u))
      .map((u) => ({
        userId: u.id,
        email: u.email ?? null,
        telegramUserId: u.telegram_user_id == null ? null : String(u.telegram_user_id),
        telegramOptedOutAt: u.telegram_opted_out_at ?? null,
        tenant: u.country ?? null,
      }));
  }

  private async createInteractionRow(input: DispatchInput, state: 'sending'): Promise<string> {
    const body: Record<string, unknown> = {
      initiator_actor: input.initiatorActor,
      audience: input.audience,
      intent: input.intent,
      payload: input.payload,
      consent_basis: input.consentBasis,
      allowed_channels: input.allowedChannels,
      fallback_chain: input.fallbackChain ?? [],
      policy_state: state,
    };
    if (input.initiatorId !== undefined && input.initiatorId !== null) {
      body.initiator_id = input.initiatorId;
    }
    if (input.consentScope !== undefined && input.consentScope !== null) {
      body.consent_scope = input.consentScope;
    }
    if (input.scheduledFor) {
      body.scheduled_for = input.scheduledFor;
    }
    if (input.expiresAt) {
      body.expires_at = input.expiresAt;
    }
    if (input.experimentAssignment) {
      body.experiment_assignment = input.experimentAssignment;
    }
    if (input.createdBy) {
      body.created_by = input.createdBy;
    }
    const res = await this.directus.post<{ data: { id: string } }>('/items/interactions', body);
    return res.data.id;
  }

  private async patchInteractionRow(id: string, patch: Record<string, unknown>): Promise<void> {
    await this.directus.patch(`/items/interactions/${id}`, patch);
  }

  private async createDeliveryRow(input: {
    interactionId: string;
    recipient: ResolvedRecipient;
    channel: Channel;
    state: DeliveryState;
    failureReason: string | null;
  }): Promise<string> {
    const body: Record<string, unknown> = {
      interaction: input.interactionId,
      recipient_user: input.recipient.userId,
      channel: input.channel,
      state: input.state,
    };
    if (input.failureReason !== null) {
      body.failure_reason = input.failureReason;
    }
    const res = await this.directus.post<{ data: { id: string } }>(
      '/items/interaction_deliveries',
      body,
    );
    return res.data.id;
  }

  private async patchDeliveryRow(id: string, patch: Record<string, unknown>): Promise<void> {
    await this.directus.patch(`/items/interaction_deliveries/${id}`, patch);
  }
}
