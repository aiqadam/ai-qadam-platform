import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CsatPublicController, CsatOperatorController } from '../src/modules/workspace/csat.controller';
import type { CsatService, CsatSummary } from '../src/modules/workspace/csat.service';

// F-S1.2 — CsatPublicController: POST /v1/feedback/csat (token-gated, no AuthGuard).
// F-S1.3 — CsatOperatorController: GET /v1/workspace/events/:id/csat (AuthGuard).

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const VALID_TOKEN = 'csat.a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6';

// Minimal Express Request mock
function makeMockReq(path?: string): Request {
  return {
    url: path ?? '/',
    headers: new Headers(),
  } as unknown as Request;
}

// ─── CsatService mock ─────────────────────────────────────────────────────────

type MockCsatService = {
  submit: ReturnType<typeof vi.fn>;
  verifyToken: ReturnType<typeof vi.fn>;
  summaryForEvent: ReturnType<typeof vi.fn>;
};

function makeMockCsat(): MockCsatService {
  return {
    submit: vi.fn(),
    verifyToken: vi.fn(),
    summaryForEvent: vi.fn(),
  };
}

// ─── Tests: CsatPublicController.submit ───────────────────────────────────────

describe('CsatPublicController.submit — F-S1.2', () => {
  let svc: MockCsatService;
  let ctrl: CsatPublicController;

  beforeEach(() => {
    svc = makeMockCsat();
    ctrl = new CsatPublicController(svc as unknown as CsatService);
  });

  it('returns 202 + { accepted: true } on first submission', async () => {
    svc.submit.mockResolvedValueOnce({ accepted: true });

    const result = await ctrl.submit({ token: VALID_TOKEN, rating: 5, comment: 'Great event' });

    expect(result).toEqual({ accepted: true });
    expect(svc.submit).toHaveBeenCalledWith({
      token: VALID_TOKEN,
      rating: 5,
      comment: 'Great event',
    });
  });

  it('returns 202 when submitting without comment', async () => {
    svc.submit.mockResolvedValueOnce({ accepted: true });

    const result = await ctrl.submit({ token: VALID_TOKEN, rating: 4 });

    expect(result).toEqual({ accepted: true });
    expect(svc.submit).toHaveBeenCalledWith({ token: VALID_TOKEN, rating: 4 });
  });

  it('throws BadRequestException on invalid token', async () => {
    svc.submit.mockResolvedValueOnce({ accepted: false, reason: 'invalid_token' });

    await expect(ctrl.submit({ token: 'short', rating: 3 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('throws UnauthorizedException on invalid_token result', async () => {
    svc.submit.mockResolvedValueOnce({ accepted: false, reason: 'invalid_token' });

    await expect(ctrl.submit({ token: VALID_TOKEN, rating: 3 })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('throws UnauthorizedException on delivery_not_found result', async () => {
    svc.submit.mockResolvedValueOnce({ accepted: false, reason: 'delivery_not_found' });

    await expect(ctrl.submit({ token: VALID_TOKEN, rating: 3 })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('throws ConflictException (409) on already_responded', async () => {
    svc.submit.mockResolvedValueOnce({ accepted: false, reason: 'already_responded' });

    await expect(ctrl.submit({ token: VALID_TOKEN, rating: 3 })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('throws BadRequestException when service returns unknown reason', async () => {
    svc.submit.mockResolvedValueOnce({ accepted: false, reason: 'some_unknown_reason' });

    await expect(ctrl.submit({ token: VALID_TOKEN, rating: 3 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('throws BadRequestException on malformed body (missing token)', async () => {
    await expect(ctrl.submit({ rating: 5 } as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('throws BadRequestException on malformed body (rating out of range)', async () => {
    await expect(ctrl.submit({ token: VALID_TOKEN, rating: 10 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('throws BadRequestException on malformed body (rating < 1)', async () => {
    await expect(ctrl.submit({ token: VALID_TOKEN, rating: 0 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('throws BadRequestException when comment exceeds max length', async () => {
    const longComment = 'x'.repeat(5000);
    await expect(ctrl.submit({ token: VALID_TOKEN, rating: 5, comment: longComment })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('accepts comment at exactly max length (4000 chars)', async () => {
    svc.submit.mockResolvedValueOnce({ accepted: true });
    const maxComment = 'x'.repeat(4000);

    const result = await ctrl.submit({ token: VALID_TOKEN, rating: 5, comment: maxComment });

    expect(result).toEqual({ accepted: true });
  });
});

// ─── Tests: CsatPublicController.tokenStatus ───────────────────────────────────

describe('CsatPublicController.tokenStatus — GET /v1/feedback/csat/token', () => {
  let svc: MockCsatService;
  let ctrl: CsatPublicController;

  beforeEach(() => {
    svc = makeMockCsat();
    ctrl = new CsatPublicController(svc as unknown as CsatService);
  });

  it('returns { valid: true } when token is valid', async () => {
    svc.verifyToken.mockResolvedValueOnce({ sub: 'del-123' });

    const result = await ctrl.tokenStatus(makeMockReq('/v1/feedback/csat/token?token=valid123'));

    expect(result).toEqual({ valid: true });
    expect(svc.verifyToken).toHaveBeenCalledWith('valid123');
  });

  it('returns { valid: false } when token is invalid', async () => {
    svc.verifyToken.mockResolvedValueOnce(null);

    const result = await ctrl.tokenStatus(makeMockReq('/v1/feedback/csat/token?token=invalid'));

    expect(result).toEqual({ valid: false });
  });

  it('throws BadRequestException when token param is missing', async () => {
    await expect(
      ctrl.tokenStatus(makeMockReq('/v1/feedback/csat/token')),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws BadRequestException when token param is empty', async () => {
    await expect(
      ctrl.tokenStatus(makeMockReq('/v1/feedback/csat/token?token=')),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

// ─── Tests: CsatOperatorController.summary ─────────────────────────────────────

describe('CsatOperatorController.summary — F-S1.3', () => {
  let svc: MockCsatService;
  let ctrl: CsatOperatorController;

  const mockSummary: CsatSummary = {
    eventId: 'evt-001',
    count: 25,
    delivered: 100,
    avg: 4.2,
    distribution: { 1: 1, 2: 2, 3: 5, 4: 10, 5: 7 },
    responseRate: 0.25,
    comments: [
      { id: 'c1', comment: 'Great talks', receivedAt: '2026-06-20T10:00:00Z' },
    ],
  };

  beforeEach(() => {
    svc = makeMockCsat();
    ctrl = new CsatOperatorController(svc as unknown as CsatService);
  });

  it('returns { csat: summary } on success', async () => {
    svc.summaryForEvent.mockResolvedValueOnce(mockSummary);

    const mockReq = { user: { id: 'usr-001' } } as never;
    const result = await ctrl.summary(mockReq, 'evt-001');

    expect(result).toEqual({ csat: mockSummary });
    expect(svc.summaryForEvent).toHaveBeenCalledWith('evt-001');
  });

  it('throws NotFoundException when user is not signed in', async () => {
    const mockReq = { user: null } as never;

    try {
      await ctrl.summary(mockReq, 'evt-001');
      expect.fail('Should have thrown NotFoundException');
    } catch (err) {
      // NestJS exceptions serialize their message in the error
      expect((err as Error).message).toContain('not signed in');
    }
  });

  it('passes the event id from params to service', async () => {
    svc.summaryForEvent.mockResolvedValueOnce(mockSummary);

    const mockReq = { user: { id: 'usr-001' } } as never;
    await ctrl.summary(mockReq, 'evt-xyz-999');

    expect(svc.summaryForEvent).toHaveBeenCalledWith('evt-xyz-999');
  });
});

// ─── Tests: submitSchema validation ───────────────────────────────────────────

describe('CsatPublicController — Zod schema validation', () => {
  let svc: MockCsatService;
  let ctrl: CsatPublicController;

  beforeEach(() => {
    svc = makeMockCsat();
    ctrl = new CsatPublicController(svc as unknown as CsatService);
  });

  it('rejects token shorter than 20 characters', async () => {
    await expect(ctrl.submit({ token: 'short', rating: 5 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects rating that is not a number', async () => {
    await expect(
      ctrl.submit({ token: VALID_TOKEN, rating: 'five' } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects rating 6', async () => {
    await expect(ctrl.submit({ token: VALID_TOKEN, rating: 6 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('accepts rating 1 (minimum)', async () => {
    svc.submit.mockResolvedValueOnce({ accepted: true });
    const result = await ctrl.submit({ token: VALID_TOKEN, rating: 1 });
    expect(result).toEqual({ accepted: true });
  });

  it('accepts rating 5 (maximum)', async () => {
    svc.submit.mockResolvedValueOnce({ accepted: true });
    const result = await ctrl.submit({ token: VALID_TOKEN, rating: 5 });
    expect(result).toEqual({ accepted: true });
  });
});
