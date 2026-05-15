import { BadRequestException } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { TenantMiddleware } from '../src/modules/tenants/tenant.middleware';
import type { TenantsService } from '../src/modules/tenants/tenants.service';

const fakeTenants = (known: string[]): TenantsService =>
  ({
    findByCode: (code: string) =>
      known.includes(code)
        ? {
            code,
            name: code.toUpperCase(),
            nameRu: code.toUpperCase(),
            tz: 'UTC',
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          }
        : undefined,
    list: () =>
      known.map((code) => ({
        code,
        name: code.toUpperCase(),
        nameRu: code.toUpperCase(),
        tz: 'UTC',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
  }) as unknown as TenantsService;

const reqWithHeader = (value: string | undefined): Request =>
  ({
    header: (name: string) => (name.toLowerCase() === 'x-tenant' ? value : undefined),
  }) as unknown as Request;

describe('TenantMiddleware', () => {
  it('attaches the tenant resolved from X-Tenant header', () => {
    const mw = new TenantMiddleware(fakeTenants(['uz', 'kz']));
    const req = reqWithHeader('kz');
    const next = vi.fn() as unknown as NextFunction;

    mw.use(req, {} as Response, next);

    expect(req.tenant?.code).toBe('kz');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('lowercases and trims the header value', () => {
    const mw = new TenantMiddleware(fakeTenants(['uz']));
    const req = reqWithHeader('  UZ  ');
    const next = vi.fn() as unknown as NextFunction;

    mw.use(req, {} as Response, next);

    expect(req.tenant?.code).toBe('uz');
  });

  it('defaults to "uz" when header is absent', () => {
    const mw = new TenantMiddleware(fakeTenants(['uz', 'kz']));
    const req = reqWithHeader(undefined);
    const next = vi.fn() as unknown as NextFunction;

    mw.use(req, {} as Response, next);

    expect(req.tenant?.code).toBe('uz');
  });

  it('throws BadRequestException for unknown tenant code', () => {
    const mw = new TenantMiddleware(fakeTenants(['uz', 'kz']));
    const req = reqWithHeader('xx');
    const next = vi.fn() as unknown as NextFunction;

    expect(() => mw.use(req, {} as Response, next)).toThrow(BadRequestException);
    expect(next).not.toHaveBeenCalled();
  });
});
