// L3 common block — <AccountChip>.
//
// Right-cluster account control in the sitewide nav. Anon → renders
// nothing (the <AppNav> anon branch shows the Sign-in CTA instead).
// Authed → avatar circle of initials; click opens a popover with:
//   - "signed in as <local-part>"
//   - role-gated operational links (Workspace if operator,
//     Engineering Deck if engineer)
//   - Sign out
//
// Reads identity from useAuth() (the SSR-seeded context — single source
// of truth per page load, no island /refresh race). Sign-out routes
// through lib/sign-out.ts so the block never raw-fetches /api
// (ADR-0038 §Locks #1b). Tailwind tokens only (no inline style=).
//
// Role predicates mirror v1's NavAccountMenu semantics — distinct from
// useAuth().isSuper (which keys on the 'aiqadam-engineers' group); the
// nav menu gates on the operator/engineer group families instead.

import { isOperator, isSuperAdmin } from '@/lib/roles';
import { signOut } from '@/lib/sign-out';
import { useAuth } from '@/lib/use-auth';
import { type ReactElement, useEffect, useRef, useState } from 'react';

const ENGINEERING_DECK_URL = 'https://login.aiqadam.org/if/user/#/library';

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

const MENU_ITEM_CLASS =
  'block rounded-md px-2.5 py-2 text-sm text-foreground no-underline text-left w-full bg-transparent border-0 cursor-pointer hover:bg-muted/60 transition-colors';

export function AccountChip(): ReactElement | null {
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent): void {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!auth.isAuthenticated || !auth.user) return null;

  const { email, groups } = auth.user;
  const showWorkspace = isOperator(groups);
  const showEngineering = isSuperAdmin(groups);
  const showOps = showWorkspace || showEngineering;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Account menu"
        aria-expanded={open}
        aria-haspopup="menu"
        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border bg-primary/20 font-mono text-[10px] font-semibold text-foreground cursor-pointer p-0"
      >
        {initialsFor(email)}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+6px)] z-[60] flex min-w-[220px] flex-col rounded-xl border border-border bg-card p-1.5 shadow-lg"
        >
          <div className="px-2.5 pt-1 pb-2">
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground m-0 mb-0.5">
              Signed in as
            </p>
            <p className="text-sm text-foreground m-0 truncate max-w-[220px]" title={email}>
              {localPart(email)}
            </p>
          </div>

          {showOps && (
            <>
              <div className="border-t border-border my-0.5" />
              {showWorkspace && (
                <a href="/workspace" role="menuitem" className={MENU_ITEM_CLASS}>
                  Workspace
                </a>
              )}
              {showEngineering && (
                <a
                  href={ENGINEERING_DECK_URL}
                  role="menuitem"
                  className={MENU_ITEM_CLASS}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Engineering Deck ↗
                </a>
              )}
            </>
          )}

          <div className="border-t border-border my-0.5" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              void signOut(auth.accessToken);
            }}
            className={MENU_ITEM_CLASS}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export default AccountChip;
