import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { env } from '../../config/env';

// Redis-backed access-token deny list. AuthGuard consults it on every
// request; sign-out pushes the current `jti` here with a TTL equal to the
// JWT's remaining lifetime so the token stops working immediately even
// though it hasn't expired yet.
//
// Keys: jwt:revoked:<jti>  Value: "1"  EX: seconds until original JWT exp.

const KEY_PREFIX = 'jwt:revoked:';

@Injectable()
export class JtiRevocationService implements OnModuleDestroy {
  private readonly logger = new Logger(JtiRevocationService.name);
  private readonly client: Redis;

  constructor() {
    this.client = new Redis(env.REDIS_URL, {
      lazyConnect: false,
      // ioredis defaults retry forever; one connection per process is fine.
      maxRetriesPerRequest: 3,
    });
    this.client.on('error', (err) => {
      this.logger.error(`redis error: ${err.message}`);
    });
  }

  async revoke(jti: string, ttlSeconds: number): Promise<void> {
    if (!jti) return;
    const seconds = Math.max(1, Math.ceil(ttlSeconds));
    await this.client.set(`${KEY_PREFIX}${jti}`, '1', 'EX', seconds);
  }

  async isRevoked(jti: string): Promise<boolean> {
    if (!jti) return false;
    const got = await this.client.get(`${KEY_PREFIX}${jti}`);
    return got === '1';
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit().catch(() => undefined);
  }
}
