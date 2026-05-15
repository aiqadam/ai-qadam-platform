import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { describe, expect, it } from 'vitest';
import { AuthGuard } from '../src/modules/auth/auth.guard';
import { JwtService } from '../src/modules/auth/jwt.service';

const jwtService = new JwtService();
const guard = new AuthGuard(jwtService);

const reqWithAuth = (header: string | undefined): Request =>
  ({
    header: (name: string) => (name.toLowerCase() === 'authorization' ? header : undefined),
  }) as unknown as Request;

const ctxFor = (req: Request): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: <T>() => req as T,
      getResponse: <T>() => ({}) as T,
      getNext: <T>() => ({}) as T,
    }),
  }) as ExecutionContext;

describe('AuthGuard', () => {
  it('attaches verified claims for a valid bearer token', async () => {
    const claims = {
      sub: '1c5a7c6e-3b9e-4f2a-8b7d-9b56f8e9c413',
      authentikSubject: 'sub-x',
      email: 'x@example.com',
    };
    const token = await jwtService.sign(claims);
    const req = reqWithAuth(`Bearer ${token}`);

    await expect(guard.canActivate(ctxFor(req))).resolves.toBe(true);
    expect(req.user?.sub).toBe(claims.sub);
    expect(req.user?.email).toBe(claims.email);
  });

  it('rejects when authorization header is missing', async () => {
    await expect(guard.canActivate(ctxFor(reqWithAuth(undefined)))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects when authorization header is not Bearer', async () => {
    await expect(guard.canActivate(ctxFor(reqWithAuth('Basic abc')))).rejects.toThrow(
      'authorization header must be Bearer',
    );
  });

  it('rejects when bearer token is missing after the scheme', async () => {
    await expect(guard.canActivate(ctxFor(reqWithAuth('Bearer ')))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a tampered token', async () => {
    const claims = {
      sub: '1c5a7c6e-3b9e-4f2a-8b7d-9b56f8e9c413',
      authentikSubject: 'sub-x',
      email: 'x@example.com',
    };
    const token = await jwtService.sign(claims);
    const tampered = `${token}AAAA`;

    await expect(guard.canActivate(ctxFor(reqWithAuth(`Bearer ${tampered}`)))).rejects.toThrow(
      'access token invalid',
    );
  });
});
