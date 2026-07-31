import { type FormEvent, type ReactElement, useState } from 'react';
import { Mail, MailCheck } from 'lucide-react';

// FR-AUTH-004 — magic-link (passwordless email) sign-in form.
//
// POSTs to /v1/auth/magic-link via apiClient (NOT a native
// <form method="POST"> like SignUpForm.tsx). This is a deliberate,
// load-bearing difference from SignUpForm's pattern: SignUpForm safely
// relies on the browser following the server's 302 redirect because the
// redirect target is the REGISTRANT'S OWN fresh account. Magic-link must
// never do that — the whole point is that the one-time link goes to the
// submitted email's inbox, not back to whichever browser tab happened to
// submit the form. A same-tab redirect to an Authentik one-time URL here
// would let anyone sign in as any email address without ever proving
// inbox ownership. The server's response is JSON { ok: true } (always,
// regardless of outcome — anti-enumeration by design, see
// auth.controller.ts's magicLink() handler), and this form only ever
// transitions to a static "check your email" confirmation state — no
// navigation, no link value ever appears client-side.
//
// ADR-0038 §Locks #2: uses apiClient (not raw fetch) — same convention as
// LeadCaptureForm.tsx, the closer precedent here (fetch-based JSON
// submit) versus SignUpForm.tsx's native-form-302 pattern.

// arch-ignore: no-api-import-in-blocks — apiClient is the approved abstraction here (not raw fetch)
import { apiClient } from '@/lib/api-client';

type Phase = 'idle' | 'submitting' | 'success' | 'error';

async function submitMagicLinkRequest(email: string): Promise<void> {
  await apiClient<{ ok: true }>('/v1/auth/magic-link', {
    method: 'POST',
    body: { email },
  });
}

function SuccessPanel(): ReactElement {
  return (
    <div className="p-6 border border-[color-mix(in_oklch,var(--primary)_40%,var(--border))] rounded-xl bg-[color-mix(in_oklch,var(--primary)_8%,var(--card))] text-center flex flex-col items-center gap-2">
      <MailCheck size={24} className="text-primary" aria-hidden="true" />
      <p className="font-display font-semibold text-lg m-0">Check your email</p>
      <p className="text-[13px] text-muted-foreground m-0">
        If that email has an account, a sign-in link is on its way. It expires in 15 minutes and
        works once.
      </p>
    </div>
  );
}

export function MagicLinkForm(): ReactElement {
  const [phase, setPhase] = useState<Phase>('idle');
  const [email, setEmail] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const onSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setPhase('submitting');
    setErrorMsg('');
    try {
      await submitMagicLinkRequest(email.trim());
      setPhase('success');
    } catch (err) {
      setPhase('error');
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    }
  };

  if (phase === 'success') return <SuccessPanel />;

  return (
    <form
      onSubmit={onSubmit}
      className="p-6 border border-border rounded-xl bg-card flex flex-col gap-4 relative"
    >
      <div>
        <h3 className="font-display font-semibold text-lg mb-1">Sign in with email link</h3>
        <p className="text-[13px] text-muted-foreground m-0">
          We&apos;ll email you a one-time link — no password needed.
        </p>
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] text-muted-foreground">Email</span>
        <div className="relative">
          <Mail
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={phase === 'submitting'}
            placeholder="you@domain.com"
            className="w-full pl-9 pr-3 py-2.5 border border-border rounded-lg bg-background text-foreground text-sm"
          />
        </div>
      </label>
      {phase === 'error' && <p className="text-xs text-destructive m-0">{errorMsg}</p>}
      <button
        type="submit"
        className="btn btn-primary self-start"
        disabled={phase === 'submitting' || email.trim().length === 0}
      >
        {phase === 'submitting' ? 'Sending link…' : 'Send sign-in link'}
      </button>
    </form>
  );
}
