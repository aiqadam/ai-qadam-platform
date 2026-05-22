// F-S1.5 + F-S1.5b — shared match algorithm.
//
// Both EventMatchesService (T-7 broadcast) and EventMatchesPostRegService
// (T+3 per-registration) score the same way. Extracted here so the
// scoring weights stay consistent between the two windows.
//
// Score = (overlapping interest tags) * TAG_WEIGHT
//       + (same job_title)            * JOB_TITLE_WEIGHT
//
// Job-title match is currently exact-string after lowercase + trim. A
// future taxonomy (per F-S1.5b spec) would map "ML engineer" /
// "Machine Learning Engineer" / "MLE" to the same bucket; until then,
// exact match is conservative — better to miss a fuzzy match than to
// pair "Founder" with "Co-Founder" and confuse the recipient.

export interface AttendeeForMatch {
  user: {
    id: string;
    first_name: string | null;
    last_name?: string | null;
    job_title: string | null;
    appear_in_matches?: boolean;
  };
}

export interface MatchCandidate {
  userId: string;
  firstName: string | null;
  jobTitle: string | null;
  sharedTags: string[];
  jobTitleMatch: boolean;
}

// Scoring weights. Two shared interest tags > one tag + same job title >
// just job title > just one tag. Tuned to surface tag-overlap as the
// stronger signal (it's self-declared per topic) while job-title gives
// a useful nudge ("you're both ML engineers — go talk shop").
const TAG_WEIGHT = 2;
const JOB_TITLE_WEIGHT = 1;

export function rankCandidates(
  others: AttendeeForMatch[],
  interestsByMember: Map<string, Set<string>>,
  myTags: Set<string>,
  myJobTitle: string | null,
): MatchCandidate[] {
  const myJobKey = normalizeJobTitle(myJobTitle);
  const scored = others.map((other) => {
    const tags = interestsByMember.get(other.user.id) ?? new Set<string>();
    const shared = [...tags].filter((t) => myTags.has(t));
    const jobMatch = myJobKey !== null && normalizeJobTitle(other.user.job_title) === myJobKey;
    const score = shared.length * TAG_WEIGHT + (jobMatch ? JOB_TITLE_WEIGHT : 0);
    return { row: other, shared, jobMatch, score };
  });
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Tie-break by name for determinism (so test fixtures are predictable
    // and a re-tick of the same data picks the same names).
    const an = a.row.user.first_name ?? '';
    const bn = b.row.user.first_name ?? '';
    return an.localeCompare(bn);
  });
  return scored.map(({ row, shared, jobMatch }) => ({
    userId: row.user.id,
    firstName: row.user.first_name,
    jobTitle: row.user.job_title,
    sharedTags: shared,
    jobTitleMatch: jobMatch,
  }));
}

function normalizeJobTitle(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
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
