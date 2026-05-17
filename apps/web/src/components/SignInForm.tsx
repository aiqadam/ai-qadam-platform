import type { ReactElement } from 'react';

// AI Qadam sign-in / sign-up entry point. We don't take credentials here;
// the OIDC redirect flow takes the user to auth.aiqadam.org (branded as
// AI Qadam) where Authentik handles password + future MFA. See
// docs/auth-architecture.md.
//
// `next` is the path to land on after sign-in; sanitised both on the
// page that mounts this component AND server-side in /v1/auth/login.

interface Props {
  next: string;
}

export function SignInForm({ next }: Props): ReactElement {
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/';
  const loginHref = `/api/v1/auth/login?next=${encodeURIComponent(safeNext)}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <a
        className="btn btn-primary btn-lg"
        href={loginHref}
        style={{ textDecoration: 'none', textAlign: 'center' }}
      >
        Continue to sign in
      </a>
      <p
        style={{
          fontSize: 11,
          color: 'var(--muted-foreground)',
          fontFamily: 'var(--font-mono)',
          letterSpacing: '0.04em',
          margin: '8px 0 0',
          textAlign: 'center',
        }}
      >
        Sign-in happens on <strong style={{ color: 'var(--foreground)' }}>auth.aiqadam.org</strong>—
        our isolated, hardened auth subdomain. Sign up is on the same page.
      </p>
    </div>
  );
}
