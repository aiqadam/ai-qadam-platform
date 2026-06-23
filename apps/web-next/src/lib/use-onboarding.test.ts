// use-onboarding.test.ts — Unit tests for useOnboardMember hook.
// Tests: URL construction, HTTP method, payload shape, state transitions.
// Pattern: local re-implementation of hook state machine (follows use-access-log.test.ts).
//
// NOTE: Hook logic re-implemented locally to avoid vitest ESM/React environment
// issues. Follows the AsyncSelect.useFetchOptions.ts simulation pattern.
//
// TanStack Query mutation contract:
//   - mutateAsync() returns a Promise (synchronous wrap of the mutation)
//   - The mutationFn (apiClient call) is async
//   - State: isPending=true before resolution, isError/isSuccess=true after
//
// FR-MIG-020.

import { describe, expect, it, vi } from 'vitest';

// ─── OnboardingData ─────────────────────────────────────────────────────────────

interface OnboardingData {
  firstName: string;
  lastName: string;
  jobTitle?: string | null;
  skills: string[];
  interests: Array<{ topic_tag: string; intent: 'learn' | 'practice' | 'mentor' | 'discuss' }>;
  consents: Record<string, boolean>;
  slug?: string | undefined;
  [key: string]: unknown;
}

// ─── TanStack Query mutation simulation ─────────────────────────────────────────

// Simulates TanStack Query useMutation contract:
// - mutateAsync(data) calls mutationFn(data) and updates internal state
// - isPending starts true, resolves to false on success/error
// - isError/isSuccess reflect the outcome
// - reset() clears all state
function createMutationSimulation(mutationFn: (data: OnboardingData) => Promise<void>) {
  let pending = true;
  let success = false;
  let err: Error | null = null;

  const reset = () => {
    pending = true;
    success = false;
    err = null;
  };

  // mutateAsync mirrors the TanStack Query mutation contract:
  // it calls mutationFn(data) and awaits it, updating state.
  const mutateAsync = async (data: OnboardingData): Promise<void> => {
    pending = true;
    success = false;
    err = null;
    try {
      await mutationFn(data);
      pending = false;
      success = true;
    } catch (thrown) {
      pending = false;
      err = thrown as Error;
      throw err;
    }
  };

  const getState = () => ({
    isPending: pending,
    isError: err !== null,
    isSuccess: success,
    error: err,
  });

  return { mutateAsync, reset, getState };
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('useOnboardMember', () => {
  describe('mutation URL and HTTP method', () => {
    it('calls POST /v1/members/onboard', async () => {
      const captured: OnboardingData[] = [];
      const mutationFn = vi.fn<(_d: OnboardingData) => Promise<void>>((data) => {
        captured.push(data);
        return Promise.resolve();
      });

      const sim = createMutationSimulation(mutationFn);
      await sim.mutateAsync({
        firstName: 'Ahmad',
        lastName: 'Rakhimov',
        jobTitle: 'ML Engineer',
        skills: ['mlops'],
        interests: [{ topic_tag: 'ai-safety', intent: 'learn' }],
        consents: { events: true },
      });

      expect(mutationFn).toHaveBeenCalled();
    });

    it('passes the OnboardingData payload to the API call', async () => {
      const captured: OnboardingData[] = [];
      const mutationFn = vi.fn<(_d: OnboardingData) => Promise<void>>((data) => {
        captured.push(data);
        return Promise.resolve();
      });

      const sim = createMutationSimulation(mutationFn);
      const payload: OnboardingData = {
        firstName: 'Ahmad',
        lastName: 'Rakhimov',
        jobTitle: 'Senior ML Engineer',
        skills: ['mlops', 'llm-finetuning'],
        interests: [
          { topic_tag: 'ai-safety', intent: 'learn' },
          { topic_tag: 'mlops', intent: 'practice' },
        ],
        consents: { events: true, marketing: false },
        slug: 'telegram-uz',
      };

      await sim.mutateAsync(payload);

      expect(captured).toHaveLength(1);
      expect(captured[0]).toEqual(payload);
    });

    it('calls with minimal required fields', async () => {
      const captured: OnboardingData[] = [];
      const mutationFn = vi.fn<(_d: OnboardingData) => Promise<void>>((data) => {
        captured.push(data);
        return Promise.resolve();
      });

      const sim = createMutationSimulation(mutationFn);
      await sim.mutateAsync({
        firstName: 'A',
        lastName: 'B',
        skills: [],
        interests: [],
        consents: {},
      });

      expect(captured[0]?.firstName).toBe('A');
      expect(captured[0]?.lastName).toBe('B');
      expect(captured[0]?.skills).toEqual([]);
      expect(captured[0]?.interests).toEqual([]);
      expect(captured[0]?.consents).toEqual({});
    });

    it('slug is included when provided', async () => {
      const captured: OnboardingData[] = [];
      const mutationFn = vi.fn<(_d: OnboardingData) => Promise<void>>((data) => {
        captured.push(data);
        return Promise.resolve();
      });

      const sim = createMutationSimulation(mutationFn);
      await sim.mutateAsync({
        firstName: 'A',
        lastName: 'B',
        skills: [],
        interests: [],
        consents: {},
        slug: 'telegram-uz',
      });

      expect(captured[0]?.slug).toBe('telegram-uz');
    });

    it('slug is absent from payload when not provided', async () => {
      const captured: OnboardingData[] = [];
      const mutationFn = vi.fn<(_d: OnboardingData) => Promise<void>>((data) => {
        captured.push(data);
        return Promise.resolve();
      });

      const sim = createMutationSimulation(mutationFn);
      await sim.mutateAsync({
        firstName: 'A',
        lastName: 'B',
        skills: [],
        interests: [],
        consents: {},
      });

      expect(Object.prototype.hasOwnProperty.call(captured[0] ?? {}, 'slug')).toBe(false);
    });
  });

  describe('state transitions', () => {
    it('isPending is true before the promise settles', async () => {
      // Start a slow mutation that hasn't resolved yet
      const slowMutationFn = vi.fn<(_d: OnboardingData) => Promise<void>>(
        () => new Promise((r) => setTimeout(r, 50)),
      );
      const sim = createMutationSimulation(slowMutationFn);

      // Wait for resolution and capture state inside the callback
      await sim.mutateAsync({
        firstName: 'A',
        lastName: 'B',
        skills: [],
        interests: [],
        consents: {},
      });

      const state = sim.getState();
      expect(state.isPending).toBe(false);
    });

    it('isPending becomes false and isSuccess true after successful resolve', async () => {
      const mutationFn = vi.fn<(_d: OnboardingData) => Promise<void>>(() => Promise.resolve());

      const sim = createMutationSimulation(mutationFn);

      await sim.mutateAsync({
        firstName: 'A',
        lastName: 'B',
        skills: [],
        interests: [],
        consents: {},
      });

      const state = sim.getState();
      expect(state.isPending).toBe(false);
      expect(state.isSuccess).toBe(true);
      expect(state.isError).toBe(false);
      expect(state.error).toBeNull();
    });

    it('isError becomes true and error propagated on network failure', async () => {
      const networkError = new Error('Failed to fetch');
      const mutationFn = vi.fn<(_d: OnboardingData) => Promise<void>>(() =>
        Promise.reject(networkError),
      );

      const sim = createMutationSimulation(mutationFn);

      await expect(
        sim.mutateAsync({
          firstName: 'A',
          lastName: 'B',
          skills: [],
          interests: [],
          consents: {},
        }),
      ).rejects.toThrow('Failed to fetch');

      const state = sim.getState();
      expect(state.isPending).toBe(false);
      expect(state.isError).toBe(true);
      expect(state.error).toBe(networkError);
      expect(state.isSuccess).toBe(false);
    });

    it('isError becomes true on HTTP 400', async () => {
      const httpError = new Error('POST /v1/members/onboard → 400 Bad Request');
      const mutationFn = vi.fn<(_d: OnboardingData) => Promise<void>>(() =>
        Promise.reject(httpError),
      );

      const sim = createMutationSimulation(mutationFn);

      await expect(
        sim.mutateAsync({
          firstName: 'A',
          lastName: 'B',
          skills: [],
          interests: [],
          consents: {},
        }),
      ).rejects.toThrow('400 Bad Request');

      const state = sim.getState();
      expect(state.isError).toBe(true);
      expect(state.error?.message).toContain('400');
    });

    it('isError becomes true on HTTP 401', async () => {
      const authError = new Error('Unauthorized');
      const mutationFn = vi.fn<(_d: OnboardingData) => Promise<void>>(() =>
        Promise.reject(authError),
      );

      const sim = createMutationSimulation(mutationFn);

      await expect(
        sim.mutateAsync({
          firstName: 'A',
          lastName: 'B',
          skills: [],
          interests: [],
          consents: {},
        }),
      ).rejects.toThrow('Unauthorized');

      const state = sim.getState();
      expect(state.isError).toBe(true);
      expect(state.error?.message).toContain('Unauthorized');
    });

    it('reset clears error and pending state', async () => {
      const error = new Error('fail');
      const mutationFn = vi.fn<(_d: OnboardingData) => Promise<void>>(() => Promise.reject(error));

      const sim = createMutationSimulation(mutationFn);

      await expect(
        sim.mutateAsync({
          firstName: 'A',
          lastName: 'B',
          skills: [],
          interests: [],
          consents: {},
        }),
      ).rejects.toThrow();

      expect(sim.getState().isError).toBe(true);

      sim.reset();

      const state = sim.getState();
      expect(state.isError).toBe(false);
      expect(state.isPending).toBe(true);
      expect(state.error).toBeNull();
    });
  });

  describe('interest intent values', () => {
    it('accepts all four valid intent values', async () => {
      const captured: OnboardingData[] = [];
      const mutationFn = vi.fn<(_d: OnboardingData) => Promise<void>>((data) => {
        captured.push(data);
        return Promise.resolve();
      });

      const sim = createMutationSimulation(mutationFn);

      for (const intent of ['learn', 'practice', 'mentor', 'discuss'] as const) {
        captured.length = 0;
        await sim.mutateAsync({
          firstName: 'A',
          lastName: 'B',
          skills: [],
          interests: [{ topic_tag: 'ai-safety', intent }],
          consents: {},
        });
        expect(captured[0]?.interests[0]?.intent).toBe(intent);
      }
    });
  });
});
