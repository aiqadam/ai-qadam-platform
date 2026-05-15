import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { db } from '../../db';
import { type Country, countries } from '../../db/schema/tenants';

// In-memory cache of countries. Loaded on boot; we don't expect changes
// during runtime in Phase 1 (countries are static). Add a refresh hook
// later if/when we add a country via admin UI.
@Injectable()
export class TenantsService implements OnModuleInit {
  private readonly logger = new Logger(TenantsService.name);
  private readonly cache = new Map<string, Country>();

  async onModuleInit(): Promise<void> {
    await this.refreshCache();
  }

  async refreshCache(): Promise<void> {
    const rows = await db.select().from(countries);
    this.cache.clear();
    for (const row of rows) {
      this.cache.set(row.code, row);
    }
    this.logger.log(`Loaded ${rows.length} active tenants into cache`);
  }

  findByCode(code: string): Country | undefined {
    return this.cache.get(code);
  }

  list(): Country[] {
    return Array.from(this.cache.values());
  }
}
