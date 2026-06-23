// L3 block — <OnboardingForm>.
//
// FR-MIG-020 — 3-step member onboarding form for /onboard page.
// Step 1: profile basics (first name, last name, job title).
// Step 2: skills + interests.
// Step 3: consents + AUP acknowledgment.
//
// Uses the Wizard atom (L2) for step progression. Submits to
// POST /v1/members/onboard via useOnboardMember hook.

import { Button, Input } from '@/kit';
import { Wizard, WizardBody, WizardFooter } from '@/kit/Wizard';
import { IslandRoot } from '@/lib/island-root';
import { useOnboardMember } from '@/lib/use-onboarding';
import { type FormEvent, type ReactElement, useState } from 'react';

const STEPS = [
  { id: 'profile', label: 'About you' },
  { id: 'skills', label: 'Skills & interests' },
  { id: 'consents', label: 'Consents' },
] as const;

const CONSENT_LABELS: Record<string, string> = {
  events: 'Event announcements & updates',
  marketing: 'Community newsletters & promotions',
  research: 'Aggregate analytics & research sharing',
  recruiting: 'Job board & recruitment opportunities',
  sponsor_share: 'Sharing my profile with sponsors',
  content: 'Curated content recommendations',
  paid_premium: 'Premium features & paid offerings',
};

const INTEREST_INTENTS = [
  { value: 'learn', label: 'Learn' },
  { value: 'practice', label: 'Practice' },
  { value: 'mentor', label: 'Mentor' },
  { value: 'discuss', label: 'Discuss' },
] as const;

// ---------------------------------------------------------------------------
// Step 1 — profile basics
// ---------------------------------------------------------------------------

interface Step1Props {
  firstName: string;
  lastName: string;
  jobTitle: string;
  onChange: (field: 'firstName' | 'lastName' | 'jobTitle', value: string) => void;
}

function Step1Profile({ firstName, lastName, jobTitle, onChange }: Step1Props): ReactElement {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="firstName" className="block text-sm font-medium text-foreground mb-1.5">
            First name{' '}
            <span className="text-destructive" aria-hidden>
              *
            </span>
          </label>
          <Input
            id="firstName"
            type="text"
            value={firstName}
            onChange={(e) => onChange('firstName', e.target.value)}
            placeholder="Ahmad"
            required
            autoComplete="given-name"
          />
        </div>
        <div>
          <label htmlFor="lastName" className="block text-sm font-medium text-foreground mb-1.5">
            Last name{' '}
            <span className="text-destructive" aria-hidden>
              *
            </span>
          </label>
          <Input
            id="lastName"
            type="text"
            value={lastName}
            onChange={(e) => onChange('lastName', e.target.value)}
            placeholder="Rakhimov"
            required
            autoComplete="family-name"
          />
        </div>
      </div>
      <div>
        <label htmlFor="jobTitle" className="block text-sm font-medium text-foreground mb-1.5">
          Job title <span className="text-xs text-muted-foreground">(optional)</span>
        </label>
        <Input
          id="jobTitle"
          type="text"
          value={jobTitle}
          onChange={(e) => onChange('jobTitle', e.target.value)}
          placeholder="Senior ML Engineer"
          autoComplete="organization-title"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — skills + interests
// ---------------------------------------------------------------------------

interface InterestEntry {
  topic_tag: string;
  intent: 'learn' | 'practice' | 'mentor' | 'discuss';
}

interface Step2Props {
  skills: string[];
  interests: InterestEntry[];
  onAddSkill: (tag: string) => void;
  onRemoveSkill: (tag: string) => void;
  onAddInterest: (entry: InterestEntry) => void;
  onRemoveInterest: (entry: InterestEntry) => void;
}

function Step2Skills({
  skills,
  interests,
  onAddSkill,
  onRemoveSkill,
  onAddInterest,
  onRemoveInterest,
}: Step2Props): ReactElement {
  const [skillDraft, setSkillDraft] = useState('');
  const [interestTopicDraft, setInterestTopicDraft] = useState('');
  const [interestIntentDraft, setInterestIntentDraft] = useState<
    'learn' | 'practice' | 'mentor' | 'discuss'
  >('learn');

  const addSkill = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    const trimmed = skillDraft
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    if (trimmed.length < 2) return;
    onAddSkill(trimmed);
    setSkillDraft('');
  };

  const addInterest = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    const trimmed = interestTopicDraft
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    if (trimmed.length < 2) return;
    onAddInterest({ topic_tag: trimmed, intent: interestIntentDraft });
    setInterestTopicDraft('');
  };

  return (
    <div className="space-y-6">
      {/* Skills */}
      <div>
        <p className="text-sm font-medium text-foreground mb-2">Skills</p>
        <div className="flex flex-wrap gap-2 min-h-[28px] mb-3">
          {skills.length === 0 && (
            <span className="text-xs text-muted-foreground">
              No skills added yet. Try <code className="font-mono text-[11px]">llm-finetuning</code>
              , <code className="font-mono text-[11px]">mlops</code>,{' '}
              <code className="font-mono text-[11px]">computer-vision</code>.
            </span>
          )}
          {skills.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border bg-background text-xs"
            >
              {tag}
              <button
                type="button"
                onClick={() => onRemoveSkill(tag)}
                aria-label={`Remove ${tag}`}
                className="text-muted-foreground hover:text-foreground transition-colors leading-none text-sm cursor-pointer"
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <form onSubmit={addSkill} className="flex gap-2">
          <Input
            type="text"
            value={skillDraft}
            onChange={(e) => setSkillDraft(e.target.value)}
            placeholder="add a skill tag"
            maxLength={80}
            className="flex-1"
          />
          <Button type="submit" variant="outline" disabled={skillDraft.trim().length < 2}>
            Add
          </Button>
        </form>
      </div>

      {/* Interests */}
      <div>
        <p className="text-sm font-medium text-foreground mb-2">Topics I&apos;m interested in</p>
        <div className="space-y-2 mb-3">
          {interests.map((entry) => (
            <div key={`${entry.topic_tag}:${entry.intent}`} className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border bg-background text-xs">
                {entry.topic_tag}
                <span className="text-muted-foreground">·</span>
                <span className="text-muted-foreground">{entry.intent}</span>
              </span>
              <button
                type="button"
                onClick={() => onRemoveInterest(entry)}
                aria-label="Remove interest"
                className="text-muted-foreground hover:text-foreground transition-colors leading-none text-sm cursor-pointer"
              >
                ×
              </button>
            </div>
          ))}
          {interests.length === 0 && (
            <span className="text-xs text-muted-foreground">
              No topics yet. E.g. <code className="font-mono text-[11px]">ai-safety</code>,{' '}
              <code className="font-mono text-[11px]">llm-optimization</code>.
            </span>
          )}
        </div>
        <form onSubmit={addInterest} className="flex gap-2">
          <Input
            type="text"
            value={interestTopicDraft}
            onChange={(e) => setInterestTopicDraft(e.target.value)}
            placeholder="topic tag"
            maxLength={80}
            className="flex-1"
          />
          <select
            value={interestIntentDraft}
            onChange={(e) => setInterestIntentDraft(e.target.value as typeof interestIntentDraft)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {INTEREST_INTENTS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <Button type="submit" variant="outline" disabled={interestTopicDraft.trim().length < 2}>
            Add
          </Button>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — consents
// ---------------------------------------------------------------------------

interface Step3Props {
  consents: Record<string, boolean>;
  onToggle: (purpose: string, value: boolean) => void;
}

function Step3Consents({ consents, onToggle }: Step3Props): ReactElement {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-muted/30 p-4 text-xs text-muted-foreground">
        <p>
          We take your privacy seriously. You can update these preferences at any time from your
          profile settings. All purposes default to off — you choose what to share.
        </p>
      </div>
      <fieldset>
        <legend className="text-sm font-medium text-foreground mb-3">
          What may we use your information for?
        </legend>
        <div className="space-y-3">
          {Object.entries(CONSENT_LABELS).map(([purpose, label]) => {
            const checked = consents[purpose] ?? false;
            return (
              <label key={purpose} className="flex items-start gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => onToggle(purpose, e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-input text-primary focus:ring-primary cursor-pointer"
                />
                <span className="text-sm text-foreground leading-snug group-hover:text-foreground/80">
                  {label}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <div className="rounded-lg border border-border p-4">
        <p className="text-xs text-muted-foreground">
          By completing onboarding you agree to our{' '}
          <a href="/aup" className="underline underline-offset-2 hover:text-foreground">
            Acceptable Use Policy
          </a>
          .
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root — OnboardingForm
// ---------------------------------------------------------------------------

interface OnboardingFormProps {
  slug?: string | undefined;
}

export function OnboardingForm({ slug }: OnboardingFormProps): ReactElement {
  const [currentStepId, setCurrentStepId] = useState<string>('profile');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [skills, setSkills] = useState<string[]>([]);
  const [interests, setInterests] = useState<InterestEntry[]>([]);
  const [consents, setConsents] = useState<Record<string, boolean>>({});

  const stepIndex = STEPS.findIndex((s) => s.id === currentStepId);
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === STEPS.length - 1;

  const steps = STEPS.map((s) => ({
    ...s,
    status:
      s.id === currentStepId
        ? ('running' as const)
        : stepIndex > STEPS.findIndex((x) => x.id === s.id)
          ? ('succeeded' as const)
          : ('pending' as const),
  }));

  const onboard = useOnboardMember();

  const validateStep = (): boolean => {
    if (currentStepId === 'profile') {
      return firstName.trim().length > 0 && lastName.trim().length > 0;
    }
    return true;
  };

  const handleNext = (): void => {
    if (!validateStep()) return;
    const idx = STEPS.findIndex((s) => s.id === currentStepId);
    const nextStep = STEPS[idx + 1];
    if (nextStep !== undefined) setCurrentStepId(nextStep.id);
  };

  const handleBack = (): void => {
    const idx = STEPS.findIndex((s) => s.id === currentStepId);
    const prevStep = STEPS[idx - 1];
    if (prevStep !== undefined) setCurrentStepId(prevStep.id);
  };

  const handleSubmit = async (): Promise<void> => {
    await onboard.mutateAsync({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      jobTitle: jobTitle.trim() || null,
      skills,
      interests,
      consents,
      ...(slug !== undefined && { slug }),
    });
    // On success, redirect to /me
    window.location.href = '/me';
  };

  const isLoading = onboard.isPending;

  return (
    <IslandRoot>
      <Wizard steps={steps} currentStepId={currentStepId}>
        <WizardBody>
          {currentStepId === 'profile' && (
            <Step1Profile
              firstName={firstName}
              lastName={lastName}
              jobTitle={jobTitle}
              onChange={(field, value) => {
                if (field === 'firstName') setFirstName(value);
                else if (field === 'lastName') setLastName(value);
                else setJobTitle(value);
              }}
            />
          )}
          {currentStepId === 'skills' && (
            <Step2Skills
              skills={skills}
              interests={interests}
              onAddSkill={(tag) => {
                if (!skills.includes(tag)) setSkills((prev) => [...prev, tag]);
              }}
              onRemoveSkill={(tag) => setSkills((prev) => prev.filter((s) => s !== tag))}
              onAddInterest={(entry) =>
                setInterests((prev) =>
                  prev.some((i) => i.topic_tag === entry.topic_tag && i.intent === entry.intent)
                    ? prev
                    : [...prev, entry],
                )
              }
              onRemoveInterest={(entry) =>
                setInterests((prev) =>
                  prev.filter(
                    (i) => !(i.topic_tag === entry.topic_tag && i.intent === entry.intent),
                  ),
                )
              }
            />
          )}
          {currentStepId === 'consents' && (
            <Step3Consents
              consents={consents}
              onToggle={(purpose, value) => setConsents((prev) => ({ ...prev, [purpose]: value }))}
            />
          )}
        </WizardBody>

        <WizardFooter className="mt-6">
          {!isFirst && (
            <Button type="button" variant="outline" onClick={handleBack} disabled={isLoading}>
              Back
            </Button>
          )}
          <div className="flex-1" />
          {onboard.isError && (
            <p className="text-xs text-destructive self-center">
              {onboard.error?.message ?? 'Something went wrong. Please try again.'}
            </p>
          )}
          {isLast ? (
            <Button type="button" onClick={handleSubmit} disabled={isLoading}>
              {isLoading ? 'Completing…' : 'Complete onboarding'}
            </Button>
          ) : (
            <Button type="button" onClick={handleNext} disabled={!validateStep()}>
              Continue
            </Button>
          )}
        </WizardFooter>
      </Wizard>
    </IslandRoot>
  );
}

export default OnboardingForm;
