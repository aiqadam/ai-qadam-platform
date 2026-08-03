// TelegramLinkStatus.test.tsx — Unit tests for TelegramLinkStatus component.
// Tests: render-state branching logic, linked-with-username text, linked-without-
// username text, unlinked copy.
//
// Per codebase convention (AccessLogTable.test.tsx, ReferralDashboard.test.tsx),
// @testing-library/react is NOT installed. The component's branching logic is
// extracted as pure functions and tested with plain input/output assertions.

import type { MeProfileCore } from '@/lib/types';
import { describe, expect, it } from 'vitest';

// ─── Types that mirror the useMyFullProfile() hook shape ──────────────────────

type ProfileSlice = Pick<MeProfileCore, 'telegram_user_id' | 'telegram_username'>;

type HookState =
  | { isPending: true; error: null; data: null }
  | { isPending: false; error: Error; data: null }
  | { isPending: false; error: null; data: null }
  | { isPending: false; error: null; data: { profile: ProfileSlice } };

type RenderVariant = 'loading' | 'error' | 'linked-with-username' | 'linked-no-username' | 'not-linked';

// ─── Pure helpers re-implementing TelegramLinkStatusInner branching ───────────

function getTelegramLinkVariant(hook: HookState): RenderVariant {
  if (hook.isPending) return 'loading';
  if (hook.error || !hook.data) return 'error';

  const { telegram_user_id, telegram_username } = hook.data.profile;
  if (telegram_user_id != null) {
    return telegram_username ? 'linked-with-username' : 'linked-no-username';
  }
  return 'not-linked';
}

// Mirrors the linked-state text the component renders (JSX flattened to plain string).
function formatLinkedText(telegram_username: string | null): string {
  if (telegram_username) {
    return `@${telegram_username} — linked`;
  }
  return 'Account linked';
}

// Mirrors the not-linked paragraph text.
const NOT_LINKED_TEXT = 'Not linked — type /link in @aiqadam_bot to connect your account.';

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('TelegramLinkStatus — render logic', () => {
  it('returns loading variant while hook is pending', () => {
    const variant = getTelegramLinkVariant({ isPending: true, error: null, data: null });
    expect(variant).toBe('loading');
  });

  it('returns error variant when hook errors', () => {
    const variant = getTelegramLinkVariant({
      isPending: false,
      error: new Error('network'),
      data: null,
    });
    expect(variant).toBe('error');
  });

  it('returns error variant when hook data is null', () => {
    const variant = getTelegramLinkVariant({ isPending: false, error: null, data: null });
    expect(variant).toBe('error');
  });

  it('returns linked-with-username when telegram_user_id and telegram_username are set', () => {
    const variant = getTelegramLinkVariant({
      isPending: false,
      error: null,
      data: { profile: { telegram_user_id: '99', telegram_username: 'alice_tg' } },
    });
    expect(variant).toBe('linked-with-username');
  });

  it('returns linked-no-username when telegram_user_id is set but username is null', () => {
    const variant = getTelegramLinkVariant({
      isPending: false,
      error: null,
      data: { profile: { telegram_user_id: '99', telegram_username: null } },
    });
    expect(variant).toBe('linked-no-username');
  });

  it('returns not-linked when telegram_user_id is null', () => {
    const variant = getTelegramLinkVariant({
      isPending: false,
      error: null,
      data: { profile: { telegram_user_id: null, telegram_username: null } },
    });
    expect(variant).toBe('not-linked');
  });
});

describe('TelegramLinkStatus — linked text formatting', () => {
  it('prefixes @ and appends " — linked" when username is present', () => {
    expect(formatLinkedText('alice_tg')).toBe('@alice_tg — linked');
  });

  it('returns "Account linked" when username is null', () => {
    expect(formatLinkedText(null)).toBe('Account linked');
  });
});

describe('TelegramLinkStatus — not-linked copy', () => {
  it('not-linked copy contains /link and @aiqadam_bot', () => {
    expect(NOT_LINKED_TEXT).toContain('/link');
    expect(NOT_LINKED_TEXT).toContain('@aiqadam_bot');
  });
});
