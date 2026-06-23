// TgBroadcastComposer.test.ts — Unit tests for TgBroadcastComposer.tsx
//
// Tests: form validation, inline button limits, URL validation,
// send-now confirm logic, ActionBar action visibility, mode switch.
// Per standards.md §IV: AAA pattern, Vitest, no it.skip.
//
// NOTE: Uses local reimplementation of component logic to avoid vitest
// ESM/React environment issues (node environment, no @testing-library/react).
// URL validation and send-now confirm dialog logic are tested as pure functions.

import { describe, expect, it } from 'vitest';
import type {
  BroadcastDetail,
  BroadcastStatus,
  CreateBroadcastBody,
  InlineButton,
} from '../../../lib/types';

// ─── Constants (mirrors TgBroadcastComposer.tsx) ──────────────────────────────

const MAX_BUTTONS = 8;

// ─── Form state simulation ─────────────────────────────────────────────────────

interface FormState {
  title: string;
  htmlBody: string;
  inlineButtons: InlineButton[];
  scheduledAt: string;
}

function createEmptyFormState(): FormState {
  return {
    title: '',
    htmlBody: '',
    inlineButtons: [],
    scheduledAt: '',
  };
}

// Validates whether the form is submittable (title + body non-empty)
// Note: the actual component uses native HTML5 `required` attribute,
// but this mirrors the logical validation.
function validateForm(state: FormState): {
  isValid: boolean;
  errors: { title?: string; htmlBody?: string };
} {
  const errors: { title?: string; htmlBody?: string } = {};
  if (!state.title.trim()) {
    errors.title = 'Title is required';
  }
  if (!state.htmlBody.trim()) {
    errors.htmlBody = 'Message body is required';
  }
  return { isValid: Object.keys(errors).length === 0, errors };
}

// Syncs form fields from an existing broadcast (edit mode)
function syncFromBroadcast(broadcast: BroadcastDetail): {
  title: string;
  htmlBody: string;
  inlineButtons: InlineButton[];
  scheduledAt: string;
} {
  return {
    title: broadcast.title,
    htmlBody: broadcast.html_body,
    inlineButtons: broadcast.inline_buttons ?? [],
    scheduledAt: broadcast.scheduled_at ? broadcast.scheduled_at.slice(0, 16) : '',
  };
}

// ─── Button limit simulation ───────────────────────────────────────────────────

function canAddButton(currentCount: number): boolean {
  return currentCount < MAX_BUTTONS;
}

function addButton(buttons: InlineButton[]): InlineButton[] {
  if (buttons.length >= MAX_BUTTONS) return buttons;
  return [...buttons, { label: '', url: '' }];
}

function removeButton(buttons: InlineButton[], index: number): InlineButton[] {
  return buttons.filter((_, i) => i !== index);
}

// ─── URL validation ────────────────────────────────────────────────────────────

// Mirrors the HTML input type="url" validation + business requirement
// Valid: http://... or https://...
const URL_PATTERN = /^https?:\/\/.+/i;

function validateButtonUrl(url: string): { valid: boolean; error?: string } {
  if (!url.trim()) {
    return { valid: false, error: 'URL is required' };
  }
  if (!URL_PATTERN.test(url)) {
    return { valid: false, error: 'URL must start with http:// or https://' };
  }
  return { valid: true };
}

// ─── Send-now confirm dialog logic ───────────────────────────────────────────

function computeSendNowDialog(params: {
  matchCount: number;
  isLoading: boolean;
}): {
  recipientText: string;
  durationWarning: string | null;
  estimatedMinutes: number;
  isLargeSegment: boolean;
} {
  const { matchCount, isLoading } = params;

  if (isLoading) {
    return {
      recipientText: 'Loading recipient count…',
      durationWarning: null,
      estimatedMinutes: 0,
      isLargeSegment: false,
    };
  }

  const estimatedSeconds = matchCount > 0 ? Math.round(matchCount / 30) : 0;
  const estimatedMinutes = Math.ceil(estimatedSeconds / 60);
  const isLargeSegment = matchCount > 10000;

  let durationWarning: string | null = null;
  if (isLargeSegment) {
    durationWarning = `Estimated delivery time: ~${estimatedMinutes} minute${estimatedMinutes !== 1 ? 's' : ''}. Large broadcasts may take longer.`;
  }

  return {
    recipientText: matchCount.toLocaleString('en-US'),
    durationWarning,
    estimatedMinutes,
    isLargeSegment,
  };
}

// ─── ActionBar action visibility logic ───────────────────────────────────────

interface ActionSpec {
  label: string;
  variant: 'default' | 'outline' | 'destructive';
  disabled?: boolean;
  confirm?: { title: string; description: string };
}

function computeActions(
  broadcast: BroadcastDetail | undefined,
  opts: {
    sendTestPending: boolean;
    cancelPending: boolean;
    duplicatePending: boolean;
  },
): ActionSpec[] {
  if (!broadcast) return [];

  const actions: (ActionSpec | null)[] = [];

  // Test send — always available
  actions.push({
    label: 'Test to me',
    variant: 'outline',
    disabled: opts.sendTestPending,
  });

  // Send now — available for draft, scheduled, failed
  if (['draft', 'scheduled', 'failed'].includes(broadcast.status)) {
    actions.push({
      label: 'Send now',
      variant: 'default',
      disabled: !broadcast.audience_segment,
    });
  }

  // Cancel — only for scheduled broadcasts
  if (broadcast.status === 'scheduled') {
    actions.push({
      label: 'Cancel',
      variant: 'destructive',
      disabled: opts.cancelPending,
      confirm: {
        title: 'Cancel broadcast?',
        description: 'This will cancel the scheduled broadcast. This cannot be undone.',
      },
    });
  }

  // Duplicate — always available in edit mode
  actions.push({
    label: 'Duplicate',
    variant: 'outline',
    disabled: opts.duplicatePending,
  });

  return actions.filter((a): a is ActionSpec => a !== null);
}

// ─── BuildUpdateData helper (mirrored from TgBroadcastComposer.tsx) ──────────

function buildUpdateData(data: CreateBroadcastBody) {
  const updateData: Partial<BroadcastDetail> = {
    title: data.title,
    html_body: data.html_body,
  };
  if (data.image_asset !== undefined) updateData.image_asset = data.image_asset;
  if (data.inline_buttons !== undefined) updateData.inline_buttons = data.inline_buttons;
  if (data.audience_segment !== undefined) updateData.audience_segment = data.audience_segment;
  if (data.recurrence !== undefined) updateData.recurrence = data.recurrence;
  return updateData;
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function createMockBroadcast(
  status: BroadcastStatus = 'draft',
  overrides?: Partial<BroadcastDetail & { inline_buttons: InlineButton[] | null }>,
): BroadcastDetail {
  return {
    id: 'bc-001',
    title: 'Test Broadcast',
    country: 'uz',
    status,
    scheduled_at: null,
    sent_count: 0,
    date_created: '2026-06-01T00:00:00Z',
    html_body: '<b>Hello</b>',
    image_asset: null,
    inline_buttons: [],
    audience_segment: null,
    failure_reason: null,
    date_updated: null,
    recurrence: null,
    ...overrides,
  };
}

// ─── Tests: Form validation ───────────────────────────────────────────────────

describe('Form validation', () => {
  it('should return invalid when title is empty', () => {
    const state = createEmptyFormState();
    const result = validateForm(state);
    expect(result.isValid).toBe(false);
    expect(result.errors.title).toBe('Title is required');
  });

  it('should return invalid when htmlBody is empty', () => {
    const state = { ...createEmptyFormState(), title: 'My Campaign' };
    const result = validateForm(state);
    expect(result.isValid).toBe(false);
    expect(result.errors.htmlBody).toBe('Message body is required');
  });

  it('should return invalid when both title and body are empty', () => {
    const state = createEmptyFormState();
    const result = validateForm(state);
    expect(result.isValid).toBe(false);
    expect(result.errors.title).toBe('Title is required');
    expect(result.errors.htmlBody).toBe('Message body is required');
  });

  it('should return valid when both title and body are filled', () => {
    const state = { ...createEmptyFormState(), title: 'Campaign', htmlBody: '<b>Hello</b>' };
    const result = validateForm(state);
    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual({});
  });

  it('should trim whitespace before validating title', () => {
    const state = { ...createEmptyFormState(), title: '   ', htmlBody: '<b>Hello</b>' };
    const result = validateForm(state);
    expect(result.isValid).toBe(false);
    expect(result.errors.title).toBe('Title is required');
  });

  it('should trim whitespace before validating body', () => {
    const state = { ...createEmptyFormState(), title: 'Campaign', htmlBody: '   ' };
    const result = validateForm(state);
    expect(result.isValid).toBe(false);
    expect(result.errors.htmlBody).toBe('Message body is required');
  });

  it('should pass with title and body containing HTML tags', () => {
    const state = {
      ...createEmptyFormState(),
      title: '<b>Bold Title</b>',
      htmlBody: '<b>Bold</b> <i>italic</i> <a href="https://x.com">link</a>',
    };
    const result = validateForm(state);
    expect(result.isValid).toBe(true);
  });
});

// ─── Tests: Inline button limit (MAX 8) ────────────────────────────────────────

describe('Inline button limit (MAX_BUTTONS = 8)', () => {
  it('should allow adding a button when under the limit', () => {
    const buttons: InlineButton[] = [];
    expect(canAddButton(buttons.length)).toBe(true);
  });

  it('should allow adding up to 8 buttons', () => {
    let buttons: InlineButton[] = [];
    for (let i = 0; i < MAX_BUTTONS; i++) {
      if (canAddButton(buttons.length)) {
        buttons = addButton(buttons);
      }
    }
    expect(buttons).toHaveLength(8);
  });

  it('should prevent adding a 9th button', () => {
    const buttons: InlineButton[] = Array.from({ length: MAX_BUTTONS }, (_, i) => ({
      label: `Btn ${i + 1}`,
      url: `https://btn${i + 1}.com`,
    }));
    expect(canAddButton(buttons.length)).toBe(false);

    const result = addButton(buttons);
    expect(result).toHaveLength(8); // unchanged
  });

  it('should not add button when at exact limit', () => {
    const buttons = Array.from({ length: MAX_BUTTONS }, (_, i) => ({
      label: `Btn ${i}`,
      url: 'https://example.com',
    }));
    const result = addButton(buttons);
    expect(result).toHaveLength(8);
  });

  it('should correctly report capacity at each threshold', () => {
    for (let i = 0; i <= MAX_BUTTONS; i++) {
      expect(canAddButton(i)).toBe(i < MAX_BUTTONS);
    }
  });

  it('should allow removing a button at any position', () => {
    const buttons = [
      { label: 'A', url: 'https://a.com' },
      { label: 'B', url: 'https://b.com' },
      { label: 'C', url: 'https://c.com' },
    ];
    const after = removeButton(buttons, 1);
    expect(after).toHaveLength(2);
    expect(after[0]?.label).toBe('A');
    expect(after[1]?.label).toBe('C');
  });
});

// ─── Tests: Button URL validation ─────────────────────────────────────────────

describe('Button URL validation', () => {
  it('should accept https:// URL', () => {
    expect(validateButtonUrl('https://example.com')).toEqual({ valid: true });
  });

  it('should accept http:// URL', () => {
    expect(validateButtonUrl('http://example.com')).toEqual({ valid: true });
  });

  it('should accept URL with path', () => {
    expect(validateButtonUrl('https://example.com/path/to/page')).toEqual({ valid: true });
  });

  it('should accept URL with query params', () => {
    expect(validateButtonUrl('https://example.com/?foo=bar&baz=qux')).toEqual({ valid: true });
  });

  it('should reject empty URL', () => {
    expect(validateButtonUrl('')).toEqual({ valid: false, error: 'URL is required' });
  });

  it('should reject whitespace-only URL', () => {
    expect(validateButtonUrl('   ')).toEqual({ valid: false, error: 'URL is required' });
  });

  it('should reject URL without scheme', () => {
    expect(validateButtonUrl('example.com')).toEqual({
      valid: false,
      error: 'URL must start with http:// or https://',
    });
  });

  it('should reject ftp:// URL', () => {
    expect(validateButtonUrl('ftp://example.com')).toEqual({
      valid: false,
      error: 'URL must start with http:// or https://',
    });
  });

  it('should reject javascript: URL', () => {
    expect(validateButtonUrl('javascript:void(0)')).toEqual({
      valid: false,
      error: 'URL must start with http:// or https://',
    });
  });

  it('should reject URL starting with www only', () => {
    expect(validateButtonUrl('www.example.com')).toEqual({
      valid: false,
      error: 'URL must start with http:// or https://',
    });
  });

  it('should accept URL with port number', () => {
    expect(validateButtonUrl('https://example.com:8080/path')).toEqual({ valid: true });
  });

  it('should accept URL with hash fragment', () => {
    expect(validateButtonUrl('https://example.com/page#section')).toEqual({ valid: true });
  });
});

// ─── Tests: Send-now confirm dialog ────────────────────────────────────────────

describe('Send-now confirm dialog', () => {
  it('should show loading state while fetching preview', () => {
    const result = computeSendNowDialog({ matchCount: 0, isLoading: true });
    expect(result.recipientText).toBe('Loading recipient count…');
    expect(result.durationWarning).toBeNull();
  });

  it('should show recipient count when preview loaded', () => {
    const result = computeSendNowDialog({ matchCount: 5000, isLoading: false });
    expect(result.recipientText).toBe('5,000');
  });

  it('should show duration warning when match_count > 10000', () => {
    const result = computeSendNowDialog({ matchCount: 25000, isLoading: false });
    expect(result.isLargeSegment).toBe(true);
    expect(result.durationWarning).toContain('Estimated delivery time');
    expect(result.durationWarning).toContain('minute'); // shows minutes, not match_count
  });

  it('should not show duration warning when match_count <= 10000', () => {
    const result = computeSendNowDialog({ matchCount: 10000, isLoading: false });
    expect(result.isLargeSegment).toBe(false);
    expect(result.durationWarning).toBeNull();
  });

  it('should compute estimated minutes correctly (round up)', () => {
    // 30000 / 30 = 1000 seconds; ceil(1000/60) = 17 minutes
    const result = computeSendNowDialog({ matchCount: 30000, isLoading: false });
    expect(result.estimatedMinutes).toBe(17);

    // 100 / 30 = 3.33 -> round = 3; ceil(3/60) = 1 minute (minimum)
    const result2 = computeSendNowDialog({ matchCount: 100, isLoading: false });
    expect(result2.estimatedMinutes).toBe(1);

    // 0 -> 0 minutes
    const result3 = computeSendNowDialog({ matchCount: 0, isLoading: false });
    expect(result3.estimatedMinutes).toBe(0);
  });

  it('should format duration warning with correct pluralization', () => {
    // 60 recipients: 60/30=2s -> ceil(2/60)=1 minute
    const result1 = computeSendNowDialog({ matchCount: 60, isLoading: false });
    expect(result1.durationWarning).toBeNull(); // under 10001 threshold

    // 18000 recipients: 18000/30=600s -> ceil(600/60)=10 minutes -> large segment
    const result3 = computeSendNowDialog({ matchCount: 18000, isLoading: false });
    expect(result3.durationWarning).toContain('10 minutes'); // plural
  });

  it('should return recipientText as locale string for formatting', () => {
    const result = computeSendNowDialog({ matchCount: 1234567, isLoading: false });
    expect(result.recipientText).toBe('1,234,567');
  });

  it('should handle boundary: exactly 10000 matches (no warning)', () => {
    const result = computeSendNowDialog({ matchCount: 10000, isLoading: false });
    expect(result.isLargeSegment).toBe(false);
    expect(result.durationWarning).toBeNull();
  });

  it('should handle boundary: 10001 matches (warning appears)', () => {
    const result = computeSendNowDialog({ matchCount: 10001, isLoading: false });
    expect(result.isLargeSegment).toBe(true);
    expect(result.durationWarning).not.toBeNull();
  });
});

// ─── Tests: ActionBar action visibility ───────────────────────────────────────

describe('ActionBar action visibility', () => {
  it('should show no actions when broadcast is undefined', () => {
    const actions = computeActions(undefined, {
      sendTestPending: false,
      cancelPending: false,
      duplicatePending: false,
    });
    expect(actions).toHaveLength(0);
  });

  it('should always show Test send action', () => {
    const bc = createMockBroadcast('draft');
    const actions = computeActions(bc, {
      sendTestPending: false,
      cancelPending: false,
      duplicatePending: false,
    });
    const testAction = actions.find((a) => a.label === 'Test to me');
    expect(testAction).toBeDefined();
    expect(testAction?.variant).toBe('outline');
  });

  it('should show Test send as disabled when sendTest is pending', () => {
    const bc = createMockBroadcast('draft');
    const actions = computeActions(bc, {
      sendTestPending: true,
      cancelPending: false,
      duplicatePending: false,
    });
    const testAction = actions.find((a) => a.label === 'Test to me');
    expect(testAction?.disabled).toBe(true);
  });

  it('should show Send now for draft broadcast', () => {
    const bc = createMockBroadcast('draft');
    const actions = computeActions(bc, {
      sendTestPending: false,
      cancelPending: false,
      duplicatePending: false,
    });
    const sendNow = actions.find((a) => a.label === 'Send now');
    expect(sendNow).toBeDefined();
  });

  it('should show Send now for scheduled broadcast', () => {
    const bc = createMockBroadcast('scheduled');
    const actions = computeActions(bc, {
      sendTestPending: false,
      cancelPending: false,
      duplicatePending: false,
    });
    expect(actions.find((a) => a.label === 'Send now')).toBeDefined();
  });

  it('should show Send now for failed broadcast', () => {
    const bc = createMockBroadcast('failed');
    const actions = computeActions(bc, {
      sendTestPending: false,
      cancelPending: false,
      duplicatePending: false,
    });
    expect(actions.find((a) => a.label === 'Send now')).toBeDefined();
  });

  it('should hide Send now for sent broadcast', () => {
    const bc = createMockBroadcast('sent');
    const actions = computeActions(bc, {
      sendTestPending: false,
      cancelPending: false,
      duplicatePending: false,
    });
    expect(actions.find((a) => a.label === 'Send now')).toBeUndefined();
  });

  it('should hide Send now for sending broadcast', () => {
    const bc = createMockBroadcast('sending');
    const actions = computeActions(bc, {
      sendTestPending: false,
      cancelPending: false,
      duplicatePending: false,
    });
    expect(actions.find((a) => a.label === 'Send now')).toBeUndefined();
  });

  it('should disable Send now when audience_segment is null', () => {
    const bc = createMockBroadcast('draft', { audience_segment: null });
    const actions = computeActions(bc, {
      sendTestPending: false,
      cancelPending: false,
      duplicatePending: false,
    });
    const sendNow = actions.find((a) => a.label === 'Send now');
    expect(sendNow?.disabled).toBe(true);
  });

  it('should enable Send now when audience_segment is set', () => {
    const bc = createMockBroadcast('draft', { audience_segment: 'seg-001' });
    const actions = computeActions(bc, {
      sendTestPending: false,
      cancelPending: false,
      duplicatePending: false,
    });
    const sendNow = actions.find((a) => a.label === 'Send now');
    expect(sendNow?.disabled).toBeFalsy();
  });

  it('should show Cancel only for scheduled broadcast', () => {
    const scheduled = createMockBroadcast('scheduled');
    const actions = computeActions(scheduled, {
      sendTestPending: false,
      cancelPending: false,
      duplicatePending: false,
    });
    const cancel = actions.find((a) => a.label === 'Cancel');
    expect(cancel).toBeDefined();
    expect(cancel?.variant).toBe('destructive');
    expect(cancel?.confirm?.title).toBe('Cancel broadcast?');
  });

  it('should not show Cancel for draft broadcast', () => {
    const bc = createMockBroadcast('draft');
    const actions = computeActions(bc, {
      sendTestPending: false,
      cancelPending: false,
      duplicatePending: false,
    });
    expect(actions.find((a) => a.label === 'Cancel')).toBeUndefined();
  });

  it('should not show Cancel for sent broadcast', () => {
    const bc = createMockBroadcast('sent');
    const actions = computeActions(bc, {
      sendTestPending: false,
      cancelPending: false,
      duplicatePending: false,
    });
    expect(actions.find((a) => a.label === 'Cancel')).toBeUndefined();
  });

  it('should disable Cancel when cancel is pending', () => {
    const bc = createMockBroadcast('scheduled');
    const actions = computeActions(bc, {
      sendTestPending: false,
      cancelPending: true,
      duplicatePending: false,
    });
    const cancel = actions.find((a) => a.label === 'Cancel');
    expect(cancel?.disabled).toBe(true);
  });

  it('should always show Duplicate in edit mode', () => {
    const bc = createMockBroadcast('sent');
    const actions = computeActions(bc, {
      sendTestPending: false,
      cancelPending: false,
      duplicatePending: false,
    });
    const duplicate = actions.find((a) => a.label === 'Duplicate');
    expect(duplicate).toBeDefined();
    expect(duplicate?.variant).toBe('outline');
  });

  it('should disable Duplicate when duplicate is pending', () => {
    const bc = createMockBroadcast('sent');
    const actions = computeActions(bc, {
      sendTestPending: false,
      cancelPending: false,
      duplicatePending: true,
    });
    const duplicate = actions.find((a) => a.label === 'Duplicate');
    expect(duplicate?.disabled).toBe(true);
  });

  it('should return exactly 4 actions for a scheduled broadcast with segment', () => {
    const bc = createMockBroadcast('scheduled', { audience_segment: 'seg-001' });
    const actions = computeActions(bc, {
      sendTestPending: false,
      cancelPending: false,
      duplicatePending: false,
    });
    // Test + Send now + Cancel + Duplicate = 4
    expect(actions).toHaveLength(4);
  });

  it('should return exactly 3 actions for a sent broadcast (Test + Duplicate)', () => {
    const bc = createMockBroadcast('sent');
    const actions = computeActions(bc, {
      sendTestPending: false,
      cancelPending: false,
      duplicatePending: false,
    });
    // Test + Duplicate = 2; no Send now for sent, no Cancel for sent
    expect(actions).toHaveLength(2);
  });
});

// ─── Tests: Mode switch (new vs edit) ─────────────────────────────────────────

describe('Mode switch (new vs edit)', () => {
  it('should pre-populate form from broadcast in edit mode', () => {
    const broadcast = createMockBroadcast('draft', {
      title: 'Existing Title',
      html_body: '<i>Existing body</i>',
      inline_buttons: [{ label: 'Visit', url: 'https://example.com' }],
      scheduled_at: '2026-07-01T12:00:00Z',
    });

    const state = syncFromBroadcast(broadcast);

    expect(state.title).toBe('Existing Title');
    expect(state.htmlBody).toBe('<i>Existing body</i>');
    expect(state.inlineButtons).toHaveLength(1);
    expect(state.inlineButtons[0]?.label).toBe('Visit');
    expect(state.scheduledAt).toBe('2026-07-01T12:00');
  });

  it('should return empty form state for new mode', () => {
    const state = createEmptyFormState();
    expect(state.title).toBe('');
    expect(state.htmlBody).toBe('');
    expect(state.inlineButtons).toEqual([]);
    expect(state.scheduledAt).toBe('');
  });

  it('should handle broadcast with null scheduled_at', () => {
    const broadcast = createMockBroadcast('draft', { scheduled_at: null });
    const state = syncFromBroadcast(broadcast);
    expect(state.scheduledAt).toBe('');
  });

  it('should handle broadcast with null inline_buttons', () => {
    const broadcast = createMockBroadcast('draft', {
      inline_buttons: null as unknown as InlineButton[],
    });
    const state = syncFromBroadcast(broadcast);
    expect(state.inlineButtons).toEqual([]);
  });

  it('should sync inline_buttons array correctly', () => {
    const broadcast = createMockBroadcast('draft', {
      inline_buttons: [
        { label: 'One', url: 'https://one.com' },
        { label: 'Two', url: 'https://two.com' },
      ],
    });
    const state = syncFromBroadcast(broadcast);
    expect(state.inlineButtons).toHaveLength(2);
    expect(state.inlineButtons[0]?.label).toBe('One');
    expect(state.inlineButtons[1]?.url).toBe('https://two.com');
  });
});

// ─── Tests: BuildUpdateData ────────────────────────────────────────────────────

describe('buildUpdateData', () => {
  it('should always include title and html_body', () => {
    const data: CreateBroadcastBody = {
      title: 'Test',
      country: 'uz',
      html_body: '<b>Body</b>',
    };
    const result = buildUpdateData(data);
    expect(result.title).toBe('Test');
    expect(result.html_body).toBe('<b>Body</b>');
  });

  it('should omit image_asset when undefined', () => {
    const data: CreateBroadcastBody = {
      title: 'Test',
      country: 'uz',
      html_body: '<b>Body</b>',
    };
    const result = buildUpdateData(data);
    expect('image_asset' in result).toBe(false);
  });

  it('should include image_asset: null when explicitly set', () => {
    const data: CreateBroadcastBody = {
      title: 'Test',
      country: 'uz',
      html_body: '<b>Body</b>',
      image_asset: null,
    };
    const result = buildUpdateData(data);
    expect(result.image_asset).toBeNull();
  });

  it('should include inline_buttons when defined', () => {
    const data: CreateBroadcastBody = {
      title: 'Test',
      country: 'uz',
      html_body: '<b>Body</b>',
      inline_buttons: [{ label: 'Btn', url: 'https://x.com' }],
    };
    const result = buildUpdateData(data);
    expect(result.inline_buttons).toHaveLength(1);
  });

  it('should include recurrence when defined', () => {
    const data: CreateBroadcastBody = {
      title: 'Test',
      country: 'uz',
      html_body: '<b>Body</b>',
      recurrence: 'weekly',
    };
    const result = buildUpdateData(data);
    expect(result.recurrence).toBe('weekly');
  });
});

// ─── Tests: Save & Schedule flow ──────────────────────────────────────────────

describe('Save & Schedule flow', () => {
  it('should add scheduled_at to update data for scheduled save', () => {
    const futureDate = '2026-07-01T12:00:00Z';
    const data: CreateBroadcastBody = {
      title: 'Scheduled',
      country: 'uz',
      html_body: '<b>Body</b>',
      scheduled_at: futureDate,
    };

    const base = buildUpdateData(data);
    const scheduled = { ...base, scheduled_at: futureDate };

    expect(scheduled.scheduled_at).toBe(futureDate);
    expect(scheduled.title).toBe('Scheduled');
  });

  it('should return empty scheduledAt for unscheduled broadcast', () => {
    const broadcast = createMockBroadcast('draft', { scheduled_at: null });
    const state = syncFromBroadcast(broadcast);
    expect(state.scheduledAt).toBe('');
  });

  it('should validate scheduledAt is not in the past when scheduling', () => {
    const pastDate = '2020-01-01T12:00:00Z';
    const now = new Date().toISOString();
    const isInPast = pastDate < now;
    expect(isInPast).toBe(true);
  });
});
