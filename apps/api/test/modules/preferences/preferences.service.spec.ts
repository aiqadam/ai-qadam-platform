import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DirectusClient } from '../../../src/modules/directus/directus.client';
import { PreferencesService } from '../../../src/modules/preferences/preferences.service';

// FR-NTF-005 — PreferencesService channel toggles CRUD.
// Tests getChannelToggles() and setChannelToggles() methods.

type FakeDirectus = {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
};

const USER_ID = '11111111-1111-4000-8000-000000000001';

let dx: FakeDirectus;
let service: PreferencesService;

beforeEach(() => {
  dx = { get: vi.fn(), post: vi.fn(), patch: vi.fn() };
  service = new PreferencesService(dx as unknown as DirectusClient);
});

describe('PreferencesService — FR-NTF-005 channel toggles', () => {
  // ─── 1. getChannelToggles returns both fields ─────────────────────────

  it('returns channel toggles from directus_users', async () => {
    dx.get.mockResolvedValueOnce({
      data: {
        notification_email_enabled: true,
        notification_telegram_enabled: false,
      },
    });

    const result = await service.getChannelToggles(USER_ID);

    expect(result.notification_email_enabled).toBe(true);
    expect(result.notification_telegram_enabled).toBe(false);
    expect(dx.get).toHaveBeenCalledWith(
      expect.stringContaining(`/users/${USER_ID}`),
    );
    expect(dx.get).toHaveBeenCalledWith(
      expect.stringContaining('notification_email_enabled'),
    );
  });

  // ─── 2. defaults to true when fields are null ────────────────────────

  it('defaults to true when fields are null (backward compat)', async () => {
    dx.get.mockResolvedValueOnce({
      data: {}, // No fields present (old user row)
    });

    const result = await service.getChannelToggles(USER_ID);

    expect(result.notification_email_enabled).toBe(true);
    expect(result.notification_telegram_enabled).toBe(true);
  });

  // ─── 3. setChannelToggles patches Directus ───────────────────────────

  it('patches directus_users and returns updated state', async () => {
    dx.patch.mockResolvedValueOnce({});
    dx.get.mockResolvedValueOnce({
      data: {
        notification_email_enabled: false,
        notification_telegram_enabled: true,
      },
    });

    const result = await service.setChannelToggles(USER_ID, {
      notification_email_enabled: false,
    });

    expect(result.notification_email_enabled).toBe(false);
    expect(dx.patch).toHaveBeenCalledWith(
      `/users/${USER_ID}`,
      { notification_email_enabled: false },
    );
    // Should call getChannelToggles() after patch
    expect(dx.get).toHaveBeenCalledTimes(1);
  });

  // ─── 4. partial update leaves other field unchanged ──────────────────

  it('updates only the provided field (partial update)', async () => {
    dx.patch.mockResolvedValueOnce({});
    dx.get.mockResolvedValueOnce({
      data: {
        notification_email_enabled: true,
        notification_telegram_enabled: false,
      },
    });

    await service.setChannelToggles(USER_ID, {
      notification_telegram_enabled: false,
    });

    // Verify patch only includes the specified field
    expect(dx.patch).toHaveBeenCalledWith(
      `/users/${USER_ID}`,
      { notification_telegram_enabled: false },
    );
  });

  // ─── 5. update both fields at once ────────────────────────────────────

  it('updates both fields when both provided', async () => {
    dx.patch.mockResolvedValueOnce({});
    dx.get.mockResolvedValueOnce({
      data: {
        notification_email_enabled: false,
        notification_telegram_enabled: false,
      },
    });

    await service.setChannelToggles(USER_ID, {
      notification_email_enabled: false,
      notification_telegram_enabled: false,
    });

    expect(dx.patch).toHaveBeenCalledWith(
      `/users/${USER_ID}`,
      {
        notification_email_enabled: false,
        notification_telegram_enabled: false,
      },
    );
  });

  // ─── 6. returns result from getChannelToggles after patch ─────────────

  it('calls getChannelToggles() after successful patch', async () => {
    dx.patch.mockResolvedValueOnce({});
    dx.get.mockResolvedValueOnce({
      data: {
        notification_email_enabled: false,
        notification_telegram_enabled: true,
      },
    });

    const result = await service.setChannelToggles(USER_ID, {
      notification_email_enabled: false,
    });

    // Verify get was called after patch
    expect(dx.get).toHaveBeenCalledTimes(1);
    // Result matches the mocked response
    expect(result).toEqual({
      notification_email_enabled: false,
      notification_telegram_enabled: true,
    });
  });
});
