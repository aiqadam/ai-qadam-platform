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

// F-S2.5-c — shape returned by /v1/admin/audit/events.
export interface AuditEventSummary {
  id: string;
  event: string;
  severity: AuditSeverity;
  actor_id: string | null;
  actor_email: string | null;
  target_kind: string | null;
  target_id: string | null;
  country: string | null;
  payload_json: Record<string, unknown> | null;
  ts: string;
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

  // F-S2.5-c — admin list. Filters: severity, event prefix, country,
  // limit. Joins actor_id → email for display.
  async list(filter: {
    severity?: AuditSeverity;
    eventPrefix?: string;
    country?: 'uz' | 'kz' | 'tj' | 'xx';
    limit?: number;
  }): Promise<AuditEventSummary[]> {
    const fields =
      'id,event,severity,actor_id.id,actor_id.email,target_kind,target_id,country,payload_json,ts';
    const filters: Record<string, unknown> = {};
    if (filter.severity) filters.severity = { _eq: filter.severity };
    if (filter.eventPrefix) filters.event = { _starts_with: filter.eventPrefix };
    if (filter.country) filters.country = { _eq: filter.country };
    const filterQs =
      Object.keys(filters).length > 0
        ? `&filter=${encodeURIComponent(JSON.stringify(filters))}`
        : '';
    const limit = Math.min(filter.limit ?? 200, 500);
    type RawRow = Omit<AuditEventSummary, 'actor_id' | 'actor_email'> & {
      actor_id: { id?: string; email?: string } | string | null;
    };
    const res = await this.directus.get<{ data: RawRow[] }>(
      `/items/audit_events?fields=${fields}&sort=-ts&limit=${limit}${filterQs}`,
    );
    return res.data.map((row) => {
      const { actor_id, ...rest } = row;
      let aid: string | null = null;
      let email: string | null = null;
      if (typeof actor_id === 'string') {
        aid = actor_id;
      } else if (actor_id && typeof actor_id === 'object') {
        aid = actor_id.id ?? null;
        email = actor_id.email ?? null;
      }
      return { ...rest, actor_id: aid, actor_email: email } as AuditEventSummary;
    });
  }

  // F-S2.5-c — member-facing access log. Returns events where the
  // caller is EITHER the actor OR the target. Member-friendly fields
  // only (no payload, no actor email — that's for the admin view).
  // The caller passes their LOCAL users.id; we resolve to directus_users.id
  // via the bridge before querying.
  async listForMe(
    localUserId: string,
    limit = 50,
  ): Promise<Array<Pick<AuditEventSummary, 'id' | 'event' | 'severity' | 'target_kind' | 'ts'>>> {
    const directusUserId = await this.directusBridge.resolveDirectusId(localUserId);
    if (!directusUserId) return [];
    const filterJson = JSON.stringify({
      _or: [{ actor_id: { _eq: directusUserId } }, { target_id: { _eq: directusUserId } }],
    });
    const fields = 'id,event,severity,target_kind,ts';
    const res = await this.directus.get<{
      data: Array<Pick<AuditEventSummary, 'id' | 'event' | 'severity' | 'target_kind' | 'ts'>>;
    }>(
      `/items/audit_events?fields=${fields}&sort=-ts&limit=${Math.min(limit, 100)}&filter=${encodeURIComponent(filterJson)}`,
    );
    return res.data;
  }
}
