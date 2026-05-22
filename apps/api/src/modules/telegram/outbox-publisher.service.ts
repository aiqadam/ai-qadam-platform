import { Inject, Injectable } from '@nestjs/common';
import { DB, type Db } from '../../db';
import { outbox } from './schema';

// Tx-scoped helper for writing outbox rows. Callers (e.g. the
// TelegramAdapter on A6, the link confirm flow if it grows event-emitting
// later) build an envelope JSON + pass a Drizzle transaction. We insert
// with ON CONFLICT DO NOTHING so producer retries are safe — the same
// envelope_id can't double-publish.
//
// CRITICAL: this must be called INSIDE the same transaction as the state
// change that emits the envelope. If you call it outside the tx, you
// reintroduce the dual-write problem this whole pattern exists to solve.
// The signature takes the tx so the type system reminds you.

export interface OutboxPublishInput {
  envelopeId: string;
  stream: string;
  // Pre-serialized envelope; producer is responsible for shape per
  // ADR-0034 §"ESB contract".
  payload: Record<string, unknown>;
}

// Drizzle's tx type matches the top-level Db at the type level, but
// callers should pass the tx explicitly.
export type DrizzleTx = Db;

@Injectable()
export class OutboxPublisher {
  constructor(@Inject(DB) private readonly _db: Db) {
    // db is held only for tests that want to bypass tx semantics; the
    // public methods all take a tx parameter.
    void this._db;
  }

  /**
   * Insert an envelope into the outbox for the relay loop to publish.
   * MUST be called inside the same tx as the state change emitting it.
   *
   * @returns true if inserted, false if envelope_id already existed.
   */
  async publish(tx: DrizzleTx, input: OutboxPublishInput): Promise<boolean> {
    const inserted = await tx
      .insert(outbox)
      .values({
        envelopeId: input.envelopeId,
        stream: input.stream,
        payload: input.payload,
      })
      .onConflictDoNothing({ target: outbox.envelopeId })
      .returning({ envelopeId: outbox.envelopeId });
    return inserted.length > 0;
  }
}
