import { type FormEvent, type ReactElement, useState } from 'react';

// ISS-USR-REG-001 — AI-Qadam-branded self-registration form.
//
// Submits a NATIVE <form method="POST" action="/api/v1/auth/register">.
// This is deliberately NOT an apiClient()/fetch() call: the server
// responds with an HTTP 302 (HttpStatus.FOUND) redirect to an Authentik
// one-time login URL, not JSON — a fetch() to that endpoint would receive
// the redirect response but NOT navigate the browser. Only a real browser
// form submission (or setting window.location) follows a 302 as an actual
// navigation, which is required so the user lands on Authentik's one-time
// login page and gets bounced back into /v1/auth/callback with a real
// session. See auth.controller.ts's `register` handler and sign-in.astro
// (plain navigation, no JS/fetch) for the same pattern.
//
// onSubmit only runs CLIENT-SIDE VALIDATION (required fields, password
// length, a cheap all-one-character weak-password check) and calls
// preventDefault() to block submission when invalid.
// When validation passes, onSubmit does nothing further and the browser's
// native form submission proceeds untouched — the 302 is followed exactly
// as if this were a zero-JS <form>.
//
// Known limitation (see 03-code-summary.md "Known Limitations"): a
// server-side validation failure (400 BadRequestException) is not
// intercepted — the browser navigates to a raw JSON error body. This is
// an accepted v1 gap because client-side validation already catches the
// common cases (empty fields, short password); see the code summary for
// the full tradeoff writeup.

const COUNTRIES = [
  { value: 'uz', label: 'Uzbekistan' },
  { value: 'kz', label: 'Kazakhstan' },
  { value: 'tj', label: 'Tajikistan' },
  { value: 'xx', label: 'Other' },
] as const;

const MIN_PASSWORD_LENGTH = 12;

type Phase = 'idle' | 'submitting' | 'success' | 'error';

interface FormState {
  displayName: string;
  email: string;
  password: string;
  country: string;
  // Anti-spam honeypot field. Named `company` (NOT `honeypot`) to match
  // LeadCaptureForm.tsx's convention — a literal `honeypot` field name is
  // trivially recognizable by bots that inspect field names before
  // filling (retry pass, SecurityReviewer MAJOR-2). This name must match
  // the `name=` attribute below AND the server's registerSchema key
  // (auth.controller.ts) exactly, since it's a native form POST field.
  company: string;
}

const EMPTY: FormState = { displayName: '', email: '', password: '', country: 'uz', company: '' };

// Pure validator — extracted so it stays unit-testable without a DOM
// (mirrors the LeadCaptureForm.test.ts pattern of re-declaring/testing
// pure helper logic via source-string assertions).
//
// The all-one-character check is a cheap, list-free client-side mirror of
// part of the server's authoritative weak-password rejection (retry
// pass — SecurityReviewer MAJOR-3; see apps/api/src/lib/password-schema.ts
// for the full policy, including the common-password blocklist). This is
// a UX convenience only, not a security boundary — the server re-checks
// everything via passwordField() regardless of what the client sends.
// Deliberately NOT duplicating the server's full blocklist here: keeping
// one authoritative copy avoids drift, and the "too common" case still
// surfaces (as the accepted raw-JSON-navigation known limitation) if it
// slips past this lighter client check.
function validate(form: FormState): string | null {
  if (form.displayName.trim().length === 0) return 'Enter your name.';
  if (form.email.trim().length === 0) return 'Enter your email.';
  if (form.password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (form.password.length > 0 && new Set(form.password).size === 1) {
    return 'Password is too predictable — please choose a stronger one.';
  }
  if (!COUNTRIES.some((c) => c.value === form.country)) return 'Select a country.';
  return null;
}

interface FieldsProps {
  form: FormState;
  setForm: (next: FormState) => void;
  disabled: boolean;
}

function Fields({ form, setForm, disabled }: FieldsProps): ReactElement {
  return (
    <div className="flex flex-col gap-3.5">
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] text-muted-foreground">Name</span>
        <input
          type="text"
          name="displayName"
          required
          autoComplete="name"
          value={form.displayName}
          onChange={(e) => setForm({ ...form, displayName: e.target.value })}
          disabled={disabled}
          placeholder="Your name"
          className="px-3 py-2.5 border border-border rounded-lg bg-background text-foreground text-sm"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] text-muted-foreground">Email</span>
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          disabled={disabled}
          placeholder="you@domain.com"
          className="px-3 py-2.5 border border-border rounded-lg bg-background text-foreground text-sm"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] text-muted-foreground">Password</span>
        <input
          type="password"
          name="password"
          required
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          disabled={disabled}
          placeholder="At least 12 characters"
          className="px-3 py-2.5 border border-border rounded-lg bg-background text-foreground text-sm"
        />
        <span className="text-xs text-muted-foreground">
          At least 12 characters. Avoid common or repeated-character passwords.
        </span>
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] text-muted-foreground">Country</span>
        <select
          name="country"
          required
          value={form.country}
          onChange={(e) => setForm({ ...form, country: e.target.value })}
          disabled={disabled}
          className="px-3 py-2.5 border border-border rounded-lg bg-background text-foreground text-sm"
        >
          {COUNTRIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <input
        type="text"
        name="company"
        value={form.company}
        onChange={(e) => setForm({ ...form, company: e.target.value })}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="sr-only"
      />
    </div>
  );
}

export function SignUpForm(): ReactElement {
  const [phase, setPhase] = useState<Phase>('idle');
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errorMsg, setErrorMsg] = useState<string>('');

  // Client-side validation gate only. On success this deliberately does
  // NOT call preventDefault() or intercept the submission — the native
  // form POST proceeds and the browser follows the server's 302 redirect
  // on its own. `success` phase is set defensively but will typically
  // never render, since a successful submit navigates the browser away
  // before React re-renders.
  const onSubmit = (e: FormEvent<HTMLFormElement>): void => {
    const validationError = validate(form);
    if (validationError) {
      e.preventDefault();
      setPhase('error');
      setErrorMsg(validationError);
      return;
    }
    setPhase('submitting');
    setErrorMsg('');
    // No preventDefault — let the browser submit natively and follow the
    // redirect chain: /api/v1/auth/register → 302 → Authentik one-time
    // login → /v1/auth/callback → signed-in session.
  };

  if (phase === 'success') {
    return (
      <div className="p-6 border border-[color-mix(in_oklch,var(--primary)_40%,var(--border))] rounded-xl bg-[color-mix(in_oklch,var(--primary)_8%,var(--card))] text-center">
        <p className="font-display font-semibold text-lg mb-1.5">Setting up your account</p>
        <p className="text-[13px] text-muted-foreground m-0">Redirecting you to sign in…</p>
      </div>
    );
  }

  return (
    <form
      method="POST"
      action="/api/v1/auth/register"
      onSubmit={onSubmit}
      className="p-6 border border-border rounded-xl bg-card flex flex-col gap-4 relative"
    >
      <div>
        <h3 className="font-display font-semibold text-lg mb-1">Create your account</h3>
        <p className="text-[13px] text-muted-foreground m-0">
          Join as a full AI Qadam member — event registration, leaderboard, badges.
        </p>
      </div>
      <Fields form={form} setForm={setForm} disabled={phase === 'submitting'} />
      {phase === 'error' && <p className="text-xs text-destructive m-0">{errorMsg}</p>}
      <button type="submit" className="btn btn-primary self-start" disabled={phase === 'submitting'}>
        {phase === 'submitting' ? 'Creating account…' : 'Sign up'}
      </button>
    </form>
  );
}
