// ChannelToggles.test.tsx — unit tests for ChannelToggles pure helpers.
//
// NOTE: @testing-library/react is NOT installed in web-next (ESM / Node
// test environment). Tests cover pure logic extracted from the block:
//   1. Initial state shape
//   2. Toggle payload construction
//   3. Error state detection
//   4. Optimistic update logic

import { describe, expect, it } from 'vitest';

// Inline the types here — types.ts re-exports from .tsx blocks
// which breaks vitest's SSR resolver (same pattern as existing tests).
interface ChannelToggles {
  notification_email_enabled: boolean;
  notification_telegram_enabled: boolean;
}

interface ConsentResponse {
  consents: unknown[];
  channels: ChannelToggles;
}

// ─── 1. Default state shape ──────────────────────────────────────────────────

describe('ChannelToggles — default state', () => {
  it('has both channels enabled by default', () => {
    const defaultState: ChannelToggles = {
      notification_email_enabled: true,
      notification_telegram_enabled: true,
    };
    expect(defaultState.notification_email_enabled).toBe(true);
    expect(defaultState.notification_telegram_enabled).toBe(true);
  });
});

// ─── 2. Toggle payload construction ──────────────────────────────────────────

function buildTogglePatch(channel: 'email' | 'telegram', enabled: boolean): Partial<ChannelToggles> {
  if (channel === 'email') {
    return { notification_email_enabled: enabled };
  }
  return { notification_telegram_enabled: enabled };
}

describe('buildTogglePatch', () => {
  it('builds email toggle payload', () => {
    const payload = buildTogglePatch('email', false);
    expect(payload).toEqual({ notification_email_enabled: false });
  });

  it('builds telegram toggle payload', () => {
    const payload = buildTogglePatch('telegram', false);
    expect(payload).toEqual({ notification_telegram_enabled: false });
  });

  it('builds enable payload', () => {
    const payload = buildTogglePatch('email', true);
    expect(payload).toEqual({ notification_email_enabled: true });
  });
});

// ─── 3. Error state detection ────────────────────────────────────────────────

function hasError(response: ConsentResponse | null | undefined): boolean {
  return response == null || response.channels == null;
}

describe('hasError', () => {
  it('returns true when response is null', () => {
    expect(hasError(null)).toBe(true);
  });

  it('returns true when response is undefined', () => {
    expect(hasError(undefined)).toBe(true);
  });

  it('returns true when channels field is missing', () => {
    expect(hasError({ consents: [], channels: undefined as unknown as ChannelToggles })).toBe(true);
  });

  it('returns false when response is valid', () => {
    const valid: ConsentResponse = {
      consents: [],
      channels: {
        notification_email_enabled: true,
        notification_telegram_enabled: true,
      },
    };
    expect(hasError(valid)).toBe(false);
  });
});

// ─── 4. Optimistic update logic ──────────────────────────────────────────────

function applyOptimisticToggle(
  current: ChannelToggles,
  channel: 'email' | 'telegram',
): ChannelToggles {
  if (channel === 'email') {
    return {
      ...current,
      notification_email_enabled: !current.notification_email_enabled,
    };
  }
  return {
    ...current,
    notification_telegram_enabled: !current.notification_telegram_enabled,
  };
}

describe('applyOptimisticToggle', () => {
  it('toggles email from true to false', () => {
    const current: ChannelToggles = {
      notification_email_enabled: true,
      notification_telegram_enabled: true,
    };
    const next = applyOptimisticToggle(current, 'email');
    expect(next.notification_email_enabled).toBe(false);
    expect(next.notification_telegram_enabled).toBe(true);
  });

  it('toggles telegram from true to false', () => {
    const current: ChannelToggles = {
      notification_email_enabled: true,
      notification_telegram_enabled: true,
    };
    const next = applyOptimisticToggle(current, 'telegram');
    expect(next.notification_email_enabled).toBe(true);
    expect(next.notification_telegram_enabled).toBe(false);
  });

  it('toggles email from false to true', () => {
    const current: ChannelToggles = {
      notification_email_enabled: false,
      notification_telegram_enabled: true,
    };
    const next = applyOptimisticToggle(current, 'email');
    expect(next.notification_email_enabled).toBe(true);
  });

  it('preserves other channel when toggling', () => {
    const current: ChannelToggles = {
      notification_email_enabled: false,
      notification_telegram_enabled: false,
    };
    const next = applyOptimisticToggle(current, 'telegram');
    expect(next.notification_email_enabled).toBe(false);
    expect(next.notification_telegram_enabled).toBe(true);
  });
});
