import { describe, expect, it } from 'vitest';
import { tenantFromHost } from '../src/modules/tenants/tenant.middleware';

describe('tenantFromHost', () => {
  it('returns null for undefined host', () => {
    expect(tenantFromHost(undefined)).toBeNull();
  });

  it('returns null for bare aiqadam.org', () => {
    expect(tenantFromHost('aiqadam.org')).toBeNull();
  });

  it('returns null for www.aiqadam.org', () => {
    expect(tenantFromHost('www.aiqadam.org')).toBeNull();
  });

  it('returns null for qa.aiqadam.org (environment label, not a tenant code)', () => {
    expect(tenantFromHost('qa.aiqadam.org')).toBeNull();
  });

  it('returns null for qa-uz.aiqadam.org (5-char label fails the 2-char check)', () => {
    expect(tenantFromHost('qa-uz.aiqadam.org')).toBeNull();
  });

  it('returns the 2-char code for a real tenant subdomain', () => {
    expect(tenantFromHost('uz.aiqadam.org')).toBe('uz');
    expect(tenantFromHost('kz.aiqadam.org')).toBe('kz');
  });

  it('strips port before parsing', () => {
    expect(tenantFromHost('qa.aiqadam.org:8080')).toBeNull();
    expect(tenantFromHost('uz.aiqadam.org:3000')).toBe('uz');
  });

  it('returns null for an IPv4 host', () => {
    expect(tenantFromHost('95.46.211.230')).toBeNull();
  });

  it('returns null for localhost', () => {
    expect(tenantFromHost('localhost')).toBeNull();
  });

  it('is case-insensitive', () => {
    expect(tenantFromHost('QA.aiqadam.org')).toBeNull();
    expect(tenantFromHost('UZ.aiqadam.org')).toBe('uz');
  });
});
