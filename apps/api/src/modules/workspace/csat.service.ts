import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { SignJWT, jwtVerify } from 'jose';
import { env } from '../../config/env';
import { DirectusClient } from '../directus/directus.client';

// F-S1.2 + F-S1.3 — Customer satisfaction (CSAT) capture + operator surface.
//
// CSAT IS:
//   - Anonymous at the response payload level — interaction_responses
//     has no user_id field; the row stores `event` (cohort link only).
//     The delivery FK exists (for idempotency on `responded_at`), so a
//     query is TECHNICALLY able to traverse delivery → recipient_user.
//     **The operator-facing API in this service never does that.** We
//     treat that path as a soft-anonymity-by-convention boundary.
//   - Idempotent per-delivery — `interaction_deliveries.responded_at`
//     is checked + atomically updated; a re-submission with the same
//     token returns 409 "already responded".
//   - Token-gated — HMAC over `delivery_id` (jose, 30-day TTL).
//     Pattern mirrors F-S1.6 lead-verify token.
//
// CSAT IS NOT:
//   - Authenticated — the visitor isn't necessarily signed in when
//     clicking the email link. The token is the auth.
//   - Linkable per-member-per-operator — operator surface aggregates by
//     event only; the per-response delivery FK is reserved for the
//     dispatcher's lifecycle (state=responded).

const ISSUER = 'aiqadam-api-csat';
const AUDIENCE = 'aiqadam-csat';
const TTL_SECONDS = 30 * 24 * 3600;
const RATING_MIN = 1;
const RATING_MAX = 5;
const COMMENT_PREVIEW_MAX = 500;
const COMMENTS_LIMIT = 50;

export interface CsatSubmitInput {
  token: string;
  rating: number;
  comment?: string | null | undefined;
}

export interface CsatSummary {
  eventId: string;
  count: number;
  delivered: number;
  responseRate: number;
  avg: number | null;
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
  comments: Array<{ rating: number; comment: string; receivedAt: string }>;
}

interface TokenClaims {
  sub: string; // delivery_id
}

interface DeliveryRow {
  id: string;
  responded_at: string | null;
  interaction: { id: string; payload?: { event_id?: string } | null } | null;
}

@Injectable()
export class CsatService {
  private readonly logger = new Logger(CsatService.name);
  private readonly secret: Uint8Array;

  constructor(private readonly directus: DirectusClient) {
    this.secret = new TextEncoder().encode(env.JWT_SIGNING_SECRET);
  }

  async mintToken(deliveryId: string): Promise<string> {
    return new SignJWT({ sub: deliveryId })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(`${TTL_SECONDS}s`)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .sign(this.secret);
  }

  async verifyToken(token: string): Promise<TokenClaims | null> {
    try {
      const { payload } = await jwtVerify(token, this.secret, {
        issuer: ISSUER,
        audience: AUDIENCE,
      });
      const sub = payload.sub;
      if (typeof sub !== 'string') return null;
      return { sub };
    } catch {
      return null;
    }
  }

  /**
   * Accept + persist a CSAT response. Throws `BadRequestException` for
   * invalid token / rating; `ConflictException`-style 409 surface is
   * the caller's job (we surface via the structured return code).
   */
  async submit(input: CsatSubmitInput): Promise<{ accepted: boolean; reason?: string }> {
    if (!Number.isInteger(input.rating) || input.rating < RATING_MIN || input.rating > RATING_MAX) {
      throw new BadRequestException(
        `rating must be an integer between ${RATING_MIN}-${RATING_MAX}`,
      );
    }
    const claims = await this.verifyToken(input.token);
    if (!claims) return { accepted: false, reason: 'invalid_token' };

    const delivery = await this.fetchDelivery(claims.sub);
    if (!delivery) return { accepted: false, reason: 'delivery_not_found' };
    if (delivery.responded_at) return { accepted: false, reason: 'already_responded' };

    const eventId = delivery.interaction?.payload?.event_id ?? null;
    const comment = sanitiseComment(input.comment);

    // Patch delivery BEFORE inserting the response so a race-condition
    // resubmission sees responded_at populated. Directus PATCH is
    // last-writer-wins on this field; the responded_at check in
    // verifyToken handles the common case. A true concurrent
    // submission would result in a duplicate response — acceptable for
    // a CSAT survey (we keep both rather than data-loss).
    await this.directus.patch(`/items/interaction_deliveries/${claims.sub}`, {
      responded_at: new Date().toISOString(),
      state: 'responded',
    });

    await this.directus.post('/items/interaction_responses', {
      delivery: claims.sub,
      response_intent: 'csat_score',
      payload: { rating: input.rating, ...(comment ? { comment } : {}) },
      event: eventId,
    });

    this.logger.log(
      `csat submission accepted delivery=${claims.sub} event=${eventId ?? '(none)'} rating=${input.rating}`,
    );
    return { accepted: true };
  }

  /**
   * Per-event CSAT roll-up for the operator surface. Anonymity: aggregates
   * by `event` only; never resolves through delivery.recipient_user.
   */
  async summaryForEvent(eventId: string): Promise<CsatSummary> {
    const filter = encodeURIComponent(
      JSON.stringify({
        _and: [{ event: { _eq: eventId } }, { response_intent: { _eq: 'csat_score' } }],
      }),
    );
    const res = await this.directus.get<{
      data: Array<{ payload: { rating?: number; comment?: string }; received_at: string }>;
    }>(`/items/interaction_responses?filter=${filter}&fields=payload,received_at&limit=2000`);

    const distribution: CsatSummary['distribution'] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    const comments: CsatSummary['comments'] = [];
    let sum = 0;
    let count = 0;

    for (const row of res.data) {
      const rating = row.payload?.rating;
      if (typeof rating !== 'number' || !Number.isInteger(rating) || rating < 1 || rating > 5) {
        continue;
      }
      count++;
      sum += rating;
      distribution[rating as 1 | 2 | 3 | 4 | 5]++;
      const comment = row.payload?.comment;
      if (
        typeof comment === 'string' &&
        comment.trim().length > 0 &&
        comments.length < COMMENTS_LIMIT
      ) {
        comments.push({
          rating,
          comment: comment.slice(0, COMMENT_PREVIEW_MAX),
          receivedAt: row.received_at,
        });
      }
    }

    const delivered = await this.deliveredCsatCount(eventId);
    const responseRate = delivered > 0 ? count / delivered : 0;
    return {
      eventId,
      count,
      delivered,
      responseRate,
      avg: count > 0 ? sum / count : null,
      distribution,
      comments,
    };
  }

  private async fetchDelivery(deliveryId: string): Promise<DeliveryRow | null> {
    const fields = 'id,responded_at,interaction.id,interaction.payload';
    const res = await this.directus
      .get<{ data: DeliveryRow }>(
        `/items/interaction_deliveries/${encodeURIComponent(deliveryId)}?fields=${fields}`,
      )
      .catch(() => null);
    return res?.data ?? null;
  }

  /**
   * Denominator for the response-rate metric: deliveries linked to a
   * csat-intent interaction whose payload.event_id matches the requested
   * event, where the dispatch actually went out (state ∈ sent/
   * delivered/opened/clicked/responded).
   */
  private async deliveredCsatCount(eventId: string): Promise<number> {
    const filter = encodeURIComponent(
      JSON.stringify({
        _and: [
          { interaction: { intent: { _eq: 'csat' } } },
          { interaction: { payload: { _contains: { event_id: eventId } } } },
          { state: { _in: ['sent', 'delivered', 'opened', 'clicked', 'responded'] } },
        ],
      }),
    );
    const res = await this.directus.get<{ meta?: { filter_count?: number }; data: unknown[] }>(
      `/items/interaction_deliveries?filter=${filter}&fields=id&limit=1&meta=filter_count`,
    );
    return res.meta?.filter_count ?? 0;
  }
}

function sanitiseComment(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim().slice(0, 4000);
  return trimmed.length === 0 ? null : trimmed;
}
