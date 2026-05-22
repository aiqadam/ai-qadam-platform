import { Injectable, Logger } from '@nestjs/common';
import { DirectusUsersBridgeService } from '../directus/directus-users-bridge.service';
import { DirectusClient, DirectusError } from '../directus/directus.client';

// F-S2.5-b — append-only audit writer. Wraps `/items/audit_events`
// with the same "fire and forget" posture as ops-events: a failure to
// log MUST NOT break the request path. The caller's outcome (e.g.
// invite created) is observable in Directus + Loki regardless.
//
// Dual-emit convention until F-S2.5-c surfaces lands:
//   1. Caller still logs structured JSON to Loki (existing pattern).
//   2. Caller ALSO calls AuditEventsService.emit() for indelible storage.
// The Loki path is the operational view; this collection is the long-
// term audit trail.

export type AuditSeverity = 'info' | 'high' | 'critical';

export interface AuditEventInput {
  event: string; // dot-namespaced, e.g. invite.created
  severity?: AuditSeverity;
  // actorId is the LOCAL users.id (req.user.sub). The service resolves
  // to directus_users.id via the bridge before insert (FK requirement).
  actorId?: string | null;
  targetKind?: string | null;
  targetId?: string | null;
  country?: 'uz' | 'kz' | 'tj' | 'xx' | null;
  payload?: Record<string, unknown> | null;
  ts?: string; // optional explicit timestamp; defaults to now()
}

@Injectable()
export class AuditEventsService {
  private readonly logger = new Logger(AuditEventsService.name);

  constructor(
    private readonly directus: DirectusClient,
    private readonly directusBridge: DirectusUsersBridgeService,
  ) {}

  // Fire and forget. Caller MUST NOT await this if a Directus outage
  // would also break the surrounding business logic — but most call
  // sites are fine to await since logging is already in the happy path.
  async emit(input: AuditEventInput): Promise<void> {
    try {
      const actorDirectusId = input.actorId
        ? await this.directusBridge.resolveDirectusId(input.actorId)
        : null;
      await this.directus.post('/items/audit_events', {
        event: input.event,
        severity: input.severity ?? 'info',
        actor_id: actorDirectusId,
        target_kind: input.targetKind ?? null,
        target_id: input.targetId ?? null,
        country: input.country ?? null,
        payload_json: input.payload ?? null,
        ts: input.ts ?? new Date().toISOString(),
      });
    } catch (err) {
      // Logged but swallowed. Audit storage is observability; failures
      // are themselves observable in Loki via this warn.
      const reason = err instanceof DirectusError ? `${err.status} ${err.path}` : String(err);
      this.logger.warn(`[audit] emit failed (event=${input.event}): ${reason}`);
    }
  }
}
