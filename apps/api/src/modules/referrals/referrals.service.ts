import { Injectable, Logger } from '@nestjs/common';
import { DirectusUsersBridgeService } from '../directus/directus-users-bridge.service';
import { DirectusClient } from '../directus/directus.client';

// F-S3.9 — referral codes + attribution.
//
// Operations:
//   issueForUser(userId) → mint or fetch my code. Codes are per-user, single
//     active code at a time; if one exists we return it (so re-clicks of
//     "get my code" are idempotent + no orphan codes accumulate).
//   listMine(userId)     → my codes (typically 1) with the absolute share URL.
//   resolveCode(code)    → owner_user_id if a usable (un-expired) code matches,
//                          else null. Caller can then stamp the value onto
//                          registrations.referred_by.

const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'; // no 0/1/i/l/o
const CODE_LENGTH = 6;
const SHARE_BASE_URL = 'https://aiqadam.org';

export interface ReferralCodeRow {
  id: string;
  code: string;
  owner_user: string;
  valid_until: string | null;
  date_created: string;
}

export interface ReferralCodeView {
  id: string;
  code: string;
  shareUrl: string;
  validUntil: string | null;
  createdAt: string;
}

@Injectable()
export class ReferralsService {
  private readonly logger = new Logger(ReferralsService.name);

  constructor(
    private readonly directus: DirectusClient,
    private readonly bridge: DirectusUsersBridgeService,
  ) {}

  async issueForUser(userId: string, email: string): Promise<ReferralCodeView> {
    const directusUserId = await this.bridge.ensureLinked({ userId, email, displayName: null });
    if (!directusUserId) {
      throw new Error('failed to resolve directus user for referral issuance');
    }
    const existing = await this.findActiveByOwner(directusUserId);
    if (existing) return toView(existing);
    return toView(await this.insertWithRetry(directusUserId));
  }

  async listMine(userId: string, email: string): Promise<ReferralCodeView[]> {
    const directusUserId = await this.bridge.ensureLinked({ userId, email, displayName: null });
    if (!directusUserId) return [];
    const rows = await this.fetchByOwner(directusUserId);
    return rows.map(toView);
  }

  async resolveCode(code: string): Promise<{ ownerUserId: string } | null> {
    const normalized = normalizeCode(code);
    if (!normalized) return null;
    const filter = encodeURIComponent(JSON.stringify({ code: { _eq: normalized } }));
    const res = await this.directus.get<{ data: ReferralCodeRow[] }>(
      `/items/referral_codes?filter=${filter}&fields=id,owner_user,valid_until&limit=1`,
    );
    const row = res.data[0];
    if (!row) return null;
    if (row.valid_until && new Date(row.valid_until).getTime() < Date.now()) {
      return null;
    }
    return { ownerUserId: row.owner_user };
  }

  private async findActiveByOwner(ownerId: string): Promise<ReferralCodeRow | null> {
    const rows = await this.fetchByOwner(ownerId);
    const now = Date.now();
    return rows.find((r) => !r.valid_until || new Date(r.valid_until).getTime() > now) ?? null;
  }

  private async fetchByOwner(ownerId: string): Promise<ReferralCodeRow[]> {
    const filter = encodeURIComponent(JSON.stringify({ owner_user: { _eq: ownerId } }));
    const res = await this.directus.get<{ data: ReferralCodeRow[] }>(
      `/items/referral_codes?filter=${filter}&sort=-date_created&fields=*&limit=10`,
    );
    return res.data;
  }

  private async insertWithRetry(ownerId: string): Promise<ReferralCodeRow> {
    // Codes are short (~31^6 = ~887M) but collisions are still possible.
    // Retry on the uniqueness 4xx; cap at 5 attempts so we never spin.
    for (let i = 0; i < 5; i++) {
      const candidate = generateCode();
      try {
        const created = await this.directus.post<{ data: ReferralCodeRow }>(
          '/items/referral_codes',
          { code: candidate, owner_user: ownerId },
        );
        return created.data;
      } catch (err) {
        this.logger.warn(
          `referral code insert attempt ${i + 1} failed: ${err instanceof Error ? err.message : 'unknown'}`,
        );
      }
    }
    throw new Error('failed to mint a unique referral code after 5 attempts');
  }
}

function generateCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    const byte = bytes[i] ?? 0;
    out += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  }
  return out;
}

function randomBytes(n: number): Uint8Array {
  const arr = new Uint8Array(n);
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(arr);
    return arr;
  }
  for (let i = 0; i < n; i++) arr[i] = Math.floor(Math.random() * 256);
  return arr;
}

function normalizeCode(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  if (trimmed.length === 0 || trimmed.length > 24) return null;
  return trimmed;
}

function toView(row: ReferralCodeRow): ReferralCodeView {
  return {
    id: row.id,
    code: row.code,
    shareUrl: `${SHARE_BASE_URL}/?ref=${encodeURIComponent(row.code)}`,
    validUntil: row.valid_until,
    createdAt: row.date_created,
  };
}
