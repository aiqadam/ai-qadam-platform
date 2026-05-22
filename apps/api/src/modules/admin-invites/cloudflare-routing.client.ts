import { Injectable, Logger } from '@nestjs/common';
import { env } from '../../config/env';

// F-S2.8: thin wrapper over Cloudflare's Email Routing Rules API. One
// call per invite: create a forwarding rule that routes
// `<alias>@aiqadam.org` -> `<destination_gmail>`.
//
// Idempotency: before creating, list existing rules for the zone and
// skip if a rule with a matching `to` matcher value already exists.
// At our scale (<100 operators) a single 200-row page is enough; if we
// outgrow that, paginate via the `result_info.cursor` field.
//
// All methods throw CloudflareRoutingError on non-2xx OR on a CF body
// with `success: false`. Callers decide whether to fail the parent
// operation; admin-invites currently records the failure into
// `partial_failures` rather than rolling back the invite — manual
// setup via dashboard is always a valid fallback.

export class CloudflareRoutingError extends Error {
  constructor(
    public readonly status: number,
    public readonly path: string,
    public readonly body: string,
  ) {
    super(`Cloudflare ${status} ${path}: ${body.slice(0, 200)}`);
    this.name = 'CloudflareRoutingError';
  }
}

export interface CloudflareRoutingRule {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  matchers: Array<{ field: string; type: string; value: string }>;
  actions: Array<{ type: string; value: string[] }>;
}

interface CloudflareEnvelope<T> {
  success: boolean;
  result: T;
  errors: Array<{ code: number; message: string }>;
  messages: Array<{ code: number; message: string }>;
}

export interface CreateRoutingRuleInput {
  alias: string; // e.g. "binali.rustamov@aiqadam.org"
  destination: string; // verified destination address (personal Gmail)
}

export interface CreateRoutingRuleResult {
  rule_id: string;
  already_existed: boolean;
}

// Cloudflare Email Routing rule priority is 0..2147483647; lower runs
// first. We use 50 so per-operator rules outrank an eventual
// catch-all/landing-page rule at 100.
const OPERATOR_RULE_PRIORITY = 50;
const LIST_PAGE_SIZE = 200;

@Injectable()
export class CloudflareRoutingClient {
  private readonly logger = new Logger(CloudflareRoutingClient.name);
  private readonly token = env.CLOUDFLARE_API_TOKEN ?? '';
  private readonly zoneId = env.CLOUDFLARE_ZONE_ID ?? '';
  private readonly base = 'https://api.cloudflare.com/client/v4';

  isConfigured(): boolean {
    return this.token.length >= 20 && this.zoneId.length === 32;
  }

  async createRoutingRule(input: CreateRoutingRuleInput): Promise<CreateRoutingRuleResult> {
    if (!this.isConfigured()) {
      throw new CloudflareRoutingError(0, '/email/routing/rules', 'cloudflare_not_configured');
    }
    if (!input.alias.includes('@') || !input.destination.includes('@')) {
      throw new CloudflareRoutingError(0, '/email/routing/rules', 'invalid_email_input');
    }

    const existing = await this.findRuleByAlias(input.alias);
    if (existing) {
      this.logger.log(`CF rule already exists for ${input.alias} -> id=${existing.id}`);
      return { rule_id: existing.id, already_existed: true };
    }

    const body = {
      name: `aiqadam-operator-${input.alias}`,
      enabled: true,
      priority: OPERATOR_RULE_PRIORITY,
      matchers: [{ field: 'to', type: 'literal', value: input.alias }],
      actions: [{ type: 'forward', value: [input.destination] }],
    };
    const path = `/zones/${this.zoneId}/email/routing/rules`;
    const result = await this.request<CloudflareRoutingRule>('POST', path, body);
    return { rule_id: result.id, already_existed: false };
  }

  private async findRuleByAlias(alias: string): Promise<CloudflareRoutingRule | null> {
    const path = `/zones/${this.zoneId}/email/routing/rules?per_page=${LIST_PAGE_SIZE}`;
    const rules = await this.request<CloudflareRoutingRule[]>('GET', path);
    for (const rule of rules) {
      for (const matcher of rule.matchers) {
        if (matcher.field === 'to' && matcher.type === 'literal' && matcher.value === alias) {
          return rule;
        }
      }
    }
    return null;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.base}${path.startsWith('/') ? path : `/${path}`}`;
    const init: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        'content-type': 'application/json',
        accept: 'application/json',
      },
    };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }
    const res = await fetch(url, init);
    const text = await res.text();
    if (!res.ok) {
      this.logger.warn(`Cloudflare ${method} ${path} -> ${res.status}: ${text.slice(0, 200)}`);
      throw new CloudflareRoutingError(res.status, path, text);
    }
    let envelope: CloudflareEnvelope<T>;
    try {
      envelope = JSON.parse(text) as CloudflareEnvelope<T>;
    } catch {
      throw new CloudflareRoutingError(res.status, path, `unparseable_body:${text.slice(0, 80)}`);
    }
    if (!envelope.success) {
      const msg = envelope.errors.map((e) => `${e.code}:${e.message}`).join(',');
      throw new CloudflareRoutingError(res.status, path, msg);
    }
    return envelope.result;
  }
}
