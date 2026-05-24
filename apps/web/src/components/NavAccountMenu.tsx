import { type ReactElement, useEffect, useRef, useState } from 'react';
import { type AuthMe, getAuthState, signOut } from '../lib/auth-bootstrap';

// Right-cluster account chip in the top nav. Anon → renders nothing
// (the static Sign-in CTA in the left cluster covers that side). Authed
// → small avatar circle with initials; click to open a popover with:
//   - role-gated operational links (Workspace, Engineering Deck)
//   - "Signed in as <email>"
//   - Sign out action
//
// Operational links live here (not in the left public nav) so the
// nav header stays focused on community-facing surfaces (Events,
// Leaderboard, Account). Per ADR-0037 three-tier, the operator +
// engineer layers are personal-surface concerns — gating them under
// the account menu matches the tier mental model.
//
// Bootstrap goes through the shared getAuthState() helper so this
// island piggybacks on whatever /refresh + /me round-trip another
// island on the page already made (#339 dedupe).

const ENGINEERING_DECK_URL = 'https://login.aiqadam.org/if/user/#/library';

interface I18n {
  signed_in_as: string;
  sign_out: string;
  account_menu_aria: string;
  workspace: string;
  engineering_deck: string;
}

interface Props {
  t: I18n;
}

type State = { phase: 'loading' } | { phase: 'anon' } | { phase: 'authed'; me: AuthMe };

function initialsFor(email: string): string {
  const local = email.split('@')[0] ?? email;
  const parts = local.split(/[._-]+/).filter(Boolean);
  const a = parts[0]?.[0] ?? local[0] ?? '?';
  const b = parts[1]?.[0] ?? parts[0]?.[1] ?? '';
  return `${a}${b}`.toUpperCase();
}

function localPart(email: string): string {
  return email.split('@')[0] ?? email;
}

// Groups source-of-truth lives in Authentik; the `groups` claim is
// emitted on the OIDC scope (see auth.service.ts FLOW_SCOPES) and
// arrives in /v1/auth/me. Role changes propagate within one refresh
// cycle (max ~15 min).
function isEngineer(groups: string[]): boolean {
  return groups.some((g) => g === 'aiqadam-super-admin' || g === 'authentik Admins');
}

function isOperator(groups: string[]): boolean {
  return groups.some(
    (g) =>
      g === 'aiqadam-super-admin' ||
      g === 'aiqadam-sponsor-rep' ||
      g.startsWith('aiqadam-country-lead-') ||
      g.startsWith('aiqadam-organizer-'),
  );
}

const menuItemStyle: React.CSSProperties = {
  display: 'block',
  padding: '8px 10px',
  fontSize: 13,
  color: 'var(--foreground)',
  textDecoration: 'none',
  borderRadius: 6,
  lineHeight: 1.3,
};

export function NavAccountMenu({ t }: Props): ReactElement | null {
  const [state, setState] = useState<State>({ phase: 'loading' });
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    getAuthState().then((auth) => {
      if (cancelled) return;
      setState(auth ? { phase: 'authed', me: auth.me } : { phase: 'anon' });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Close on outside-click + Escape.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (state.phase !== 'authed') return null;

  const initials = initialsFor(state.me.email);
  const groups = state.me.groups ?? [];
  const showWorkspace = isOperator(groups);
  const showEngineering = isEngineer(groups);
  const showOperationalSection = showWorkspace || showEngineering;

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t.account_menu_aria}
        aria-expanded={open}
        aria-haspopup="menu"
        style={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          border: '1px solid var(--border)',
          background: 'color-mix(in oklch, var(--primary) 22%, var(--card))',
          color: 'var(--foreground)',
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: '0.02em',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
        }}
      >
        {initials}
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            minWidth: 220,
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            boxShadow: 'var(--shadow-lg)',
            padding: 6,
            display: 'flex',
            flexDirection: 'column',
            zIndex: 60,
          }}
        >
          <div style={{ padding: '4px 10px 8px' }}>
            <p
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--muted-foreground)',
                margin: '0 0 2px',
              }}
            >
              {t.signed_in_as}
            </p>
            <p
              style={{
                fontSize: 13,
                color: 'var(--foreground)',
                margin: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: 220,
              }}
              title={state.me.email}
            >
              {localPart(state.me.email)}
            </p>
          </div>

          {showOperationalSection && (
            <>
              <div style={{ borderTop: '1px solid var(--border)', margin: '2px 0' }} />
              {showWorkspace && (
                <a href="/workspace" role="menuitem" style={menuItemStyle}>
                  {t.workspace}
                </a>
              )}
              {showEngineering && (
                <a
                  href={ENGINEERING_DECK_URL}
                  role="menuitem"
                  style={menuItemStyle}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t.engineering_deck} ↗
                </a>
              )}
            </>
          )}

          <div style={{ borderTop: '1px solid var(--border)', margin: '2px 0' }} />
          <button
            type="button"
            onClick={() => {
              void signOut();
            }}
            role="menuitem"
            style={{
              ...menuItemStyle,
              background: 'transparent',
              border: 0,
              cursor: 'pointer',
              textAlign: 'left',
              font: 'inherit',
              color: 'var(--foreground)',
            }}
          >
            {t.sign_out}
          </button>
        </div>
      )}
    </div>
  );
}
