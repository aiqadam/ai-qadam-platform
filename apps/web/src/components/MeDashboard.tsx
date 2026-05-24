import { QRCodeSVG } from 'qrcode.react';
import { type ReactElement, useEffect, useState } from 'react';
import { type AuthMe, getAuthState, signOut } from '../lib/auth-bootstrap';

// /me dashboard per design s3-2 + U-Me1a uplift. Client-side island:
//   1. getAuthState() — shared bootstrap, deduped with other islands.
//   2. In parallel: GET /api/v1/registrations/mine + GET /api/v1/me/profile.
//   3. Render: header (avatar + name + role chip), profile-completeness
//      nudge if incomplete, next-event hero if upcoming, stat cards,
//      registrations list with QR codes for active registrations.

type Status = 'registered' | 'waitlisted' | 'cancelled' | 'attended';

interface MineEntry {
  id: string;
  status: Status;
  checkinCode: string;
  checkedInAt: string | null;
  event: {
    id: string;
    title: string;
    startsAt: string;
    endsAt: string;
    location: string | null;
  };
}

interface Profile {
  first_name: string | null;
  last_name: string | null;
  job_title: string | null;
  seniority: string | null;
  industry_tags: string[];
  is_student: boolean;
  bio_md: string | null;
}

interface Skill {
  id: string;
}

interface Session {
  me: AuthMe;
  accessToken: string;
  registrations: MineEntry[];
  profile: Profile | null;
  skillCount: number;
}

type State =
  | { phase: 'loading' }
  | { phase: 'anon' }
  | { phase: 'authed'; session: Session }
  | { phase: 'error'; message: string };

async function fetchMine(accessToken: string): Promise<MineEntry[]> {
  const res = await fetch('/api/v1/registrations/mine', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return [];
  const body = (await res.json()) as { registrations: MineEntry[] };
  return body.registrations;
}

async function fetchProfile(
  accessToken: string,
): Promise<{ profile: Profile | null; skillCount: number }> {
  const res = await fetch('/api/v1/me/profile', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return { profile: null, skillCount: 0 };
  const body = (await res.json()) as { profile: Profile; skills: Skill[] };
  return { profile: body.profile, skillCount: body.skills?.length ?? 0 };
}

async function bootstrap(): Promise<State> {
  const auth = await getAuthState();
  if (!auth) return { phase: 'anon' };
  const { me, accessToken } = auth;

  const [registrations, profileBundle] = await Promise.all([
    fetchMine(accessToken),
    fetchProfile(accessToken),
  ]);

  return {
    phase: 'authed',
    session: {
      me,
      accessToken,
      registrations,
      profile: profileBundle.profile,
      skillCount: profileBundle.skillCount,
    },
  };
}

// Sign-out logic moved to lib/auth-bootstrap so the same flow is
// reused by NavAccountMenu without duplicating the refresh + revoke
// dance. See `signOut` import above.

function nextHere(): string {
  return `${window.location.pathname}${window.location.search}`;
}

const dateFmt = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

function displayName(me: AuthMe, profile: Profile | null): string {
  const first = profile?.first_name?.trim();
  const last = profile?.last_name?.trim();
  if (first && last) return `${first} ${last}`;
  if (first) return first;
  return me.email.split('@')[0] ?? me.email;
}

function initials(me: AuthMe, profile: Profile | null): string {
  const first = profile?.first_name?.trim();
  const last = profile?.last_name?.trim();
  if (first && last) return `${first[0]}${last[0]}`.toUpperCase();
  if (first) return first.slice(0, 2).toUpperCase();
  const local = me.email.split('@')[0] ?? me.email;
  const parts = local.split(/[._-]+/).filter(Boolean);
  const a = parts[0]?.[0] ?? local[0] ?? '?';
  const b = parts[1]?.[0] ?? parts[0]?.[1] ?? '';
  return `${a}${b}`.toUpperCase();
}

// Map the highest-rank Authentik group to a friendly chip label. Group
// names are canonical per ADR-0021; ranking ensures e.g. a super-admin
// who is also country-lead-uz shows as "Admin", not "Country lead".
function roleLabel(groups: string[]): string | null {
  if (groups.includes('aiqadam-super-admin') || groups.includes('authentik Admins')) {
    return 'Admin';
  }
  const countryLead = groups.find((g) => g.startsWith('aiqadam-country-lead-'));
  if (countryLead) {
    const cc = countryLead.slice('aiqadam-country-lead-'.length).toUpperCase();
    return `Country lead · ${cc}`;
  }
  const organizer = groups.find((g) => g.startsWith('aiqadam-organizer-'));
  if (organizer) {
    const cc = organizer.slice('aiqadam-organizer-'.length).toUpperCase();
    return `Organizer · ${cc}`;
  }
  if (groups.some((g) => g === 'aiqadam-sponsor-rep' || g.startsWith('aiqadam-sponsor-rep-'))) {
    return 'Sponsor';
  }
  if (groups.includes('aiqadam-speaker')) return 'Speaker';
  if (groups.includes('aiqadam-staff')) return 'Staff';
  return null;
}

// 6 binary signals → 0..6. Anything ≥6 hides the nudge.
interface CompletenessSignal {
  key: string;
  label: string;
  done: boolean;
}

function completenessSignals(profile: Profile | null, skillCount: number): CompletenessSignal[] {
  return [
    {
      key: 'name',
      label: 'Name',
      done: Boolean(profile?.first_name?.trim() && profile?.last_name?.trim()),
    },
    { key: 'job_title', label: 'Job title', done: Boolean(profile?.job_title?.trim()) },
    { key: 'seniority', label: 'Seniority', done: Boolean(profile?.seniority) },
    {
      key: 'industry',
      label: 'Industry or student status',
      done: Boolean(profile && (profile.industry_tags.length > 0 || profile.is_student)),
    },
    {
      key: 'bio',
      label: 'Short bio',
      done: Boolean(profile?.bio_md && profile.bio_md.length > 20),
    },
    { key: 'skills', label: 'At least one skill', done: skillCount > 0 },
  ];
}

const daysFmt = new Intl.RelativeTimeFormat('en-US', { numeric: 'auto' });
function relativeDay(target: Date): string {
  const ms = target.getTime() - Date.now();
  const days = Math.round(ms / (1000 * 60 * 60 * 24));
  if (Math.abs(days) >= 1) return daysFmt.format(days, 'day');
  const hours = Math.round(ms / (1000 * 60 * 60));
  if (Math.abs(hours) >= 1) return daysFmt.format(hours, 'hour');
  return 'soon';
}

interface StatCardProps {
  label: string;
  value: number | string;
  hint?: string;
}

function StatCard({ label, value, hint }: StatCardProps): ReactElement {
  return (
    <div
      style={{
        padding: 20,
        border: '1px solid var(--border)',
        borderRadius: 12,
        background: 'var(--card)',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      <p
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          color: 'var(--muted-foreground)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          margin: 0,
        }}
      >
        {label}
      </p>
      <p
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 600,
          fontSize: 32,
          letterSpacing: '-0.02em',
          margin: 0,
        }}
      >
        {value}
      </p>
      {hint && <p style={{ fontSize: 12, color: 'var(--muted-foreground)', margin: 0 }}>{hint}</p>}
    </div>
  );
}

// U-Me1c: 90-day attendance heatmap. Buckets attended registrations by
// local-calendar day (Y-M-D key from checkedInAt; falls back to event
// startsAt when checkedInAt is null — e.g. retro-flagged attendance).
const HEATMAP_WEEKS = 13;
const HEATMAP_DAYS = HEATMAP_WEEKS * 7;

function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

interface HeatmapCell {
  date: Date;
  key: string;
  count: number;
  titles: string[];
}

function buildHeatmap(attended: MineEntry[]): HeatmapCell[] {
  const byDay = new Map<string, { count: number; titles: string[] }>();
  for (const r of attended) {
    const stamp = r.checkedInAt ?? r.event.startsAt;
    const k = dayKey(new Date(stamp));
    const cur = byDay.get(k) ?? { count: 0, titles: [] };
    cur.count += 1;
    cur.titles.push(r.event.title);
    byDay.set(k, cur);
  }
  // Anchor on today so the right edge is "this week". Walk back
  // HEATMAP_DAYS - 1 days inclusive.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cells: HeatmapCell[] = [];
  for (let i = HEATMAP_DAYS - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const k = dayKey(d);
    const bucket = byDay.get(k);
    cells.push({
      date: d,
      key: k,
      count: bucket?.count ?? 0,
      titles: bucket?.titles ?? [],
    });
  }
  return cells;
}

const heatmapDateFmt = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});

interface ActivityHeatmapProps {
  attended: MineEntry[];
}

function ActivityHeatmap({ attended }: ActivityHeatmapProps): ReactElement | null {
  if (attended.length === 0) return null;
  const cells = buildHeatmap(attended);
  // 13 columns (weeks), 7 rows (Mon..Sun). Render column-major: column k
  // holds cells[k*7..k*7+6]. buildHeatmap is row-major across the day
  // sequence, so reshape via index math at render time.
  const cols = HEATMAP_WEEKS;
  const rows = 7;
  return (
    <section>
      <h2
        style={{
          fontFamily: 'var(--font-mono)',
          fontWeight: 500,
          fontSize: 11,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--muted-foreground)',
          margin: '0 0 10px',
        }}
      >
        Last 13 weeks
      </h2>
      <div
        role="img"
        aria-label={`Attendance heatmap: ${attended.length} event${attended.length === 1 ? '' : 's'} in the last 90 days`}
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, 12px)`,
          gridTemplateRows: `repeat(${rows}, 12px)`,
          gridAutoFlow: 'column',
          gap: 3,
          padding: 12,
          border: '1px solid var(--border)',
          borderRadius: 12,
          background: 'var(--card)',
          width: 'max-content',
          maxWidth: '100%',
          overflowX: 'auto',
        }}
      >
        {cells.map((cell) => {
          const bg =
            cell.count === 0
              ? 'var(--muted)'
              : cell.count === 1
                ? 'color-mix(in oklch, var(--primary) 45%, var(--muted))'
                : 'var(--primary)';
          const title =
            cell.count === 0
              ? heatmapDateFmt.format(cell.date)
              : `${heatmapDateFmt.format(cell.date)} — ${cell.titles.join(', ')}`;
          return (
            <div
              key={cell.key}
              title={title}
              style={{
                width: 12,
                height: 12,
                borderRadius: 3,
                background: bg,
              }}
            />
          );
        })}
      </div>
    </section>
  );
}

function statusBadgeStyle(status: Status): { label: string; bg: string; fg: string } {
  if (status === 'registered') {
    return {
      label: "You're in",
      bg: 'color-mix(in oklch, var(--primary) 12%, transparent)',
      fg: 'var(--primary)',
    };
  }
  if (status === 'attended') {
    return {
      label: 'Checked in',
      bg: 'color-mix(in oklch, var(--success, oklch(0.7 0.13 145)) 12%, transparent)',
      fg: 'var(--success, oklch(0.7 0.13 145))',
    };
  }
  if (status === 'waitlisted') {
    return { label: 'On waitlist', bg: 'var(--muted)', fg: 'var(--muted-foreground)' };
  }
  return { label: 'Cancelled', bg: 'var(--muted)', fg: 'var(--muted-foreground)' };
}

interface RegistrationRowProps {
  entry: MineEntry;
}

function RegistrationRow({ entry }: RegistrationRowProps): ReactElement {
  const badge = statusBadgeStyle(entry.status);
  const checkinUrl = `${window.location.origin}/checkin?code=${entry.checkinCode}`;
  const showQR = entry.status === 'registered';
  return (
    <li
      style={{
        display: 'grid',
        gridTemplateColumns: showQR ? '1fr 140px' : '1fr',
        gap: 20,
        padding: 20,
        border: '1px solid var(--border)',
        borderRadius: 12,
        background: 'var(--card)',
        alignItems: 'center',
      }}
    >
      <div>
        <a
          href={`/events/${entry.event.id}`}
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 600,
            fontSize: 17,
            color: 'inherit',
            textDecoration: 'none',
            display: 'block',
            marginBottom: 6,
          }}
        >
          {entry.event.title}
        </a>
        <p style={{ fontSize: 13, color: 'var(--muted-foreground)', margin: '0 0 10px' }}>
          {dateFmt.format(new Date(entry.event.startsAt))}
          {entry.event.location && ` · ${entry.event.location}`}
        </p>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 8px',
            borderRadius: 6,
            background: badge.bg,
            color: badge.fg,
            fontSize: 12,
            fontFamily: 'var(--font-mono)',
            letterSpacing: '0.04em',
          }}
        >
          {badge.label}
        </span>
        {entry.checkedInAt && (
          <p
            style={{
              marginTop: 8,
              fontSize: 11,
              color: 'var(--muted-foreground)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            Checked in {dateFmt.format(new Date(entry.checkedInAt))}
          </p>
        )}
      </div>
      {showQR && (
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              padding: 8,
              background: 'white',
              borderRadius: 8,
              display: 'inline-block',
            }}
          >
            <QRCodeSVG value={checkinUrl} size={110} />
          </div>
          <p
            style={{
              marginTop: 6,
              fontSize: 10,
              color: 'var(--muted-foreground)',
              fontFamily: 'var(--font-mono)',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            Show at the door
          </p>
        </div>
      )}
    </li>
  );
}

function AnonView(): ReactElement {
  return (
    <div
      style={{
        padding: 32,
        border: '1px solid var(--border)',
        borderRadius: 12,
        background: 'var(--card)',
        textAlign: 'center',
      }}
    >
      <h2
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 600,
          fontSize: 22,
          margin: '0 0 8px',
        }}
      >
        Sign in to see your dashboard
      </h2>
      <p style={{ fontSize: 14, color: 'var(--muted-foreground)', margin: '0 0 20px' }}>
        Track your registrations, see your check-in QR codes, and earn points for attending.
      </p>
      <a
        className="btn btn-primary btn-lg"
        href={`/auth/sign-in?next=${encodeURIComponent(nextHere())}`}
        style={{ textDecoration: 'none' }}
      >
        Sign in
      </a>
    </div>
  );
}

// SSR-passed event suggestions. The full ApiEvent shape from cms.ts is
// heavier than we need; me.astro narrows down to just these fields.
export interface SuggestedEvent {
  id: string;
  title: string;
  startsAt: string;
  location: string | null;
  format: 'meetup' | 'workshop' | 'hackathon' | 'conference' | 'online';
  slug: string | null;
}

interface DashboardProps {
  session: Session;
  suggestedEvents: SuggestedEvent[];
}

const formatLabel: Record<SuggestedEvent['format'], string> = {
  meetup: 'Meetup',
  workshop: 'Workshop',
  hackathon: 'Hackathon',
  conference: 'Conference',
  online: 'Online',
};

interface SuggestedEventCardProps {
  event: SuggestedEvent;
}

function SuggestedEventCard({ event }: SuggestedEventCardProps): ReactElement {
  const startsAt = new Date(event.startsAt);
  return (
    <a
      href={`/events/${event.id}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: 16,
        border: '1px solid var(--border)',
        borderRadius: 12,
        background: 'var(--card)',
        color: 'inherit',
        textDecoration: 'none',
        transition: 'border-color 150ms ease',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          color: 'var(--muted-foreground)',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
        }}
      >
        {formatLabel[event.format]} · {relativeDay(startsAt)}
      </span>
      <p
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 600,
          fontSize: 16,
          lineHeight: 1.3,
          margin: 0,
        }}
      >
        {event.title}
      </p>
      <p style={{ fontSize: 12, color: 'var(--muted-foreground)', margin: 0 }}>
        {dateFmt.format(startsAt)}
        {event.location && ` · ${event.location}`}
      </p>
    </a>
  );
}

interface QuickActionsProps {
  isStudent: boolean;
}

function QuickActions({ isStudent }: QuickActionsProps): ReactElement {
  const actions = [
    { href: '/events', label: 'Browse all events' },
    { href: '/leaderboard', label: 'View leaderboard' },
    { href: '/me/profile', label: isStudent ? 'Update student status' : 'Edit profile' },
  ];
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {actions.map((a) => (
        <a
          key={a.href}
          href={a.href}
          className="btn btn-sm"
          style={{ textDecoration: 'none', background: 'var(--card)' }}
        >
          {a.label}
        </a>
      ))}
    </div>
  );
}

interface AvatarProps {
  text: string;
}

function Avatar({ text }: AvatarProps): ReactElement {
  return (
    <div
      aria-hidden="true"
      style={{
        width: 56,
        height: 56,
        borderRadius: '50%',
        border: '1px solid var(--border)',
        background: 'color-mix(in oklch, var(--primary) 22%, var(--card))',
        color: 'var(--foreground)',
        fontFamily: 'var(--font-mono)',
        fontSize: 18,
        fontWeight: 600,
        letterSpacing: '0.02em',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {text}
    </div>
  );
}

interface RoleChipProps {
  label: string;
}

function RoleChip({ label }: RoleChipProps): ReactElement {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '3px 8px',
        borderRadius: 6,
        background: 'color-mix(in oklch, var(--primary) 12%, transparent)',
        color: 'var(--primary)',
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        letterSpacing: '0.04em',
      }}
    >
      {label}
    </span>
  );
}

interface CompletenessCardProps {
  signals: CompletenessSignal[];
}

function CompletenessCard({ signals }: CompletenessCardProps): ReactElement {
  const done = signals.filter((s) => s.done).length;
  const total = signals.length;
  const pct = Math.round((done / total) * 100);
  const missing = signals.filter((s) => !s.done).slice(0, 3);
  return (
    <div
      style={{
        padding: 20,
        border: '1px solid var(--border)',
        borderRadius: 12,
        background: 'var(--card)',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <p
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 600,
            fontSize: 15,
            margin: 0,
          }}
        >
          Complete your profile
        </p>
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            color: 'var(--muted-foreground)',
            margin: 0,
          }}
        >
          {done} of {total}
        </p>
      </div>
      <div
        style={{
          height: 6,
          background: 'var(--muted)',
          borderRadius: 999,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: 'var(--primary)',
            transition: 'width 200ms ease',
          }}
        />
      </div>
      <p style={{ fontSize: 13, color: 'var(--muted-foreground)', margin: 0 }}>
        Missing: {missing.map((s) => s.label).join(', ')}
        {signals.filter((s) => !s.done).length > 3 && ', …'}
      </p>
      <a
        className="btn btn-sm btn-primary"
        href="/me/profile"
        style={{ alignSelf: 'flex-start', textDecoration: 'none' }}
      >
        Continue →
      </a>
    </div>
  );
}

interface NextEventHeroProps {
  entry: MineEntry;
}

function NextEventHero({ entry }: NextEventHeroProps): ReactElement {
  const startsAt = new Date(entry.event.startsAt);
  const checkinUrl = `${window.location.origin}/checkin?code=${entry.checkinCode}`;
  return (
    <div
      style={{
        padding: 24,
        border: '1px solid var(--border)',
        borderRadius: 14,
        background:
          'linear-gradient(135deg, color-mix(in oklch, var(--primary) 14%, var(--card)) 0%, var(--card) 60%)',
        display: 'grid',
        gridTemplateColumns: '1fr 130px',
        gap: 24,
        alignItems: 'center',
      }}
    >
      <div>
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--primary)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            margin: '0 0 6px',
          }}
        >
          Next up · {relativeDay(startsAt)}
        </p>
        <a
          href={`/events/${entry.event.id}`}
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 600,
            fontSize: 24,
            letterSpacing: '-0.02em',
            color: 'inherit',
            textDecoration: 'none',
            display: 'block',
            marginBottom: 6,
          }}
        >
          {entry.event.title}
        </a>
        <p style={{ fontSize: 14, color: 'var(--muted-foreground)', margin: 0 }}>
          {dateFmt.format(startsAt)}
          {entry.event.location && ` · ${entry.event.location}`}
        </p>
      </div>
      <div style={{ textAlign: 'center' }}>
        <div
          style={{
            padding: 6,
            background: 'white',
            borderRadius: 8,
            display: 'inline-block',
          }}
        >
          <QRCodeSVG value={checkinUrl} size={110} />
        </div>
        <p
          style={{
            marginTop: 6,
            fontSize: 10,
            color: 'var(--muted-foreground)',
            fontFamily: 'var(--font-mono)',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}
        >
          Show at the door
        </p>
      </div>
    </div>
  );
}

function Dashboard({ session, suggestedEvents }: DashboardProps): ReactElement {
  const upcoming = session.registrations
    .filter((r) => r.status === 'registered' && new Date(r.event.startsAt) > new Date())
    .sort((a, b) => new Date(a.event.startsAt).getTime() - new Date(b.event.startsAt).getTime());
  const attended = session.registrations.filter((r) => r.status === 'attended');
  const waitlisted = session.registrations.filter((r) => r.status === 'waitlisted');
  const active = [...upcoming, ...waitlisted, ...attended].sort(
    (a, b) => new Date(b.event.startsAt).getTime() - new Date(a.event.startsAt).getTime(),
  );

  const nextEvent = upcoming[0] ?? null;
  const role = roleLabel(session.me.groups ?? []);
  const signals = completenessSignals(session.profile, session.skillCount);
  const completenessDone = signals.every((s) => s.done);

  // Filter out events the member is already registered/waitlisted for so
  // suggestions never duplicate what's already on the page.
  const registeredIds = new Set(session.registrations.map((r) => r.event.id));
  const suggestions = suggestedEvents.filter((e) => !registeredIds.has(e.id)).slice(0, 3);
  const hasNoActiveRegs = active.length === 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Avatar text={initials(session.me, session.profile)} />
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                flexWrap: 'wrap',
                marginBottom: 4,
              }}
            >
              <h1
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 600,
                  fontSize: 32,
                  letterSpacing: '-0.025em',
                  margin: 0,
                }}
              >
                {displayName(session.me, session.profile)}
              </h1>
              {role && <RoleChip label={role} />}
            </div>
            <p
              style={{
                fontSize: 13,
                color: 'var(--muted-foreground)',
                fontFamily: 'var(--font-mono)',
                margin: 0,
              }}
            >
              {session.me.email}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <a
            className="btn btn-outline btn-sm"
            href="/me/profile"
            style={{ textDecoration: 'none' }}
          >
            Edit profile
          </a>
          <a
            className="btn btn-outline btn-sm"
            href="/me/preferences"
            style={{ textDecoration: 'none' }}
          >
            Preferences
          </a>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </header>

      {!completenessDone && <CompletenessCard signals={signals} />}

      {nextEvent && <NextEventHero entry={nextEvent} />}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        <StatCard label="Upcoming" value={upcoming.length} />
        <StatCard label="Attended" value={attended.length} />
        <StatCard label="On waitlist" value={waitlisted.length} />
        <StatCard label="Points" value="—" hint="See the leaderboard" />
      </div>

      <ActivityHeatmap attended={attended} />

      <section>
        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 600,
            fontSize: 22,
            letterSpacing: '-0.015em',
            margin: '0 0 16px',
          }}
        >
          Your registrations
        </h2>
        {hasNoActiveRegs ? (
          <div
            style={{
              padding: '32px 24px',
              border: '1px dashed var(--border)',
              borderRadius: 12,
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              alignItems: 'center',
            }}
          >
            <p
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 600,
                fontSize: 17,
                margin: 0,
              }}
            >
              You haven't registered for anything yet
            </p>
            <p
              style={{
                fontSize: 14,
                color: 'var(--muted-foreground)',
                margin: 0,
                maxWidth: 460,
              }}
            >
              Pick an event below to meet other AI engineers in your city. Most are free, and your
              first one earns you a starter badge.
            </p>
          </div>
        ) : (
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            {active.map((entry) => (
              <RegistrationRow key={entry.id} entry={entry} />
            ))}
          </ul>
        )}
      </section>

      {suggestions.length > 0 && (
        <section>
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 600,
              fontSize: 22,
              letterSpacing: '-0.015em',
              margin: '0 0 16px',
            }}
          >
            {hasNoActiveRegs ? 'Start here' : 'More events for you'}
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: 12,
            }}
          >
            {suggestions.map((event) => (
              <SuggestedEventCard key={event.id} event={event} />
            ))}
          </div>
        </section>
      )}

      <section>
        <h2
          style={{
            fontFamily: 'var(--font-mono)',
            fontWeight: 500,
            fontSize: 11,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--muted-foreground)',
            margin: '0 0 10px',
          }}
        >
          Quick actions
        </h2>
        <QuickActions isStudent={session.profile?.is_student ?? false} />
      </section>
    </div>
  );
}

interface MeDashboardProps {
  suggestedEvents?: SuggestedEvent[];
}

export function MeDashboard({ suggestedEvents = [] }: MeDashboardProps): ReactElement {
  const [state, setState] = useState<State>({ phase: 'loading' });

  useEffect(() => {
    let cancelled = false;
    bootstrap()
      .catch(
        (err: unknown): State => ({
          phase: 'error',
          message: err instanceof Error ? err.message : 'bootstrap failed',
        }),
      )
      .then((next) => {
        if (!cancelled) setState(next);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.phase === 'loading') {
    return <p style={{ color: 'var(--muted-foreground)' }}>Loading…</p>;
  }
  if (state.phase === 'error') {
    return <p style={{ color: 'var(--destructive, #c00)' }}>{state.message}</p>;
  }
  if (state.phase === 'anon') return <AnonView />;
  return <Dashboard session={state.session} suggestedEvents={suggestedEvents} />;
}
