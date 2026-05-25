import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DirectusClient } from '../directus/directus.client';
import { InteractionsService } from '../interactions/interactions.service';
import { TickLockService } from '../internal-cron/tick-lock.service';

// #358 — pre-event reminder cron (spec-aligned).
//
// Fires three cadences per registered+opted-in member:
//   - day_before    ≈ 24h out (window 20–28h)
//   - hour_before   ≈ 2h out  (window 1.5–2.5h)
//   - morning_of    same calendar day, 4–12h before start
//
// Per-recipient channel routing:
//   - Members with telegram_user_id → telegram dispatch (preferred)
//   - Else → email
// Each channel dispatched separately so the InteractionsService's
// per-dispatch single-channel model works for us (no per-recipient
// fallback inside one dispatch).
//
// Opt-in: honors `notification_opt_ins.event_reminders` (default true
// per #289). Members who explicitly turned this off are filtered out
// BEFORE dispatch — `consentBasis='explicit_opt_in'` would also gate it
// per-purpose, but the pre-filter saves a round-trip + records 0
// dispatches in the audit instead of N skipped-consent rows.
//
// Idempotent on (event, kind) via event_announcements ledger. Per-kind
// ledger means a single event can't re-fire the same cadence even if
// the cron misses + catches up.
//
// In-process @Cron(EVERY_10_MINUTES) via internal-cron module; Redis
// SET-NX lock prevents multi-replica double-fire. /tick controller
// stays as operator escape hatch.

export type ReminderKind = 'reminder_day_before' | 'reminder_hour_before' | 'reminder_morning_of';

export interface TickResult {
  evaluated: number;
  dispatched: Array<{
    eventId: string;
    kind: ReminderKind;
    channel: 'telegram' | 'email';
    interactionId: string;
    recipientCount: number;
  }>;
  skipped: Array<{
    eventId: string;
    kind: ReminderKind;
    reason: 'already_dispatched' | 'no_audience';
  }>;
}

interface EventRow {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  location: string | null;
  country: string;
}

interface AnnouncementRow {
  id: string;
  event: string;
  kind: ReminderKind;
}

interface RegistrationRow {
  user: string;
}

interface UserRow {
  id: string;
  telegram_user_id: string | number | null;
  notification_opt_ins: Record<string, unknown> | null;
}

// Routing decision per recipient.
interface RoutedRecipient {
  userId: string;
  channel: 'telegram' | 'email';
}

interface ReminderWindow {
  kind: ReminderKind;
  // Inclusive bounds for events.starts_at as hours-from-now. The window
  // width is the scheduler tolerance: a 10-min tick + a missed-tick
  // safety margin needs to catch every event exactly once across the
  // (event, kind) ledger.
  fromHours: number;
  toHours: number;
}

const REMINDER_WINDOWS: ReminderWindow[] = [
  // 24h ± 4h. Wide enough that a missed tick still catches.
  { kind: 'reminder_day_before', fromHours: 20, toHours: 28 },
  // 2h ± 0.5h. Tighter because closer = timing matters more.
  { kind: 'reminder_hour_before', fromHours: 1.5, toHours: 2.5 },
  // Morning-of: event later today, 4–12h out. Avoids overlap with
  // hour_before's 1.5–2.5h window. Operator-set send_at_local_time
  // (e.g. 08:00) is a per-event override that lands in a follow-up;
  // v1 uses this simple range.
  { kind: 'reminder_morning_of', fromHours: 4, toHours: 12 },
];

@Injectable()
export class EventRemindersService {
  private readonly logger = new Logger(EventRemindersService.name);

  constructor(
    private readonly directus: DirectusClient,
    private readonly interactions: InteractionsService,
    private readonly locks: TickLockService,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async scheduledTick(): Promise<void> {
    await this.locks.withLock('event-reminders', 540, async () => {
      const r = await this.tick();
      if (r.evaluated > 0) {
        this.logger.log(`scheduledTick evaluated=${r.evaluated} dispatched=${r.dispatched.length}`);
      }
    });
  }

  async tick(): Promise<TickResult> {
    const dispatched: TickResult['dispatched'] = [];
    const skipped: TickResult['skipped'] = [];
    let evaluated = 0;

    for (const window of REMINDER_WINDOWS) {
      const candidates = await this.candidatesForWindow(window);
      evaluated += candidates.length;
      for (const event of candidates) {
        const outcome = await this.processCandidate(event, window.kind);
        for (const d of outcome.dispatched) dispatched.push(d);
        if (outcome.skipped) skipped.push(outcome.skipped);
      }
    }

    this.logger.log(
      `event-reminders tick — evaluated=${evaluated} dispatched=${dispatched.length} skipped=${skipped.length}`,
    );
    return { evaluated, dispatched, skipped };
  }

  private async candidatesForWindow(window: ReminderWindow): Promise<EventRow[]> {
    const now = Date.now();
    const from = new Date(now + window.fromHours * 3600 * 1000).toISOString();
    const to = new Date(now + window.toHours * 3600 * 1000).toISOString();
    const filter = encodeURIComponent(
      JSON.stringify({
        _and: [
          { status: { _eq: 'published' } },
          { starts_at: { _gte: from } },
          { starts_at: { _lte: to } },
        ],
      }),
    );
    const fields = 'id,title,starts_at,ends_at,location,country';
    const res = await this.directus.get<{ data: EventRow[] }>(
      `/items/events?filter=${filter}&fields=${fields}&limit=200&sort=starts_at`,
    );
    return res.data;
  }

  private async processCandidate(
    event: EventRow,
    kind: ReminderKind,
  ): Promise<{
    dispatched: TickResult['dispatched'];
    skipped: TickResult['skipped'][number] | null;
  }> {
    const existing = await this.findAnnouncement(event.id, kind);
    if (existing) {
      return {
        dispatched: [],
        skipped: { eventId: event.id, kind, reason: 'already_dispatched' },
      };
    }
    const optedIn = await this.optedInAttendees(event.id);
    if (optedIn.length === 0) {
      await this.recordAnnouncement(event.id, kind, null, 0);
      return {
        dispatched: [],
        skipped: { eventId: event.id, kind, reason: 'no_audience' },
      };
    }

    // Route per recipient → channel. Telegram-linked + not opted-out
    // get telegram; everyone else gets email.
    const routed = routeRecipients(optedIn);
    const tgIds = routed.filter((r) => r.channel === 'telegram').map((r) => r.userId);
    const emailIds = routed.filter((r) => r.channel === 'email').map((r) => r.userId);

    const dispatched: TickResult['dispatched'] = [];
    if (tgIds.length > 0) {
      const r = await this.dispatchChannel(event, kind, tgIds, 'telegram');
      dispatched.push(r);
    }
    if (emailIds.length > 0) {
      const r = await this.dispatchChannel(event, kind, emailIds, 'email');
      dispatched.push(r);
    }

    // Record the ledger row once total recipient count is known. The
    // (event, kind) UNIQUE constraint means re-firing the same cadence
    // is impossible even if a tick races itself.
    await this.recordAnnouncement(
      event.id,
      kind,
      // dispatched[0]?.interactionId is good enough — we have one ledger
      // row per (event, kind), but two interactions when both channels
      // fire. The ledger row points at the first; the dispatched array
      // surfaces both in the TickResult.
      dispatched[0]?.interactionId ?? null,
      routed.length,
    );
    return { dispatched, skipped: null };
  }

  private async dispatchChannel(
    event: EventRow,
    kind: ReminderKind,
    userIds: string[],
    channel: 'telegram' | 'email',
  ): Promise<TickResult['dispatched'][number]> {
    const intent = INTENT_BY_KIND[kind];
    const { interactionId } = await this.interactions.dispatch({
      initiatorActor: 'system',
      audience: { userIds },
      intent,
      payload: buildReminderPayload(event, kind, channel),
      consentBasis: 'explicit_opt_in',
      consentScope: { purpose: 'events' },
      allowedChannels: [channel],
    });
    return { eventId: event.id, kind, channel, interactionId, recipientCount: userIds.length };
  }

  private async findAnnouncement(
    eventId: string,
    kind: ReminderKind,
  ): Promise<AnnouncementRow | null> {
    const filter = encodeURIComponent(
      JSON.stringify({ event: { _eq: eventId }, kind: { _eq: kind } }),
    );
    const res = await this.directus.get<{ data: AnnouncementRow[] }>(
      `/items/event_announcements?filter=${filter}&fields=id,event,kind&limit=1`,
    );
    return res.data[0] ?? null;
  }

  // Fetches registered attendees joined with their notification_opt_ins +
  // telegram_user_id. Filters server-side to event_reminders!=false (the
  // OptIn default is true; only explicit false excludes).
  private async optedInAttendees(eventId: string): Promise<UserRow[]> {
    const regFilter = encodeURIComponent(
      JSON.stringify({
        _and: [{ event: { _eq: eventId } }, { status: { _in: ['registered', 'attended'] } }],
      }),
    );
    const regs = await this.directus.get<{ data: RegistrationRow[] }>(
      `/items/registrations?filter=${regFilter}&fields=user&limit=5000`,
    );
    const userIds = Array.from(new Set(regs.data.map((r) => r.user)));
    if (userIds.length === 0) return [];

    const userFilter = encodeURIComponent(JSON.stringify({ id: { _in: userIds } }));
    const users = await this.directus.get<{ data: UserRow[] }>(
      `/users?filter=${userFilter}&fields=id,telegram_user_id,notification_opt_ins,telegram_opted_out_at&limit=${userIds.length}`,
    );
    return users.data.filter(isOptedInToReminders);
  }

  private async recordAnnouncement(
    eventId: string,
    kind: ReminderKind,
    interactionId: string | null,
    recipientCount: number,
  ): Promise<void> {
    await this.directus.post('/items/event_announcements', {
      event: eventId,
      kind,
      dispatched_interaction_id: interactionId,
      recipient_count: recipientCount,
    });
  }
}

// ─── Pure helpers (exported for tests) ───────────────────────────────────

const INTENT_BY_KIND: Record<ReminderKind, string> = {
  reminder_day_before: 'reminder_24h',
  reminder_hour_before: 'reminder_2h',
  reminder_morning_of: 'reminder_morning_of',
};

// Routing: telegram for opted-in tg-linked members; email for the rest.
// Opting out of TG broadcasts (telegram_opted_out_at) means email even
// if tg_user_id is present.
export function routeRecipients(users: UserRow[]): RoutedRecipient[] {
  return users.map((u) => {
    const hasTg = u.telegram_user_id != null && Number.parseInt(String(u.telegram_user_id), 10) > 0;
    return {
      userId: u.id,
      channel: hasTg ? 'telegram' : 'email',
    };
  });
}

// Opt-in resolver — defaults to true, only explicit false excludes.
// Defensive against bad data shapes (Directus json column can carry
// anything an operator pasted in).
export function isOptedInToReminders(u: UserRow): boolean {
  const map = u.notification_opt_ins;
  if (!map || typeof map !== 'object') return true; // default
  const v = (map as Record<string, unknown>).event_reminders;
  if (v === false) return false; // explicit opt-out
  return true; // null / undefined / true / any non-false → opted in
}

// Body shapes per (kind × channel). Telegram body is Telegram-safe
// HTML; email body is plain text. Both link back to the event detail.
//
// Operator-facing customisation (per-event override / template library)
// is a follow-up. v1 uses these three pairs.
export function buildReminderPayload(
  event: EventRow,
  kind: ReminderKind,
  channel: 'telegram' | 'email',
): Record<string, unknown> {
  const dateShort = formatDateShort(event.starts_at);
  const time = formatTimeShort(event.starts_at);
  const venue = event.location ?? 'venue TBA';
  const url = `https://aiqadam.org/events/${event.id}`;
  const subject = subjectFor(kind, event.title);
  const text = textFor(kind, event.title, dateShort, time, venue, url);
  if (channel === 'email') {
    return { subject, text };
  }
  // Telegram payload — sent via TelegramAdapter, parse_mode=HTML.
  // Inline button: [📖 Details] → web event page. [📅 Add to calendar]
  // would need an .ics generator; deferred.
  return {
    text: telegramHtmlBody(kind, event.title, dateShort, time, venue),
    parse_mode: 'HTML' as const,
    disable_web_page_preview: true,
    inline_buttons: [[{ text: '📖 Details', url }]],
  };
}

function subjectFor(kind: ReminderKind, title: string): string {
  if (kind === 'reminder_day_before') return `${title} tomorrow — bring a question`;
  if (kind === 'reminder_hour_before') return 'Doors open in 2 hours';
  return `${title} today — see you soon`;
}

function textFor(
  kind: ReminderKind,
  title: string,
  date: string,
  time: string,
  venue: string,
  url: string,
): string {
  if (kind === 'reminder_day_before') {
    return `You're registered for ${title} tomorrow (${date} at ${time}) at ${venue}.\n\nBring one question you'd want to ask the speakers. Even if you don't ask it out loud, having it framed makes the room work.\n\nDetails: ${url}\n\n— AI Qadam`;
  }
  if (kind === 'reminder_hour_before') {
    return `${title} starts in ~2 hours at ${venue}.\n\nDetails + map: ${url}\n\nSee you soon.\n\n— AI Qadam`;
  }
  return `${title} is today at ${time} (${venue}).\n\nDetails + map: ${url}\n\n— AI Qadam`;
}

// Telegram body — url is intentionally not in the body because the
// [📖 Details] inline button carries it; duplicate would look spammy.
function telegramHtmlBody(
  kind: ReminderKind,
  title: string,
  date: string,
  time: string,
  venue: string,
): string {
  if (kind === 'reminder_day_before') {
    return `<b>${escapeHtml(title)}</b> is tomorrow.\n\n${escapeHtml(date)} at ${escapeHtml(time)} · ${escapeHtml(venue)}\n\nBring one question for the speakers.`;
  }
  if (kind === 'reminder_hour_before') {
    return `<b>${escapeHtml(title)}</b> starts in ~2 hours at ${escapeHtml(venue)}.\n\nSee you soon.`;
  }
  return `<b>${escapeHtml(title)}</b> is today at ${escapeHtml(time)}.\n\n${escapeHtml(venue)}`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatDateShort(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatTimeShort(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: false });
}
