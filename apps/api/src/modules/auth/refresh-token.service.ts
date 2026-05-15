import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { DB, type Db } from '../../db';
import { type RefreshToken, refreshTokens } from './refresh-token.schema';

// 14 days — matches ADR-0016 §"Refresh token TTL".
export const REFRESH_TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export class RefreshTokenInvalidError extends Error {
  constructor(reason: string) {
    super(`refresh token invalid: ${reason}`);
    this.name = 'RefreshTokenInvalidError';
  }
}

export class RefreshTokenReplayError extends Error {
  constructor() {
    super('refresh token replay detected; entire family revoked');
    this.name = 'RefreshTokenReplayError';
  }
}

interface IssueResult {
  token: string;
  familyId: string;
  expiresAt: Date;
}

interface ConsumeResult {
  userId: string;
  familyId: string;
}

@Injectable()
export class RefreshTokenService {
  constructor(@Inject(DB) private readonly db: Db) {}

  // First-login path: omit familyId. Refresh-rotation path: pass the existing
  // familyId so the new token belongs to the same chain.
  async issue(input: { userId: string; familyId?: string }): Promise<IssueResult> {
    if (input.userId.length === 0) {
      throw new Error('userId must be non-empty');
    }

    const token = randomBytes(32).toString('base64url');
    const tokenHash = sha256Hex(token);
    const familyId = input.familyId ?? randomUUID();
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

    await this.db.insert(refreshTokens).values({
      userId: input.userId,
      tokenHash,
      familyId,
      expiresAt,
    });

    return { token, familyId, expiresAt };
  }

  // Validate + mark-used in one shot. Returns the userId/familyId for issuing
  // the next-in-chain token. Throws RefreshTokenReplayError on replay (and
  // revokes the entire family as a side effect).
  async consume(token: string): Promise<ConsumeResult> {
    if (token.length === 0) {
      throw new RefreshTokenInvalidError('empty token');
    }

    const tokenHash = sha256Hex(token);
    const row = await this.findByHash(tokenHash);

    if (!row) {
      throw new RefreshTokenInvalidError('not recognized');
    }
    if (row.expiresAt.getTime() <= Date.now()) {
      throw new RefreshTokenInvalidError('expired');
    }
    if (row.revokedAt !== null) {
      throw new RefreshTokenInvalidError('revoked');
    }
    if (row.usedAt !== null) {
      await this.revokeFamily(row.familyId);
      throw new RefreshTokenReplayError();
    }

    await this.db
      .update(refreshTokens)
      .set({ usedAt: new Date() })
      .where(eq(refreshTokens.id, row.id));

    return { userId: row.userId, familyId: row.familyId };
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.familyId, familyId), isNull(refreshTokens.revokedAt)));
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
  }

  private async findByHash(tokenHash: string): Promise<RefreshToken | undefined> {
    const [row] = await this.db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash))
      .limit(1);
    return row;
  }
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}
