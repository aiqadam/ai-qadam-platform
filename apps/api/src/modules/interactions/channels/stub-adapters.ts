import { Injectable, Logger } from '@nestjs/common';
import type {
  AdapterResult,
  Channel,
  ChannelAdapter,
  ResolvedRecipient,
} from '../interactions.types';

// Placeholder adapters for channels we'll wire later. Each returns
// state='skipped_policy' so the dispatcher records a delivery row that
// explains WHY this channel didn't fire ("not implemented yet"),
// instead of silently dropping or 500ing.
//
// Replaced by real implementations:
//   - Telegram   → A6 (this PR). Lives in ./telegram-adapter.ts.
//   - In-app     → Phase 1 W-stream (notifications drawer)
//   - Push       → much later, if ever
//   - CRM        → 5.5/5 wraps the existing CrmController.logActivity flow
//   - SMS        → only if a phone-verification provider lands (Sprint 7)
//   - Web modal  → only if/when the web app grows a "current ad slot"

abstract class NotImplementedAdapter implements ChannelAdapter {
  abstract readonly channel: Channel;
  protected readonly logger = new Logger(this.constructor.name);

  async send(input: {
    recipient: ResolvedRecipient;
    intent: string;
    payload: Record<string, unknown>;
  }): Promise<AdapterResult> {
    this.logger.debug(
      `channel=${this.channel} not yet implemented; skipping intent=${input.intent} user=${input.recipient.userId}`,
    );
    return {
      state: 'skipped_policy',
      failureReason: `channel ${this.channel} not implemented`,
    };
  }
}

@Injectable()
export class InAppAdapter extends NotImplementedAdapter {
  readonly channel = 'in_app' as const;
}

@Injectable()
export class CrmAdapter extends NotImplementedAdapter {
  readonly channel = 'crm' as const;
}
