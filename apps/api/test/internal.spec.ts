import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';
import type { EmailService } from '../src/modules/email/email.service';
import { InternalAuthGuard } from '../src/modules/internal/internal-auth.guard';
import { InternalController } from '../src/modules/internal/internal.controller';

const reqWithHeader = (header: string | undefined): Request =>
  ({
    header: (name: string) => (name.toLowerCase() === 'x-internal-auth' ? header : undefined),
  }) as unknown as Request;

const ctxFor = (req: Request): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: <T>() => req as T,
      getResponse: <T>() => ({}) as T,
      getNext: <T>() => ({}) as T,
    }),
  }) as ExecutionContext;

describe('InternalAuthGuard', () => {
  const guard = new InternalAuthGuard();

  it('rejects requests with no X-Internal-Auth header', () => {
    expect(() => guard.canActivate(ctxFor(reqWithHeader(undefined)))).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects requests with a wrong token', () => {
    expect(() =>
      guard.canActivate(ctxFor(reqWithHeader('definitely-not-the-token-pad-pad-pad-pad-pad'))),
    ).toThrow(UnauthorizedException);
  });

  it('accepts requests carrying the matching token from env', () => {
    const token = process.env.INTERNAL_API_TOKEN ?? '';
    expect(token.length).toBeGreaterThan(0);
    expect(guard.canActivate(ctxFor(reqWithHeader(token)))).toBe(true);
  });
});

describe('InternalController.sendEmail', () => {
  const fakeEmail: EmailService = {
    send: vi.fn(async () => undefined),
  } as unknown as EmailService;
  const controller = new InternalController(fakeEmail);

  it('rejects an unknown template', async () => {
    await expect(
      controller.sendEmail({
        template: 'not-a-template',
        to: 'a@b.com',
        data: { eventTitle: 't', eventStartsAt: new Date().toISOString() },
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a non-email "to"', async () => {
    await expect(
      controller.sendEmail({
        template: 'registration-confirmed',
        to: 'not-an-email',
        data: { eventTitle: 't', eventStartsAt: new Date().toISOString() },
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('dispatches a registration-waitlisted email via EmailService', async () => {
    (fakeEmail.send as ReturnType<typeof vi.fn>).mockClear();
    const result = await controller.sendEmail({
      template: 'registration-waitlisted',
      to: 'wait@example.com',
      data: {
        recipientName: 'Wait',
        eventTitle: 'Full Event',
        eventStartsAt: '2026-06-01T18:00:00Z',
        eventLocation: 'Tashkent',
      },
    });
    expect(result).toEqual({ accepted: true });
    expect(fakeEmail.send).toHaveBeenCalledTimes(1);
    const sent = (fakeEmail.send as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(sent).toMatchObject({
      to: 'wait@example.com',
      subject: expect.stringContaining('Waitlisted'),
    });
  });

  it('dispatches a registration-confirmed email via EmailService', async () => {
    (fakeEmail.send as ReturnType<typeof vi.fn>).mockClear();
    const result = await controller.sendEmail({
      template: 'registration-confirmed',
      to: 'alice@example.com',
      data: {
        recipientName: 'Alice',
        eventTitle: 'AI Drinks UZ',
        eventStartsAt: '2026-06-01T18:00:00Z',
        eventLocation: 'Tashkent',
      },
    });
    expect(result).toEqual({ accepted: true });
    expect(fakeEmail.send).toHaveBeenCalledTimes(1);
    const sent = (fakeEmail.send as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(sent).toMatchObject({
      to: 'alice@example.com',
      subject: expect.stringContaining('AI Drinks UZ'),
    });
  });
});
