// F-S1.5 + F-S1.5b + F-S1.5b ext — shared match algorithm.
//
// Both EventMatchesService (T-7 broadcast) and EventMatchesPostRegService
// (T+3 per-registration) score the same way. Extracted here so the
// scoring weights stay consistent between the two windows.
//
// Score (F-S1.5b ext)
//   + TAG_WEIGHT per shared interest tag
//   + CANONICAL_TITLE_WEIGHT if both members picked the same canonical
//     job-title bucket (e.g. both `ml_engineer`) — strong signal
//   + JOB_TITLE_WEIGHT if the canonical field is unset on either side
//     and their raw free-text job titles are exact-string equal
//     (lowercase + trim) — weaker fallback signal
//   × CONNECTION_PENALTY (< 1) when the pair has an existing
//     member_connections row (recipient already met this person; we
//     demote rather than drop so they can still surface when the rest
//     of the audience is thin)
//
// Job-title taxonomy: the canonical field is preferred because it
// catches cases like "ML engineer" / "Machine Learning Engineer" / "MLE"
// where exact-string match misses. The raw-title fallback is conservative
// — better to miss a fuzzy match than to pair "Founder" with "Co-Founder"
// and confuse the recipient.

export interface AttendeeForMatch {
  user: {
    id: string;
    first_name: string | null;
    last_name?: string | null;
    job_title: string | null;
    job_title_canonical?: string | null;
    appear_in_matches?: boolean;
  };
}

export type JobTitleMatchKind = 'none' | 'raw' | 'canonical';

export interface MatchCandidate {
  userId: string;
  firstName: string | null;
  jobTitle: string | null;
  sharedTags: string[];
  jobTitleMatch: boolean; // back-compat: true for raw OR canonical match
  jobTitleMatchKind: JobTitleMatchKind;
  alreadyConnected: boolean;
}

// Scoring weights. Two shared interest tags ≈ one canonical-title match.
// Raw-title match is weaker (half a tag) because false positives are
// possible. Pre-existing connection demotes by half so a fresh pair
// surfaces ahead of a previously-met one, but the latter can still
// appear when audience is thin.
const TAG_WEIGHT = 2;
const CANONICAL_TITLE_WEIGHT = 2;
const JOB_TITLE_WEIGHT = 1;
const CONNECTION_PENALTY = 0.5;

export interface RankingContext {
  myJobTitle: string | null;
  myJobTitleCanonical: string | null;
  // F-S1.5b ext — set of OTHER user IDs the recipient has an existing
  // member_connections row with. Caller assembles the set once per tick.
  alreadyConnected: Set<string>;
}

export function rankCandidates(
  others: AttendeeForMatch[],
  interestsByMember: Map<string, Set<string>>,
  myTags: Set<string>,
  ctx: RankingContext,
): MatchCandidate[] {
  const myRawKey = normalizeJobTitle(ctx.myJobTitle);
  const myCanonicalKey = normalizeCanonical(ctx.myJobTitleCanonical);
  const scored = others.map((other) => {
    const tags = interestsByMember.get(other.user.id) ?? new Set<string>();
    const shared = [...tags].filter((t) => myTags.has(t));
    const titleKind = matchJobTitleKind(
      myRawKey,
      myCanonicalKey,
      normalizeJobTitle(other.user.job_title),
      normalizeCanonical(other.user.job_title_canonical ?? null),
    );
    const titleScore =
      titleKind === 'canonical'
        ? CANONICAL_TITLE_WEIGHT
        : titleKind === 'raw'
          ? JOB_TITLE_WEIGHT
          : 0;
    const alreadyConnected = ctx.alreadyConnected.has(other.user.id);
    let score = shared.length * TAG_WEIGHT + titleScore;
    if (alreadyConnected) score *= CONNECTION_PENALTY;
    return { row: other, shared, titleKind, alreadyConnected, score };
  });
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const an = a.row.user.first_name ?? '';
    const bn = b.row.user.first_name ?? '';
    return an.localeCompare(bn);
  });
  return scored.map(({ row, shared, titleKind, alreadyConnected }) => ({
    userId: row.user.id,
    firstName: row.user.first_name,
    jobTitle: row.user.job_title,
    sharedTags: shared,
    jobTitleMatch: titleKind !== 'none',
    jobTitleMatchKind: titleKind,
    alreadyConnected,
  }));
}

function matchJobTitleKind(
  myRaw: string | null,
  myCanonical: string | null,
  otherRaw: string | null,
  otherCanonical: string | null,
): JobTitleMatchKind {
  if (myCanonical && otherCanonical && myCanonical === otherCanonical) return 'canonical';
  if (myRaw && otherRaw && myRaw === otherRaw) return 'raw';
  return 'none';
}

function normalizeJobTitle(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeCanonical(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  // Empty + 'other' both behave as "unset" — `other` carries no signal.
  if (trimmed.length === 0 || trimmed === 'other') return null;
  return trimmed;
}

export interface MatchPlan {
  recipientId: string;
  eventTitle: string;
  eventStartsAt: string;
  matches: MatchCandidate[];
}

export function buildMatchPayload(plan: MatchPlan): Record<string, unknown> {
  const dateShort = new Date(plan.eventStartsAt).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const lines = plan.matches.map((m) => {
    const name = m.firstName ?? 'A fellow attendee';
    const role = m.jobTitle ? ` (${m.jobTitle})` : '';
    const sharedBits: string[] = [];
    if (m.sharedTags.length > 0) {
      sharedBits.push(`shared interests: ${m.sharedTags.slice(0, 3).join(', ')}`);
    }
    if (m.jobTitleMatch) sharedBits.push('same job title');
    const shared = sharedBits.length > 0 ? ` — ${sharedBits.join('; ')}` : '';
    return `• ${name}${role}${shared}`;
  });
  const intro = `${plan.eventTitle} is on ${dateShort}. ${plan.matches.length === 1 ? 'One' : `${plan.matches.length}`} registered attendee${plan.matches.length === 1 ? '' : 's'} you might want to find:`;
  const outro =
    'Introduce yourself in the room — or in the Telegram group if you have it. We picked these based on overlapping interest tags + job title from your profile.';
  const optOut = 'Want out of these match emails? Toggle "Appear in matches" off in /me/profile.';
  return {
    subject: `${plan.matches.length} people at ${plan.eventTitle} you might want to meet`,
    text: `${intro}\n\n${lines.join('\n')}\n\n${outro}\n\n— AI Qadam\n\n${optOut}`,
  };
}
