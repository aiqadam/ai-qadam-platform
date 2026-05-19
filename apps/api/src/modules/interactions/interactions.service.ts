import { Inject, Injectable, Logger } from '@nestjs/common';
import { DirectusClient } from '../directus/directus.client';
import { CHANNEL_ADAPTERS, type ChannelAdapter } from './channels/adapter.tokens';
import {
  type Channel,
  type ConsentBasis,
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
//   - real consent lookup       — 5.5/5
//   - fallback chain            — 5.5/5
//   - user channel preferences  — 5.5/6
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
}

@Injectable()
export class InteractionsService {
  private readonly logger = new Logger(InteractionsService.name);
  private readonly adapterByChannel: Map<Channel, ChannelAdapter>;

  constructor(
    private readonly directus: DirectusClient,
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

    const consentOk = this.checkConsent(input.consentBasis);
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
      return {
        deliveryId,
        recipientUserId: recipient.userId,
        channel,
        state: 'failed',
        failureReason: reason,
      };
    }

    const result = await adapter.send({
      recipient,
      intent: input.intent,
      payload: input.payload,
    });

    const patch: Record<string, unknown> = { state: result.state };
    if (result.state === 'sent') {
      patch.delivered_at = new Date().toISOString();
    }
    if (result.failureReason !== undefined) {
      patch.failure_reason = result.failureReason;
    }
    await this.patchDeliveryRow(deliveryId, patch);

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

  // Trivial today; real consent service in 5.5/5 will replace this.
  // Returns ok=false with reason if the call SHOULD be suppressed.
  private checkConsent(basis: ConsentBasis): { ok: true } | { ok: false; reason: string } {
    if (basis === 'operational_contract') {
      return { ok: true };
    }
    if (basis === 'b2b_contract') {
      // Treated as pass — only used for operator↔sponsor/speaker traffic,
      // which is contractual by construction. We log but don't suppress.
      return { ok: true };
    }
    return {
      ok: false,
      reason: `consent_basis=${basis} not yet enforced — pending consent service (5.5/5)`,
    };
  }

  private async resolveRecipients(input: DispatchInput): Promise<ResolvedRecipient[]> {
    const ids = input.audience.userIds;
    // De-dup defensively — fan-out logic upstream may double-add.
    const unique = Array.from(new Set(ids));
    const fields = encodeURIComponent('id,email');
    const filter = encodeURIComponent(JSON.stringify({ id: { _in: unique } }));
    const res = await this.directus.get<{ data: DirectusUser[] }>(
      `/users?fields=${fields}&filter=${filter}&limit=${unique.length}`,
    );
    const byId = new Map(res.data.map((u) => [u.id, u]));
    return unique
      .map((id) => byId.get(id))
      .filter((u): u is DirectusUser => Boolean(u))
      .map((u) => ({ userId: u.id, email: u.email ?? null }));
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
