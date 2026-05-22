import { z } from 'zod';

// Sprint 5.5/4 — minimum-viable shape for dispatch().
//
// What's deliberately deferred:
//   - audience.team_ids   → wait for Phase 3 teams collection
//   - audience.filter     → defer until first real need (5.5/5+)
//   - consent lookup      → only `operational_contract` passes today
//                           (5.5/5 wires consent_records + eula_acceptances)
//   - fallback_chain      → primary-channel only for now; chain runs in
//                           5.5/5 once we have observed failure modes
//   - user channel prefs  → 5.5/6 ships /me/preferences

export const CHANNELS = ['email', 'telegram', 'in_app', 'push', 'crm', 'sms', 'web_modal'] as const;
export type Channel = (typeof CHANNELS)[number];

export const INITIATOR_ACTORS = [
  'operator',
  'sponsor',
  'speaker',
  'client',
  'team',
  'system',
] as const;
export type InitiatorActor = (typeof INITIATOR_ACTORS)[number];

export const CONSENT_BASES = [
  'operational_contract',
  'event_eula',
  'explicit_opt_in',
  'client_initiated',
  'b2b_contract',
] as const;
export type ConsentBasis = (typeof CONSENT_BASES)[number];

export const DELIVERY_STATES = [
  'queued',
  'sent',
  'delivered',
  'opened',
  'clicked',
  'responded',
  'failed',
  'skipped_consent',
  'skipped_policy',
] as const;
export type DeliveryState = (typeof DELIVERY_STATES)[number];

export const dispatchInputSchema = z.object({
  initiatorActor: z.enum(INITIATOR_ACTORS),
  initiatorId: z.string().uuid().nullable().optional(),
  audience: z.object({
    userIds: z.array(z.string().uuid()).min(1),
  }),
  intent: z.string().min(1).max(60),
  payload: z.record(z.string(), z.unknown()),
  consentBasis: z.enum(CONSENT_BASES),
  consentScope: z.record(z.string(), z.unknown()).nullable().optional(),
  allowedChannels: z.array(z.enum(CHANNELS)).min(1),
  // Optional; reserved for 5.5/5+
  fallbackChain: z.array(z.enum(CHANNELS)).optional(),
  scheduledFor: z.string().datetime().nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  experimentAssignment: z.record(z.string(), z.unknown()).nullable().optional(),
  createdBy: z.string().uuid().nullable().optional(),
});

export type DispatchInput = z.infer<typeof dispatchInputSchema>;

export interface ResolvedRecipient {
  userId: string;
  email: string | null;
  // Telegram-link fields, populated by InteractionsService.resolveRecipients
  // when the recipient's directus_users row has them set. All three are
  // null when the user hasn't completed /link or has opted out.
  telegramUserId: string | null;
  telegramOptedOutAt: string | null;
  tenant: string | null;
}

export interface DispatchDeliveryResult {
  deliveryId: string;
  recipientUserId: string;
  channel: Channel;
  state: DeliveryState;
  failureReason: string | null;
}

export interface DispatchResult {
  interactionId: string;
  deliveries: DispatchDeliveryResult[];
}

// Outcome an adapter returns. The service translates this into a state
// update on the delivery row.
export interface AdapterResult {
  state: 'sent' | 'failed' | 'skipped_policy';
  failureReason?: string;
}

export interface ChannelAdapter {
  readonly channel: Channel;
  send(input: {
    recipient: ResolvedRecipient;
    intent: string;
    payload: Record<string, unknown>;
  }): Promise<AdapterResult>;
}
