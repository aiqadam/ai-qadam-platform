import { type FormEvent, type ReactElement, useEffect, useState } from 'react';
import { getAuthState } from '../lib/auth-bootstrap';

// F-S3.6 — /me/profile island.
//
// Mirrors PreferencesForm bootstrap (refresh → anon CTA, refresh → load
// + render). Three sections:
//   - Profile core (job_title, seniority, industry_tags, is_student,
//     bio_md, appear_in_directory)
//   - Per-purpose consents (the 7 purposes from ADR-0033 Part 1)
//   - Skills (add/remove tag rows)
//
// Out of scope for v1: interests, employments, employer FK.

const SENIORITY_OPTIONS: Array<[string, string]> = [
  ['', 'Not specified'],
  ['ic', 'Individual contributor'],
  ['senior', 'Senior IC'],
  ['lead', 'Lead / staff'],
  ['manager', 'Manager'],
  ['director', 'Director'],
  ['vp', 'VP'],
  ['c_level', 'C-level / founder'],
];

const CONSENT_PURPOSES = [
  'events',
  'marketing',
  'research',
  'recruiting',
  'sponsor_share',
  'content',
  'paid_premium',
] as const;
type Purpose = (typeof CONSENT_PURPOSES)[number];

const PURPOSE_LABELS: Record<Purpose, { title: string; description: string }> = {
  events: {
    title: 'Events',
    description: 'Invites + reminders for events in your country. Off = no event mail.',
  },
  marketing: {
    title: 'Marketing',
    description: 'Newsletter + announcements about the AI Qadam platform.',
  },
  research: {
    title: 'Research',
    description: 'Surveys + interviews. We may ask for ~5 min of your time, ~quarterly.',
  },
  recruiting: {
    title: 'Recruiting',
    description:
      'When employer-partners post relevant openings, opt in to be on their candidate feed.',
  },
  sponsor_share: {
    title: 'Sponsor share (aggregated)',
    description: 'Sponsors see aggregated cohort metrics including yours. Never raw personal data.',
  },
  content: {
    title: 'Content',
    description: 'Paid premium content + member-only deep dives when they launch.',
  },
  paid_premium: {
    title: 'Paid premium',
    description: 'Paid offerings (cohort courses, workshops) we may bring to members later.',
  },
};

interface Profile {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  job_title: string | null;
  seniority: string | null;
  industry_tags: string[];
  is_student: boolean;
  bio_md: string | null;
  appear_in_directory: boolean;
  appear_in_matches: boolean;
  appear_on_attendee_list: boolean;
  appear_on_public_leaderboard: boolean;
  show_company_on_public_profile: boolean;
}

interface ConsentSummary {
  purpose: Purpose;
  granted: boolean;
  lastChangedAt: string | null;
}

interface Skill {
  id: string;
  skill_tag: string;
  endorsement_count: number;
  verified_by_event: string | null;
}

const INTEREST_INTENTS = ['learn', 'practice', 'mentor', 'discuss'] as const;
type InterestIntent = (typeof INTEREST_INTENTS)[number];

interface Interest {
  id: string;
  topic_tag: string;
  intent: InterestIntent;
}

interface Employment {
  id: string;
  employer: { id: string; name: string; slug: string };
  role: string | null;
  started_at: string | null;
  ended_at: string | null;
  is_current: boolean;
  share_with_sponsors: boolean;
}

type State =
  | { phase: 'loading' }
  | { phase: 'anon' }
  | {
      phase: 'authed';
      accessToken: string;
      profile: Profile;
      consents: Record<Purpose, ConsentSummary>;
      skills: Skill[];
      interests: Interest[];
      employments: Employment[];
    }
  | { phase: 'error'; message: string };

async function bootstrap(): Promise<State> {
  const auth = await getAuthState();
  if (!auth) return { phase: 'anon' };
  const { accessToken } = auth;

  const res = await fetch('/api/v1/me/profile', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return { phase: 'anon' };
  const { profile, consents, skills, interests, employments } = (await res.json()) as {
    profile: Profile;
    consents: ConsentSummary[];
    skills: Skill[];
    interests: Interest[];
    employments: Employment[];
  };
  const byPurpose = consents.reduce(
    (acc, c) => {
      acc[c.purpose] = c;
      return acc;
    },
    {} as Record<Purpose, ConsentSummary>,
  );
  return {
    phase: 'authed',
    accessToken,
    profile,
    consents: byPurpose,
    skills,
    interests: interests ?? [],
    employments: employments ?? [],
  };
}

async function patchProfile(accessToken: string, patch: Partial<Profile>): Promise<Profile> {
  const res = await fetch('/api/v1/me/profile', {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`patch profile failed: ${res.status}`);
  const { profile } = (await res.json()) as { profile: Profile };
  return profile;
}

async function patchConsent(
  accessToken: string,
  purpose: Purpose,
  granted: boolean,
): Promise<ConsentSummary> {
  const res = await fetch('/api/v1/me/profile/consents', {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ purpose, granted }),
  });
  if (!res.ok) throw new Error(`patch consent failed: ${res.status}`);
  const { consent } = (await res.json()) as { consent: ConsentSummary };
  return consent;
}

async function addSkill(accessToken: string, skill_tag: string): Promise<Skill> {
  const res = await fetch('/api/v1/me/profile/skills', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ skill_tag }),
  });
  if (!res.ok) throw new Error(`add skill failed: ${res.status}`);
  const { skill } = (await res.json()) as { skill: Skill };
  return skill;
}

async function removeSkill(accessToken: string, id: string): Promise<void> {
  const res = await fetch(`/api/v1/me/profile/skills/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`remove skill failed: ${res.status}`);
}

async function addInterest(
  accessToken: string,
  topic_tag: string,
  intent: InterestIntent,
): Promise<Interest> {
  const res = await fetch('/api/v1/me/profile/interests', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ topic_tag, intent }),
  });
  if (!res.ok) throw new Error(`add interest failed: ${res.status}`);
  const { interest } = (await res.json()) as { interest: Interest };
  return interest;
}

async function removeInterest(accessToken: string, id: string): Promise<void> {
  const res = await fetch(`/api/v1/me/profile/interests/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`remove interest failed: ${res.status}`);
}

interface AddEmploymentInput {
  employer_name: string;
  role: string;
  started_at: string;
  ended_at: string;
  is_current: boolean;
  share_with_sponsors: boolean;
}

interface EmploymentPostBody {
  employer_name: string;
  is_current: boolean;
  share_with_sponsors: boolean;
  role?: string;
  started_at?: string;
  ended_at?: string;
}

async function addEmployment(accessToken: string, input: AddEmploymentInput): Promise<Employment> {
  const body: EmploymentPostBody = {
    employer_name: input.employer_name,
    is_current: input.is_current,
    share_with_sponsors: input.share_with_sponsors,
    ...(input.role.trim() ? { role: input.role.trim() } : {}),
    ...(input.started_at ? { started_at: input.started_at } : {}),
    ...(input.ended_at ? { ended_at: input.ended_at } : {}),
  };
  const res = await fetch('/api/v1/me/profile/employments', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`add employment failed: ${res.status}`);
  const { employment } = (await res.json()) as { employment: Employment };
  return employment;
}

async function removeEmployment(accessToken: string, id: string): Promise<void> {
  const res = await fetch(`/api/v1/me/profile/employments/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`remove employment failed: ${res.status}`);
}

function nextHere(): string {
  return `${window.location.pathname}${window.location.search}`;
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
        Sign in to manage your profile
      </h2>
      <p style={{ fontSize: 14, color: 'var(--muted-foreground)', margin: '0 0 20px' }}>
        Profile fields, per-purpose consents, and skills. All member-controlled; change any time.
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

function Card({ children, title }: { children: React.ReactNode; title: string }): ReactElement {
  return (
    <section
      style={{
        padding: 32,
        border: '1px solid var(--border)',
        borderRadius: 12,
        background: 'var(--card)',
        marginBottom: 24,
      }}
    >
      <h2
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 600,
          fontSize: 22,
          margin: '0 0 16px',
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

interface ProfileEditorProps {
  profile: Profile;
  accessToken: string;
  onSaved: (next: Profile) => void;
}

function ProfileEditor({ profile, accessToken, onSaved }: ProfileEditorProps): ReactElement {
  const [jobTitle, setJobTitle] = useState(profile.job_title ?? '');
  const [seniority, setSeniority] = useState(profile.seniority ?? '');
  const [industryTags, setIndustryTags] = useState((profile.industry_tags ?? []).join(', '));
  const [isStudent, setIsStudent] = useState(profile.is_student);
  const [bioMd, setBioMd] = useState(profile.bio_md ?? '');
  const [appearInDirectory, setAppearInDirectory] = useState(profile.appear_in_directory);
  const [appearInMatches, setAppearInMatches] = useState(profile.appear_in_matches);
  const [appearOnAttendeeList, setAppearOnAttendeeList] = useState(profile.appear_on_attendee_list);
  const [appearOnPublicLeaderboard, setAppearOnPublicLeaderboard] = useState(
    profile.appear_on_public_leaderboard,
  );
  const [showCompanyOnPublicProfile, setShowCompanyOnPublicProfile] = useState(
    profile.show_company_on_public_profile,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buildPatch = (): Partial<Profile> => ({
    job_title: jobTitle.trim() === '' ? null : jobTitle.trim(),
    seniority: seniority === '' ? null : (seniority as Profile['seniority']),
    industry_tags: industryTags
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0),
    is_student: isStudent,
    bio_md: bioMd.trim() === '' ? null : bioMd,
    appear_in_directory: appearInDirectory,
    appear_in_matches: appearInMatches,
    appear_on_attendee_list: appearOnAttendeeList,
    appear_on_public_leaderboard: appearOnPublicLeaderboard,
    show_company_on_public_profile: showCompanyOnPublicProfile,
  });

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const next = await patchProfile(accessToken, buildPatch());
      onSaved(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 500 }}>Job title</span>
        <input
          type="text"
          value={jobTitle}
          onChange={(e) => setJobTitle(e.target.value)}
          placeholder="e.g. ML Engineer, Founder, PhD Researcher"
          maxLength={160}
          className="input"
        />
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 500 }}>Seniority</span>
        <select value={seniority} onChange={(e) => setSeniority(e.target.value)} className="input">
          {SENIORITY_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 500 }}>Industry tags</span>
        <input
          type="text"
          value={industryTags}
          onChange={(e) => setIndustryTags(e.target.value)}
          placeholder="comma-separated, e.g. fintech, healthtech, edtech"
          className="input"
        />
        <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>
          Used for matching + sponsor cohorts. Up to 20 tags.
        </span>
      </label>
      <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <input
          type="checkbox"
          checked={isStudent}
          onChange={(e) => setIsStudent(e.target.checked)}
        />
        <span style={{ fontSize: 14 }}>I'm a student</span>
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 500 }}>Short bio</span>
        <textarea
          value={bioMd}
          onChange={(e) => setBioMd(e.target.value)}
          rows={4}
          maxLength={8000}
          placeholder="A few sentences about what you work on. Markdown OK."
          className="input"
          style={{ resize: 'vertical', minHeight: 96 }}
        />
      </label>
      <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <input
          type="checkbox"
          checked={appearInDirectory}
          onChange={(e) => setAppearInDirectory(e.target.checked)}
          style={{ marginTop: 3 }}
        />
        <span style={{ fontSize: 14 }}>
          Appear in the member directory
          <br />
          <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>
            Off by default. Sponsors NEVER see this — they see cohort-aggregated metrics only.
          </span>
        </span>
      </label>
      <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <input
          type="checkbox"
          checked={appearInMatches}
          onChange={(e) => setAppearInMatches(e.target.checked)}
          style={{ marginTop: 3 }}
        />
        <span style={{ fontSize: 14 }}>
          Appear in pre-event "people you might want to meet" emails
          <br />
          <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>
            On by default. When off, you neither receive these emails nor get named in someone
            else's. Matched on overlapping interest tags from your profile.
          </span>
        </span>
      </label>
      <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <input
          type="checkbox"
          checked={appearOnAttendeeList}
          onChange={(e) => setAppearOnAttendeeList(e.target.checked)}
          style={{ marginTop: 3 }}
        />
        <span style={{ fontSize: 14 }}>
          Show my name on event attendee lists
          <br />
          <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>
            On by default. Sponsors NEVER see this list — only other registered attendees do.
          </span>
        </span>
      </label>
      <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <input
          type="checkbox"
          checked={appearOnPublicLeaderboard}
          onChange={(e) => setAppearOnPublicLeaderboard(e.target.checked)}
          style={{ marginTop: 3 }}
        />
        <span style={{ fontSize: 14 }}>
          Show my name + points on the public leaderboard
          <br />
          <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>
            On by default. When off, you're excluded from the rendered list. Your rank is still
            counted so other people's ranks stay stable.
          </span>
        </span>
      </label>
      <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <input
          type="checkbox"
          checked={showCompanyOnPublicProfile}
          onChange={(e) => setShowCompanyOnPublicProfile(e.target.checked)}
          style={{ marginTop: 3 }}
        />
        <span style={{ fontSize: 14 }}>
          Show my current employer on my public profile
          <br />
          <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>
            Off by default — privacy-first. Only takes effect when "Appear in the member directory"
            is also on. Per-job "share with sponsors" lives on each employment entry separately.
          </span>
        </span>
      </label>
      {error && (
        <p style={{ color: 'var(--destructive, #c00)', fontSize: 13, margin: 0 }}>{error}</p>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}

interface ConsentsEditorProps {
  consents: Record<Purpose, ConsentSummary>;
  accessToken: string;
  onChange: (next: Record<Purpose, ConsentSummary>) => void;
}

function ConsentsEditor({ consents, accessToken, onChange }: ConsentsEditorProps): ReactElement {
  const [pending, setPending] = useState<Purpose | null>(null);

  const toggle = async (purpose: Purpose, granted: boolean) => {
    setPending(purpose);
    try {
      const updated = await patchConsent(accessToken, purpose, granted);
      onChange({ ...consents, [purpose]: updated });
    } finally {
      setPending(null);
    }
  };

  return (
    <div>
      {CONSENT_PURPOSES.map((purpose) => {
        const label = PURPOSE_LABELS[purpose];
        const consent = consents[purpose];
        return (
          <div
            key={purpose}
            style={{
              display: 'flex',
              gap: 16,
              alignItems: 'flex-start',
              padding: '16px 0',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <div style={{ flex: 1 }}>
              <p
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 600,
                  fontSize: 15,
                  margin: '0 0 4px',
                }}
              >
                {label.title}
              </p>
              <p style={{ fontSize: 13, color: 'var(--muted-foreground)', margin: 0 }}>
                {label.description}
              </p>
            </div>
            <button
              type="button"
              className={consent.granted ? 'btn btn-primary' : 'btn'}
              onClick={() => toggle(purpose, !consent.granted)}
              disabled={pending === purpose}
              aria-pressed={consent.granted}
              style={{ minWidth: 96 }}
            >
              {pending === purpose ? '…' : consent.granted ? 'Granted' : 'Revoked'}
            </button>
          </div>
        );
      })}
    </div>
  );
}

interface SkillsEditorProps {
  skills: Skill[];
  accessToken: string;
  onChange: (next: Skill[]) => void;
}

function SkillsEditor({ skills, accessToken, onChange }: SkillsEditorProps): ReactElement {
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);

  const onAdd = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (draft.trim().length < 2) return;
    setPending(true);
    try {
      const skill = await addSkill(accessToken, draft.trim());
      if (!skills.some((s) => s.id === skill.id)) {
        onChange([...skills, skill]);
      }
      setDraft('');
    } finally {
      setPending(false);
    }
  };

  const onRemove = async (id: string) => {
    setPending(true);
    try {
      await removeSkill(accessToken, id);
      onChange(skills.filter((s) => s.id !== id));
    } finally {
      setPending(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ fontSize: 13, color: 'var(--muted-foreground)', margin: 0 }}>
        Skill tags help country leads route the right invites + match you with relevant events.
        Lowercase, hyphen-separated.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {skills.length === 0 && (
          <span style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>
            No skills added yet. Try <code>llm-finetuning</code>, <code>mlops</code>,{' '}
            <code>computer-vision</code>.
          </span>
        )}
        {skills.map((s) => (
          <span
            key={s.id}
            style={{
              display: 'inline-flex',
              gap: 6,
              alignItems: 'center',
              padding: '4px 10px',
              border: '1px solid var(--border)',
              borderRadius: 999,
              background: 'var(--background)',
              fontSize: 13,
            }}
          >
            {s.skill_tag}
            <button
              type="button"
              onClick={() => onRemove(s.id)}
              disabled={pending}
              aria-label={`Remove ${s.skill_tag}`}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--muted-foreground)',
                fontSize: 14,
                padding: 0,
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <form onSubmit={onAdd} style={{ display: 'flex', gap: 8 }}>
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="add a skill tag"
          maxLength={80}
          className="input"
          style={{ flex: 1 }}
        />
        <button type="submit" className="btn" disabled={pending || draft.trim().length < 2}>
          Add
        </button>
      </form>
    </div>
  );
}

interface InterestsEditorProps {
  interests: Interest[];
  accessToken: string;
  onChange: (next: Interest[]) => void;
}

function InterestsEditor({ interests, accessToken, onChange }: InterestsEditorProps): ReactElement {
  const [topic, setTopic] = useState('');
  const [intent, setIntent] = useState<InterestIntent>('learn');
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onAdd = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (topic.trim().length < 2) return;
    setPending(true);
    setErr(null);
    try {
      const next = await addInterest(accessToken, topic, intent);
      const exists = interests.find((i) => i.id === next.id);
      onChange(exists ? interests : [...interests, next]);
      setTopic('');
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'add failed');
    } finally {
      setPending(false);
    }
  };

  const onRemove = async (id: string): Promise<void> => {
    setErr(null);
    try {
      await removeInterest(accessToken, id);
      onChange(interests.filter((i) => i.id !== id));
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'remove failed');
    }
  };

  return (
    <div>
      <p style={{ fontSize: 13, color: 'var(--muted-foreground)', margin: '0 0 12px' }}>
        Topics you care about + how you want to engage. Powers member-matching + targeted invites.
      </p>
      {interests.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          {interests.map((i) => (
            <span
              key={i.id}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 8px 4px 10px',
                borderRadius: 14,
                background: 'var(--card)',
                border: '1px solid var(--border)',
                fontSize: 12,
              }}
            >
              <span style={{ fontFamily: 'var(--font-mono)' }}>{i.topic_tag}</span>
              <span
                style={{
                  color: 'var(--muted-foreground)',
                  fontSize: 10,
                  textTransform: 'uppercase',
                }}
              >
                {i.intent}
              </span>
              <button
                type="button"
                onClick={() => void onRemove(i.id)}
                aria-label={`Remove ${i.topic_tag}`}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--muted-foreground)',
                  cursor: 'pointer',
                  fontSize: 14,
                  padding: '0 2px',
                }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <form onSubmit={(e) => void onAdd(e)} style={{ display: 'flex', gap: 8 }}>
        <input
          type="text"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="topic-tag e.g. computer-vision"
          maxLength={80}
          disabled={pending}
          style={{
            flex: 1,
            padding: '6px 10px',
            border: '1px solid var(--border)',
            borderRadius: 6,
            background: 'var(--background)',
            color: 'var(--foreground)',
            fontSize: 14,
          }}
        />
        <select
          value={intent}
          onChange={(e) => setIntent(e.target.value as InterestIntent)}
          disabled={pending}
          style={{
            padding: '6px 10px',
            border: '1px solid var(--border)',
            borderRadius: 6,
            background: 'var(--background)',
            color: 'var(--foreground)',
            fontSize: 14,
          }}
        >
          {INTEREST_INTENTS.map((it) => (
            <option key={it} value={it}>
              {it}
            </option>
          ))}
        </select>
        <button type="submit" className="btn" disabled={pending || topic.trim().length < 2}>
          Add
        </button>
      </form>
      {err && (
        <p style={{ fontSize: 12, color: 'var(--destructive, #c00)', margin: '8px 0 0' }}>{err}</p>
      )}
    </div>
  );
}

interface EmploymentsEditorProps {
  employments: Employment[];
  accessToken: string;
  onChange: (next: Employment[]) => void;
}

function EmploymentsEditor({
  employments,
  accessToken,
  onChange,
}: EmploymentsEditorProps): ReactElement {
  const [draft, setDraft] = useState<AddEmploymentInput>({
    employer_name: '',
    role: '',
    started_at: '',
    ended_at: '',
    is_current: false,
    share_with_sponsors: false,
  });
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onAdd = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (draft.employer_name.trim().length < 1) return;
    setPending(true);
    setErr(null);
    try {
      const next = await addEmployment(accessToken, draft);
      onChange([next, ...employments]);
      setDraft({
        employer_name: '',
        role: '',
        started_at: '',
        ended_at: '',
        is_current: false,
        share_with_sponsors: false,
      });
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'add failed');
    } finally {
      setPending(false);
    }
  };

  const onRemove = async (id: string): Promise<void> => {
    setErr(null);
    try {
      await removeEmployment(accessToken, id);
      onChange(employments.filter((emp) => emp.id !== id));
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'remove failed');
    }
  };

  return (
    <div>
      <p style={{ fontSize: 13, color: 'var(--muted-foreground)', margin: '0 0 12px' }}>
        Your work history. Per-employment <code>share_with_sponsors</code> defaults off — sponsors
        only see employers you explicitly opt in for that role.
      </p>
      {employments.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 16px' }}>
          {employments.map((emp) => (
            <li
              key={emp.id}
              style={{
                padding: 12,
                border: '1px solid var(--border)',
                borderRadius: 8,
                background: 'var(--card)',
                marginBottom: 8,
                display: 'flex',
                gap: 12,
                alignItems: 'flex-start',
              }}
            >
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontWeight: 500, fontSize: 14 }}>
                  {emp.role ? `${emp.role} · ` : ''}
                  {emp.employer.name}
                  {emp.is_current && (
                    <span
                      style={{
                        marginLeft: 8,
                        fontFamily: 'var(--font-mono)',
                        fontSize: 10,
                        color: 'var(--primary)',
                        textTransform: 'uppercase',
                      }}
                    >
                      current
                    </span>
                  )}
                </p>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--muted-foreground)' }}>
                  {[emp.started_at, emp.ended_at ?? (emp.is_current ? 'present' : '—')]
                    .filter(Boolean)
                    .join(' → ')}
                  {emp.share_with_sponsors && ' · shared with sponsors'}
                </p>
              </div>
              <button
                type="button"
                className="btn"
                onClick={() => void onRemove(emp.id)}
                style={{ padding: '4px 10px', fontSize: 12 }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        onSubmit={(e) => void onAdd(e)}
        style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <input
            type="text"
            value={draft.employer_name}
            onChange={(e) => setDraft({ ...draft, employer_name: e.target.value })}
            placeholder="Employer name"
            maxLength={160}
            required
            disabled={pending}
            style={inlineInputStyle}
          />
          <input
            type="text"
            value={draft.role}
            onChange={(e) => setDraft({ ...draft, role: e.target.value })}
            placeholder="Role (optional)"
            maxLength={160}
            disabled={pending}
            style={inlineInputStyle}
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <input
            type="date"
            value={draft.started_at}
            onChange={(e) => setDraft({ ...draft, started_at: e.target.value })}
            disabled={pending}
            style={inlineInputStyle}
          />
          <input
            type="date"
            value={draft.ended_at}
            onChange={(e) => setDraft({ ...draft, ended_at: e.target.value })}
            disabled={pending || draft.is_current}
            style={inlineInputStyle}
          />
        </div>
        <label style={{ fontSize: 13, color: 'var(--foreground)', display: 'flex', gap: 6 }}>
          <input
            type="checkbox"
            checked={draft.is_current}
            onChange={(e) =>
              setDraft({
                ...draft,
                is_current: e.target.checked,
                ended_at: e.target.checked ? '' : draft.ended_at,
              })
            }
            disabled={pending}
          />
          This is my current job
        </label>
        <label style={{ fontSize: 13, color: 'var(--foreground)', display: 'flex', gap: 6 }}>
          <input
            type="checkbox"
            checked={draft.share_with_sponsors}
            onChange={(e) => setDraft({ ...draft, share_with_sponsors: e.target.checked })}
            disabled={pending}
          />
          Share this employment with sponsors (default off; opt-in for talent-slice exposure)
        </label>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={pending || draft.employer_name.trim().length < 1}
          style={{ alignSelf: 'flex-start' }}
        >
          {pending ? 'Adding…' : 'Add employment'}
        </button>
      </form>
      {err && (
        <p style={{ fontSize: 12, color: 'var(--destructive, #c00)', margin: '8px 0 0' }}>{err}</p>
      )}
    </div>
  );
}

const inlineInputStyle: React.CSSProperties = {
  padding: '6px 10px',
  border: '1px solid var(--border)',
  borderRadius: 6,
  background: 'var(--background)',
  color: 'var(--foreground)',
  fontSize: 14,
};

export function MeProfileForm(): ReactElement {
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

  const { accessToken, profile, consents, skills, interests, employments } = state;

  return (
    <div>
      <Card title="Profile">
        <ProfileEditor
          profile={profile}
          accessToken={accessToken}
          onSaved={(next) => setState({ ...state, profile: next })}
        />
      </Card>
      <Card title="Consents">
        <p style={{ fontSize: 13, color: 'var(--muted-foreground)', margin: '0 0 8px' }}>
          Default off. Toggle the ones you want. Transactional messages (event confirmations,
          password resets) are always sent.
        </p>
        <ConsentsEditor
          consents={consents}
          accessToken={accessToken}
          onChange={(next) => setState({ ...state, consents: next })}
        />
      </Card>
      <Card title="Skills">
        <SkillsEditor
          skills={skills}
          accessToken={accessToken}
          onChange={(next) => setState({ ...state, skills: next })}
        />
      </Card>
      <Card title="Interests">
        <InterestsEditor
          interests={interests}
          accessToken={accessToken}
          onChange={(next) => setState({ ...state, interests: next })}
        />
      </Card>
      <Card title="Employments">
        <EmploymentsEditor
          employments={employments}
          accessToken={accessToken}
          onChange={(next) => setState({ ...state, employments: next })}
        />
      </Card>
    </div>
  );
}
