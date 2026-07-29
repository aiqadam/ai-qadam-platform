// L3 workspace block — <UserRolesManager>.
//
// FR-ADM-011 — "Manage users" view. Search any user, see their current
// roles in plain language, grant/revoke via form controls (no free
// text), and see the actually-re-read post-change state — never an
// optimistic toast. Closes the GitHub issue #107 silent-failure gap.
//
// Sits alongside <InvitesList> on the same /workspace/admin/users page
// (tab-switched, no separate route) — see the .astro file for the tab
// shell. Page-level role-gate (<AuthGate role="aiqadam-super-admin">)
// already covers this island too; the API's SuperAdminGuard is the real
// enforcement point regardless.

import { Button, Input } from '@/kit';
import { IslandRoot } from '@/lib/island-root';
import { roleLabel } from '@/lib/roles';
import type { AdminUserCountry, AdminUserSummary, HumanRoleGroup } from '@/lib/types';
import { ADMIN_USER_COUNTRIES, HUMAN_ROLE_GROUPS } from '@/lib/types';
import { useChangeUserRole, useUserRoles, useUserSearch } from '@/lib/use-admin-user-roles';
import { type FormEvent, type ReactElement, useState } from 'react';

const COUNTRY_SCOPED_GROUPS: ReadonlySet<HumanRoleGroup> = new Set([
  'aiqadam-organizer',
  'aiqadam-country-lead',
]);

function SearchBox({
  query,
  onQueryChange,
}: {
  query: string;
  onQueryChange: (q: string) => void;
}): ReactElement {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor="user-search"
        className="block font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
      >
        Search by email or name
      </label>
      <Input
        id="user-search"
        type="text"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="firstname.lastname@aiqadam.org"
      />
    </div>
  );
}

function SearchResults({
  query,
  selectedId,
  onSelect,
}: {
  query: string;
  selectedId: number | null;
  onSelect: (id: number) => void;
}): ReactElement | null {
  const search = useUserSearch(query);
  if (query.trim().length === 0) return null;
  if (search.isPending) {
    return <p className="text-xs text-muted-foreground">Searching…</p>;
  }
  if (search.error) {
    return <p className="text-xs text-destructive">{search.error.message}</p>;
  }
  const users = search.data?.users ?? [];
  if (users.length === 0) {
    return <p className="text-xs text-muted-foreground">No matching users.</p>;
  }
  return (
    <ul className="space-y-1">
      {users.map((u: AdminUserSummary) => (
        <li key={u.id}>
          <button
            type="button"
            onClick={() => onSelect(u.id)}
            className={`w-full text-left rounded-md border px-3 py-2 transition-colors ${
              selectedId === u.id
                ? 'border-primary/40 bg-primary/10'
                : 'border-border bg-card hover:border-primary/30'
            }`}
          >
            <span className="text-sm text-foreground">{u.email}</span>
            <span className="block font-mono text-[10px] text-muted-foreground mt-0.5">
              {u.groups.map(roleLabel).join(', ') || 'No roles'}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function RoleChangeForm({ userId }: { userId: number }): ReactElement {
  const change = useChangeUserRole();
  const [action, setAction] = useState<'grant' | 'revoke'>('grant');
  const [role, setRole] = useState<HumanRoleGroup>('aiqadam-member');
  const [country, setCountry] = useState<AdminUserCountry | ''>('');

  const needsCountry = COUNTRY_SCOPED_GROUPS.has(role);

  const onSubmit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    change.mutate({
      userId,
      body: {
        ...(action === 'grant' ? { grant: role } : { revoke: role }),
        ...(needsCountry && country ? { country } : {}),
      },
    });
  };

  const canSubmit = !change.isPending && (!needsCountry || country !== '');

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-md border border-border bg-card p-4">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setAction('grant')}
          className={`font-mono text-[11px] px-2 py-1 rounded border ${
            action === 'grant'
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-card text-muted-foreground border-border'
          }`}
        >
          Grant
        </button>
        <button
          type="button"
          onClick={() => setAction('revoke')}
          className={`font-mono text-[11px] px-2 py-1 rounded border ${
            action === 'revoke'
              ? 'bg-destructive text-destructive-foreground border-destructive'
              : 'bg-card text-muted-foreground border-border'
          }`}
        >
          Revoke
        </button>
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="role-select"
          className="block font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
        >
          Role
        </label>
        <select
          id="role-select"
          value={role}
          onChange={(e) => setRole(e.target.value as HumanRoleGroup)}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          {HUMAN_ROLE_GROUPS.map((g) => (
            <option key={g} value={g}>
              {roleLabel(g)}
            </option>
          ))}
        </select>
      </div>

      {needsCountry && (
        <div className="space-y-1.5">
          <label
            htmlFor="country-select"
            className="block font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
          >
            Country
          </label>
          <select
            id="country-select"
            value={country}
            onChange={(e) => setCountry(e.target.value as AdminUserCountry)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            required
          >
            <option value="">— select —</option>
            {ADMIN_USER_COUNTRIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        {change.error && <p className="text-xs text-destructive m-0">{change.error.message}</p>}
        <Button type="submit" disabled={!canSubmit}>
          {change.isPending ? 'Applying…' : action === 'grant' ? 'Grant role' : 'Revoke role'}
        </Button>
      </div>
    </form>
  );
}

function UserDetail({ userId }: { userId: number }): ReactElement {
  const roles = useUserRoles(userId);

  return (
    <section className="space-y-4">
      <header>
        <h2 className="font-display text-lg font-semibold text-foreground m-0">Current roles</h2>
        <p className="text-xs text-muted-foreground mt-1 m-0">
          Live-read from Authentik on every load — never cached optimistically.
        </p>
      </header>

      {roles.isPending && <p className="text-xs text-muted-foreground">Loading…</p>}
      {roles.error && <p className="text-xs text-destructive">{roles.error.message}</p>}

      {roles.data && (
        <>
          <div className="rounded-md border border-border bg-card p-4">
            <p className="text-sm text-foreground m-0">{roles.data.email}</p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {roles.data.groups.length === 0 ? (
                <span className="font-mono text-[10px] text-muted-foreground">No roles</span>
              ) : (
                roles.data.groups.map((g) => (
                  <span
                    key={g}
                    className="font-mono text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border border-primary/30 text-primary bg-primary/10"
                  >
                    {roleLabel(g)}
                  </span>
                ))
              )}
            </div>
          </div>

          <RoleChangeForm userId={userId} />
        </>
      )}
    </section>
  );
}

function UserRolesManagerInner(): ReactElement {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <section className="space-y-3">
        <header>
          <h2 className="font-display text-lg font-semibold text-foreground m-0">Search users</h2>
          <p className="text-xs text-muted-foreground mt-1 m-0">
            Select a user to view and change their roles.
          </p>
        </header>
        <SearchBox query={query} onQueryChange={setQuery} />
        <SearchResults query={query} selectedId={selectedId} onSelect={setSelectedId} />
      </section>

      <div>{selectedId !== null && <UserDetail userId={selectedId} />}</div>
    </div>
  );
}

export function UserRolesManager(): ReactElement {
  return (
    <IslandRoot>
      <UserRolesManagerInner />
    </IslandRoot>
  );
}

export { UserRolesManagerInner };
export default UserRolesManager;
