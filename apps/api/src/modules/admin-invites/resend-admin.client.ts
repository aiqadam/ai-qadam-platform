import { Injectable, Logger } from '@nestjs/common';
import { env } from '../../config/env';

// F-S2.8: thin wrapper over Resend's API-Keys management endpoint. We
// use `fetch` (not the Resend SDK) here because (a) the SDK's
// apiKeys.create() requires constructing a Resend(adminKey) instance
// that is distinct from the platform-sending Resend instance, and
// keeping the two creds separated in code beats sharing a constructor;
// (b) the API surface is one POST, so SDK weight isn't worth it.
//
// All methods throw ResendAdminError on non-2xx. Callers decide whether
// to fail the parent operation; admin-invites records the failure into
// `partial_failures` rather than rolling back the invite.

export class ResendAdminError extends Error {
  constructor(
    public readonly status: number,
    public readonly path: string,
    public readonly body: string,
  ) {
    super(`ResendAdmin ${status} ${path}: ${body.slice(0, 200)}`);
    this.name = 'ResendAdminError';
  }
}

export interface CreatePerOperatorKeyInput {
  operatorEmail: string; // e.g. "binali.rustamov@aiqadam.org" — used for the key's display name
}

export interface CreatePerOperatorKeyResult {
  id: string;
  token: string; // the plaintext API key — show to admin once, NEVER log
}

// `sending_access` is the minimum Resend permission for SMTP / send
// operations. `full_access` would let the per-operator key create more
// sub-keys; we explicitly do NOT grant that.
const PER_OPERATOR_PERMISSION = 'sending_access';
const RESEND_API_BASE = 'https://api.resend.com';

@Injectable()
export class ResendAdminClient {
  private readonly logger = new Logger(ResendAdminClient.name);
  private readonly token = env.RESEND_ADMIN_API_KEY ?? '';

  isConfigured(): boolean {
    return this.token.length >= 20;
  }

  async createPerOperatorKey(
    input: CreatePerOperatorKeyInput,
  ): Promise<CreatePerOperatorKeyResult> {
    if (!this.isConfigured()) {
      throw new ResendAdminError(0, '/api-keys', 'resend_admin_not_configured');
    }
    if (!input.operatorEmail.includes('@')) {
      throw new ResendAdminError(0, '/api-keys', 'invalid_operator_email');
    }

    // Name is the only Resend dedupe key we get (the API doesn't reject
    // duplicate names — it just creates a second key). Append the
    // creation timestamp to make accidental double-creates visible
    // when the admin lists keys in the Resend dashboard.
    const name = `aiqadam-operator-${input.operatorEmail}-${Date.now()}`;

    const url = `${RESEND_API_BASE}/api-keys`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({ name, permission: PER_OPERATOR_PERMISSION }),
    });
    const text = await res.text();
    if (!res.ok) {
      this.logger.warn(`Resend POST /api-keys -> ${res.status}: ${text.slice(0, 200)}`);
      throw new ResendAdminError(res.status, '/api-keys', text);
    }
    let parsed: { id?: string; token?: string };
    try {
      parsed = JSON.parse(text) as { id?: string; token?: string };
    } catch {
      throw new ResendAdminError(res.status, '/api-keys', `unparseable_body:${text.slice(0, 80)}`);
    }
    if (!parsed.id || !parsed.token) {
      throw new ResendAdminError(res.status, '/api-keys', 'missing_id_or_token');
    }
    // Do NOT log parsed.token — it's the plaintext API key.
    this.logger.log(`Resend per-operator key created id=${parsed.id} for=${input.operatorEmail}`);
    return { id: parsed.id, token: parsed.token };
  }
}
