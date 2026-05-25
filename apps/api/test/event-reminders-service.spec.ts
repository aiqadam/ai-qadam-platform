import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DirectusClient } from '../src/modules/directus/directus.client';
import type { InteractionsService } from '../src/modules/interactions/interactions.service';
import type { TickLockService } from '../src/modules/internal-cron/tick-lock.service';
import {
  EventRemindersService,
  buildReminderPayload,
  isOptedInToReminders,
  routeRecipients,
} from '../src/modules/workspace/event-reminders.service';

// #358 — tick() drives the per-cadence dispatch from the in-process
// scheduler (or operator escape-hatch /tick). Tests mock Directus,
// InteractionsService, and TickLockService; we control the clock so
// the reminder windows are deterministic.
//
// Behaviour of record:
//   - 3 windows (day_before / hour_before / morning_of)
//   - opt-in filter excludes members who set event_reminders=false
//   - per-recipient channel routing: tg-linked → telegram, else → email
//     (two separate dispatch() calls per event when both groups exist)
//   - idempotent on (event, kind) via event_announcements

type FakeDirectus = {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};
type FakeInteractions = { dispatch: ReturnType<typeof vi.fn> };
type FakeLocks = { withLock: ReturnType<typeof vi.fn> };

let dx: FakeDirectus;
let interactions: FakeInteractions;
let locks: FakeLocks;
let svc: EventRemindersService;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-10T10:00:00.000Z'));
  dx = { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() };
  interactions = { dispatch: vi.fn() };
  locks = { withLock: vi.fn() };
  svc = new EventRemindersService(
    dx as unknown as DirectusClient,
    interactions as unknown as InteractionsService,
    locks as unknown as TickLockService,
  );
});

function eventRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'evt-1',
    title: 'AI Qadam Tashkent #4',
    starts_at: '2026-06-11T10:00:00.000Z', // 24h from now → day_before window
    ends_at: '2026-06-11T13:00:00.000Z',
    location: 'Workly office',
    country: 'uz',
    ...overrides,
  };
}

function userRow(
  overrides: Partial<{ id: string; tg: string | number | null; optIn: boolean | null }> = {},
): Record<string, unknown> {
  return {
    id: overrides.id ?? 'u-1',
    telegram_user_id: overrides.tg ?? null,
    notification_opt_ins: overrides.optIn == null ? null : { event_reminders: overrides.optIn },
  };
}

// ─── Pure helpers ────────────────────────────────────────────────────────

describe('isOptedInToReminders', () => {
  it('defaults to true when notification_opt_ins is null', () => {
    expect(isOptedInToReminders(userRow({ optIn: null }) as never)).toBe(true);
  });
  it('defaults to true when the key is absent', () => {
    expect(
      isOptedInToReminders({
        id: 'u',
        telegram_user_id: null,
        notification_opt_ins: { newsletter: true },
      } as never),
    ).toBe(true);
  });
  it('returns false only when explicitly event_reminders=false', () => {
    expect(isOptedInToReminders(userRow({ optIn: false }) as never)).toBe(false);
  });
  it('treats true verbatim as opted in', () => {
    expect(isOptedInToReminders(userRow({ optIn: true }) as never)).toBe(true);
  });
  it('defends against malformed shapes (string instead of object)', () => {
    expect(
      isOptedInToReminders({
        id: 'u',
        telegram_user_id: null,
        notification_opt_ins: 'oops' as unknown as Record<string, unknown>,
      } as never),
    ).toBe(true);
  });
});

describe('routeRecipients', () => {
  it('routes tg-linked members to telegram, others to email', () => {
    const routed = routeRecipients([
      userRow({ id: 'a', tg: 123 }) as never,
      userRow({ id: 'b', tg: null }) as never,
      userRow({ id: 'c', tg: '999888777' }) as never,
    ]);
    expect(routed).toEqual([
      { userId: 'a', channel: 'telegram' },
      { userId: 'b', channel: 'email' },
      { userId: 'c', channel: 'telegram' },
    ]);
  });
  it('treats tg_user_id=0 / invalid as not-linked → email', () => {
    const routed = routeRecipients([
      userRow({ id: 'z', tg: 0 }) as never,
      userRow({ id: 'y', tg: 'not-a-number' }) as never,
    ]);
    expect(routed.every((r) => r.channel === 'email')).toBe(true);
  });
});

describe('buildReminderPayload', () => {
  const event = eventRow() as never;
  it('email subject mentions "tomorrow" for day_before', () => {
    const out = buildReminderPayload(event, 'reminder_day_before', 'email') as {
      subject: string;
    };
    expect(out.subject).toContain('tomorrow');
  });
  it('email subject mentions "2 hours" for hour_before', () => {
    const out = buildReminderPayload(event, 'reminder_hour_before', 'email') as {
      subject: string;
    };
    expect(out.subject).toContain('2 hours');
  });
  it('email subject mentions "today" for morning_of', () => {
    const out = buildReminderPayload(event, 'reminder_morning_of', 'email') as {
      subject: string;
    };
    expect(out.subject).toContain('today');
  });
  it('telegram payload has parse_mode=HTML + inline Details button', () => {
    const out = buildReminderPayload(event, 'reminder_day_before', 'telegram') as {
      parse_mode: string;
      inline_buttons: Array<Array<{ text: string; url: string }>>;
    };
    expect(out.parse_mode).toBe('HTML');
    expect(out.inline_buttons[0]?.[0]?.text).toContain('Details');
    expect(out.inline_buttons[0]?.[0]?.url).toContain('/events/evt-1');
  });
  it('escapes html in event title for telegram body', () => {
    const out = buildReminderPayload(
      eventRow({ title: 'Q&A <b>Live</b>' }) as never,
      'reminder_day_before',
      'telegram',
    ) as { text: string };
    expect(out.text).toContain('Q&amp;A &lt;b&gt;Live&lt;/b&gt;');
  });
});

// ─── Tick — windowing ───────────────────────────────────────────────────

describe('EventRemindersService.tick — windows', () => {
  it('queries 3 windows (one per kind)', async () => {
    dx.get.mockResolvedValue({ data: [] });
    await svc.tick();
    // 3 window-candidate fetches; no further fetches since each window is empty.
    expect(dx.get).toHaveBeenCalledTimes(3);
  });

  it('day_before window asks for starts_at +20h to +28h', async () => {
    dx.get.mockResolvedValue({ data: [] });
    await svc.tick();
    const call = decodeURIComponent(dx.get.mock.calls[0]?.[0] as string);
    // 2026-06-10T10:00 + 20h = 2026-06-11T06:00; + 28h = 2026-06-11T14:00
    expect(call).toContain('2026-06-11T06:00:00');
    expect(call).toContain('2026-06-11T14:00:00');
  });
});

// ─── Tick — opt-in filter ───────────────────────────────────────────────

describe('EventRemindersService.tick — opt-in filter', () => {
  it('excludes members with notification_opt_ins.event_reminders=false', async () => {
    dx.get
      .mockResolvedValueOnce({ data: [eventRow()] }) // day_before candidates
      .mockResolvedValueOnce({ data: [] }) // findAnnouncement → none
      .mockResolvedValueOnce({
        data: [{ user: 'opted-in' }, { user: 'opted-out' }],
      }) // registrations
      .mockResolvedValueOnce({
        data: [
          userRow({ id: 'opted-in', optIn: true }),
          userRow({ id: 'opted-out', optIn: false }),
        ],
      }) // /users batch fetch
      .mockResolvedValueOnce({ data: [] }) // hour_before window
      .mockResolvedValueOnce({ data: [] }); // morning_of window
    interactions.dispatch.mockResolvedValueOnce({ interactionId: 'i-1', deliveries: [] });
    dx.post.mockResolvedValueOnce({ data: { id: 'ann-1' } });

    const result = await svc.tick();

    // Only opted-in received the dispatch; opted-out filtered server-side
    // before InteractionsService.dispatch was called.
    expect(interactions.dispatch).toHaveBeenCalledTimes(1);
    const input = interactions.dispatch.mock.calls[0]?.[0] as {
      audience: { userIds: string[] };
    };
    expect(input.audience.userIds).toEqual(['opted-in']);
    expect(result.dispatched[0]?.recipientCount).toBe(1);
  });
});

// ─── Tick — channel routing ─────────────────────────────────────────────

describe('EventRemindersService.tick — channel routing', () => {
  it('fires two dispatches (telegram + email) when audience splits', async () => {
    dx.get
      .mockResolvedValueOnce({ data: [eventRow()] })
      .mockResolvedValueOnce({ data: [] }) // findAnnouncement
      .mockResolvedValueOnce({
        data: [{ user: 'tg-user' }, { user: 'email-user' }],
      })
      .mockResolvedValueOnce({
        data: [userRow({ id: 'tg-user', tg: 123456789 }), userRow({ id: 'email-user', tg: null })],
      })
      .mockResolvedValueOnce({ data: [] }) // hour_before
      .mockResolvedValueOnce({ data: [] }); // morning_of
    interactions.dispatch
      .mockResolvedValueOnce({ interactionId: 'i-tg', deliveries: [] })
      .mockResolvedValueOnce({ interactionId: 'i-email', deliveries: [] });
    dx.post.mockResolvedValueOnce({ data: { id: 'ann' } });

    const result = await svc.tick();

    expect(interactions.dispatch).toHaveBeenCalledTimes(2);
    const channels = interactions.dispatch.mock.calls.map(
      (c) => (c[0] as { allowedChannels: string[] }).allowedChannels[0],
    );
    expect(channels).toEqual(['telegram', 'email']);
    expect(result.dispatched.map((d) => d.channel).sort()).toEqual(['email', 'telegram']);
  });
});

// ─── Tick — idempotency + skip cases ────────────────────────────────────

describe('EventRemindersService.tick — idempotency', () => {
  it('skips event with existing ledger row', async () => {
    dx.get
      .mockResolvedValueOnce({ data: [eventRow()] })
      .mockResolvedValueOnce({
        data: [{ id: 'prior', event: 'evt-1', kind: 'reminder_day_before' }],
      })
      .mockResolvedValueOnce({ data: [] }) // hour_before
      .mockResolvedValueOnce({ data: [] }); // morning_of

    const result = await svc.tick();
    expect(result.dispatched).toEqual([]);
    expect(result.skipped[0]).toEqual({
      eventId: 'evt-1',
      kind: 'reminder_day_before',
      reason: 'already_dispatched',
    });
    expect(interactions.dispatch).not.toHaveBeenCalled();
  });

  it('records no_audience ledger when everyone opted out', async () => {
    dx.get
      .mockResolvedValueOnce({ data: [eventRow()] })
      .mockResolvedValueOnce({ data: [] }) // findAnnouncement
      .mockResolvedValueOnce({ data: [{ user: 'opted-out' }] })
      .mockResolvedValueOnce({ data: [userRow({ id: 'opted-out', optIn: false })] })
      .mockResolvedValueOnce({ data: [] }) // hour_before
      .mockResolvedValueOnce({ data: [] }); // morning_of
    dx.post.mockResolvedValueOnce({ data: { id: 'ann-empty' } });

    const result = await svc.tick();
    expect(result.skipped[0]?.reason).toBe('no_audience');
    expect(interactions.dispatch).not.toHaveBeenCalled();
    const ledger = dx.post.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(ledger.recipient_count).toBe(0);
  });
});
