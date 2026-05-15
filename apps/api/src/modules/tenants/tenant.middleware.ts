import { BadRequestException, Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { TenantsService } from './tenants.service';

// Header name follows ARCHITECTURE.md §"Multi-tenancy implementation":
//   "For API calls from bot: explicit X-Tenant header"
// Hostname-based resolution (subdomain → tenant) lands when we deploy a
// reverse proxy in front; for local dev the header is the only source.
const TENANT_HEADER = 'x-tenant';

// Default for local dev so curl /health works without the header.
// Will likely become "no default → 400" in a later PR once the web
// always passes the header explicitly.
const DEFAULT_TENANT_CODE = 'uz';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private readonly tenants: TenantsService) {}

  use(req: Request, _res: Response, next: NextFunction): void {
    const headerValue = req.header(TENANT_HEADER);
    const code = (headerValue ?? DEFAULT_TENANT_CODE).toLowerCase().trim();

    const tenant = this.tenants.findByCode(code);
    if (!tenant) {
      throw new BadRequestException({
        type: 'https://aiqadam.org/errors/unknown-tenant',
        title: 'Unknown tenant',
        detail: `No country with code '${code}' is registered. Known codes: ${this.tenants
          .list()
          .map((t) => t.code)
          .join(', ')}.`,
      });
    }

    req.tenant = tenant;
    next();
  }
}
