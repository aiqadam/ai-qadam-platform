// UTM scheme runtime per docs/marketing-utm-scheme.md.
//
// Two responsibilities:
//   1. Canonical lists of allowed `utm_medium` values + suggested
//      `utm_source` patterns. Single source of truth — the URL builder
//      UI imports from here so the convention stays in sync with the doc.
//   2. Pure validation + URL composition. Operators paste a destination
//      URL and four field values; `buildUtmUrl` returns the canonical
//      tagged URL or a structured error.
//
// Strict rules (doc §3):
//   - lowercase, hyphenated
//   - utm_medium uses fixed strings from the table (underscores allowed)
//   - utm_content allows underscores too (for A/B variant codes)
//   - allowed chars: a-z 0-9 - _
//   - no leading/trailing hyphen, no consecutive hyphens
//   - max 64 chars per value

export const UTM_MEDIUMS = [
  'linkedin_post',
  'linkedin_message',
  'telegram_channel',
  'telegram_group',
  'email_digest',
  'email_transactional',
  'referral',
  'sponsor_post',
  'speaker_post',
  'paid_li',
  'paid_meta',
  'paid_telegram',
  'aggregator',
] as const;

export type UtmMedium = (typeof UTM_MEDIUMS)[number];

// Documentation strings keyed to UTM_MEDIUMS — used by the builder UI to
// help operators pick the right value without consulting the doc each
// time. Matches docs/marketing-utm-scheme.md §5.2.
export const UTM_MEDIUM_LABELS: Record<UtmMedium, string> = {
  linkedin_post: 'Organic LinkedIn post or comment',
  linkedin_message: 'LinkedIn DM (1:1 or small-group)',
  telegram_channel: 'Telegram broadcast channel post',
  telegram_group: 'Telegram group / chat message',
  email_digest: 'Newsletter / digest email',
  email_transactional: 'Operational email with marketing payload',
  referral: 'Member-to-member share via referral code',
  sponsor_post: 'Co-promotion from a sponsor account',
  speaker_post: 'Co-promotion from a speaker account',
  paid_li: 'Paid LinkedIn placement',
  paid_meta: 'Paid Meta / Instagram placement',
  paid_telegram: 'Paid Telegram ad',
  aggregator: 'Lu.ma, Eventbrite, or other event-listing mirrors',
};

// Suggested utm_source values — patterns operators pick from before
// typing. The builder uses these as a `<datalist>` (autocomplete) so
// "binali-li" is one keystroke away. Full canonical list lives in the
// doc; the operator can also free-type a value that matches the
// validation rules (e.g. a new sponsor-{slug}).
export const UTM_SOURCE_SUGGESTIONS = [
  'binali-li',
  'viktor-li',
  'aiqadam-orgli',
  'aiqadam-tg-uz',
  'aiqadam-tg-kz',
  'aiqadam-tg-tj',
  'aiqadam-tg-global',
  'newsletter',
  // Patterns (operator replaces the {…} placeholder):
  'speaker-{handle}',
  'sponsor-{slug}',
  'partner-{slug}',
  'inf-{handle}',
  'member-{handle}',
];

// Same idea for campaigns (doc §5.3 patterns).
export const UTM_CAMPAIGN_SUGGESTIONS = [
  'event-{N}',
  'quarterly-digest-q{1-4}-{YY}',
  'country-launch-{cc}',
  'sponsor-recruitment-q{1-4}-{YY}',
  'speaker-recruitment-q{1-4}-{YY}',
  'evergreen',
];

const MAX_LEN = 64;
const ALLOWED = /^[a-z0-9_-]+$/;

export type FieldName = 'source' | 'medium' | 'campaign' | 'content';

// Each rule checks one invariant from §3 and returns a message when it
// fails. Order matters: cheaper / more specific checks come first so the
// operator sees the most actionable message.
type Rule = (name: FieldName, value: string) => string | null;

const RULES: Rule[] = [
  (name, v) => (v.length > MAX_LEN ? `${name} is longer than ${MAX_LEN} characters` : null),
  (name, v) => (v.trim() !== v ? `${name} has leading or trailing whitespace` : null),
  (name, v) => (v !== v.toLowerCase() ? `${name} must be lowercase` : null),
  (name, v) =>
    v.includes('{') || v.includes('}')
      ? `${name} still contains a {placeholder} — replace it with the real value`
      : null,
  (name, v) =>
    ALLOWED.test(v) ? null : `${name} can only contain a–z, 0–9, hyphens, and underscores`,
  (name, v) =>
    v.startsWith('-') || v.endsWith('-') ? `${name} cannot start or end with a hyphen` : null,
  (name, v) => (v.includes('--') ? `${name} cannot contain consecutive hyphens` : null),
  (name, v) =>
    name === 'medium' && !UTM_MEDIUMS.includes(v as UtmMedium)
      ? 'medium must be one of the canonical values (see the doc — §5.2)'
      : null,
];

// Validate one field value against the strict rules in §3. `medium` is
// special-cased: it must be one of the canonical UTM_MEDIUMS literals,
// nothing else. `content` allows underscores in addition to hyphens;
// `source` and `campaign` allow underscores in the regex too, since the
// allowed-character set is identical — the human-facing convention to
// prefer hyphens is enforced by the suggestions UI, not the validator.
// Placeholder text containing `{…}` is rejected so operators don't paste
// the pattern verbatim.
export function validateUtmField(name: FieldName, value: string): string | null {
  if (value.trim().length === 0) {
    return name === 'content' ? null : `${name} is required`;
  }
  for (const rule of RULES) {
    const err = rule(name, value);
    if (err) return err;
  }
  return null;
}

export interface BuildInput {
  destinationUrl: string;
  source: string;
  medium: string;
  campaign: string;
  content?: string;
}

export interface BuildResult {
  ok: true;
  url: string;
}

export interface BuildError {
  ok: false;
  fieldErrors: Partial<Record<'destinationUrl' | FieldName, string>>;
}

// Parse the destination URL strictly. Reject obvious bad input early so
// the operator sees a useful message instead of a TypeError. Empty
// destination is the most common operator mistake — call it out by name.
function parseDestination(value: string): { ok: true; url: URL } | { ok: false; error: string } {
  const trimmed = value.trim();
  if (trimmed.length === 0) return { ok: false, error: 'destination URL is required' };
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      ok: false,
      error: 'destination URL is not a valid URL — start it with https://',
    };
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { ok: false, error: 'destination URL must use http:// or https://' };
  }
  return { ok: true, url: parsed };
}

function collectFieldErrors(input: BuildInput): BuildError['fieldErrors'] {
  const errors: BuildError['fieldErrors'] = {};
  const dest = parseDestination(input.destinationUrl);
  if (!dest.ok) errors.destinationUrl = dest.error;
  for (const field of ['source', 'medium', 'campaign'] as const) {
    const err = validateUtmField(field, input[field]);
    if (err) errors[field] = err;
  }
  if (input.content !== undefined && input.content.length > 0) {
    const err = validateUtmField('content', input.content);
    if (err) errors.content = err;
  }
  return errors;
}

// Compose the final URL. UTM params replace any existing utm_* values on
// the destination URL (so an operator can paste a previously-tagged URL
// and re-tag it cleanly). Non-utm query params survive.
export function buildUtmUrl(input: BuildInput): BuildResult | BuildError {
  const fieldErrors = collectFieldErrors(input);
  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };

  // parseDestination ran inside collectFieldErrors and reported any
  // error — at this point it must succeed. Run it once more to get the
  // URL handle (cheaper than threading the result out).
  const dest = parseDestination(input.destinationUrl);
  if (!dest.ok) return { ok: false, fieldErrors: { destinationUrl: dest.error } };
  const url = dest.url;
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content']) {
    url.searchParams.delete(key);
  }
  url.searchParams.set('utm_source', input.source.trim());
  url.searchParams.set('utm_medium', input.medium.trim());
  url.searchParams.set('utm_campaign', input.campaign.trim());
  if (input.content !== undefined && input.content.trim().length > 0) {
    url.searchParams.set('utm_content', input.content.trim());
  }
  return { ok: true, url: url.toString() };
}
