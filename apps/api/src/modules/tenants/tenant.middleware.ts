import { BadRequestException, Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { TenantsService } from './tenants.service';

// Tenant resolution per ARCHITECTURE.md §"Multi-tenancy implementation":
//   1. Subdomain wins: uz.aiqadam.org → 'uz', kz.aiqadam.org → 'kz', etc.
//   2. X-Tenant header fallback: lets bot / curl / local dev override.
//   3. Default 'uz' for bare aiqadam.org and local-dev hosts (localhost,
//      127.0.0.1, anything without a subdomain).
//
// The reverse proxy (Traefik in prod) preserves the original Host header
// when forwarding upstream, so this works without any X-Forwarded-Host
// special-casing. If we add a CDN that strips Host, switch to
// X-Forwarded-Host first.

const TENANT_HEADER = 'x-tenant';
const DEFAULT_TENANT_CODE = 'uz';

// Hosts whose leading label is NOT a tenant code (apex / non-tenant
// subdomain). Anything else with a 2-char leading label is treated as a
// candidate tenant code.
const NON_TENANT_LABELS = new Set([
  'aiqadam', // bare aiqadam.org
  'www',
  'coolify',
  'auth',
  'cms',
  'admin',
  'api',
  'localhost',
  'qa', // qa.aiqadam.org — environment label, not a tenant code
]);

export function tenantFromHost(host: string | undefined): string | null {
  if (!host) return null;
  const hostnameOnly = host.split(':')[0]?.toLowerCase().trim();
  if (!hostnameOnly) return null;
  // IPv4 address: no subdomain to parse.
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostnameOnly)) return null;
  const firstLabel = hostnameOnly.split('.')[0] ?? '';
  if (NON_TENANT_LABELS.has(firstLabel)) return null;
  // Two-character ISO codes only (matches our countries.code shape).
  if (firstLabel.length !== 2) return null;
  return firstLabel;
}

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private readonly tenants: TenantsService) {}

  use(req: Request, _res: Response, next: NextFunction): void {
    const fromHost = tenantFromHost(req.header('host'));
    const fromHeader = req.header(TENANT_HEADER);
    const code = (fromHost ?? fromHeader ?? DEFAULT_TENANT_CODE).toLowerCase().trim();

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
