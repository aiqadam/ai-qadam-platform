import { type FormEvent, type ReactElement, useEffect, useState } from 'react';

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

type State =
  | { phase: 'loading' }
  | { phase: 'anon' }
  | {
      phase: 'authed';
      accessToken: string;
      profile: Profile;
      consents: Record<Purpose, ConsentSummary>;
      skills: Skill[];
    }
  | { phase: 'error'; message: string };

async function bootstrap(): Promise<State> {
  const refresh = await fetch('/api/v1/auth/refresh', {
    method: 'POST',
    credentials: 'include',
  });
  if (!refresh.ok) return { phase: 'anon' };
  const { accessToken } = (await refresh.json()) as { accessToken: string };

  const res = await fetch('/api/v1/me/profile', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return { phase: 'anon' };
  const { profile, consents, skills } = (await res.json()) as {
    profile: Profile;
    consents: ConsentSummary[];
    skills: Skill[];
  };
  const byPurpose = consents.reduce(
    (acc, c) => {
      acc[c.purpose] = c;
      return acc;
    },
    {} as Record<Purpose, ConsentSummary>,
  );
  return { phase: 'authed', accessToken, profile, consents: byPurpose, skills };
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
        Sign in with Authentik
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const tags = industryTags
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
      const next = await patchProfile(accessToken, {
        job_title: jobTitle.trim() === '' ? null : jobTitle.trim(),
        seniority: seniority === '' ? null : (seniority as Profile['seniority']),
        industry_tags: tags,
        is_student: isStudent,
        bio_md: bioMd.trim() === '' ? null : bioMd,
        appear_in_directory: appearInDirectory,
      });
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

  const { accessToken, profile, consents, skills } = state;

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
    </div>
  );
}
