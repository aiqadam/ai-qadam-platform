// L3 workspace block — <InvitesList>.
//
// Operator Invites cabinet island. Lists pending/consumed/revoked
// invites and exposes a create form inline. Last-created invite_url
// is shown ONCE under the form (the API only returns plaintext on
// create — admin must copy it then).
//
// PR 2.3a ships:
//   - list via DataTable
//   - inline create form (no Drawer yet — added in 2.3b when a second
//     cabinet needs the drawer pattern)
//   - revoke action via per-row button
//
// Page-level role-gate is in the cabinet .astro file
// (<AuthGate role="aiqadam-super-admin">) so this island doesn't
// re-check group membership. The API has SuperAdminGuard regardless.

import { Button, Input } from '@/kit';
import type {
  CreateInviteBody,
  CreateInviteResult,
  InviteCountry,
  InviteDeliveryChannel,
  InviteRoleGroup,
  InviteSummary,
} from '@/lib/types';
import { INVITE_COUNTRIES, INVITE_DELIVERY_CHANNELS, INVITE_ROLE_GROUPS } from '@/lib/types';
import { useCreateInvite, useInvites, useRevokeInvite } from '@/lib/use-invites';
import { type FormEvent, type ReactElement, type ReactNode, useState } from 'react';
import { DataTable, type DataTableColumn } from './DataTable';

interface FormState {
  email: string;
  display_name: string;
  role_groups: InviteRoleGroup[];
  delivery_channel: InviteDeliveryChannel;
  country: InviteCountry | '';
  notes: string;
}

const EMPTY_FORM: FormState = {
  email: '',
  display_name: '',
  role_groups: [],
  delivery_channel: 'copy_paste',
  country: '',
  notes: '',
};

const STATUS_TONE: Record<InviteSummary['status'], string> = {
  pending: 'border-primary/30 text-primary bg-primary/10',
  consumed: 'border-border text-muted-foreground bg-card',
  revoked: 'border-destructive/30 text-destructive bg-destructive/10',
  expired: 'border-border text-muted-foreground bg-card',
};

function StatusBadge({ status }: { status: InviteSummary['status'] }): ReactElement {
  return (
    <span
      className={`inline-block font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${STATUS_TONE[status]}`}
    >
      {status}
    </span>
  );
}

function renderOrDash(value: string | null | undefined): ReactNode {
  return value && value.trim().length > 0 ? (
    <span className="text-foreground">{value}</span>
  ) : (
    <span className="text-muted-foreground">—</span>
  );
}

const LIST_COLUMNS: ReadonlyArray<DataTableColumn<InviteSummary>> = [
  {
    key: 'email',
    label: 'Email',
    width: 'lg',
    render: (r) => <span className="text-foreground">{r.email}</span>,
  },
  {
    key: 'name',
    label: 'Name',
    width: 'md',
    render: (r) => renderOrDash(r.display_name),
  },
  {
    key: 'roles',
    label: 'Roles',
    render: (r) => (
      <span className="font-mono text-[10px] text-muted-foreground">
        {r.role_groups.join(', ')}
      </span>
    ),
  },
  {
    key: 'status',
    label: 'Status',
    width: 'sm',
    render: (r) => <StatusBadge status={r.status} />,
  },
  {
    key: 'expires',
    label: 'Expires',
    width: 'sm',
    render: (r) => (
      <time dateTime={r.expires_at} className="font-mono text-[10px] text-muted-foreground">
        {new Date(r.expires_at).toISOString().slice(0, 10)}
      </time>
    ),
  },
];

function FieldLabel({ htmlFor, children }: { htmlFor: string; children: ReactNode }): ReactElement {
  return (
    <label
      htmlFor={htmlFor}
      className="block font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
    >
      {children}
    </label>
  );
}

function CreatedNotice({ result }: { result: CreateInviteResult }): ReactElement {
  return (
    <div className="rounded-md border border-primary/30 bg-primary/10 px-4 py-3">
      <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
        Invite URL (shown once)
      </p>
      <p className="text-sm font-mono break-all m-0">{result.invite_url}</p>
      <p className="text-xs text-muted-foreground mt-2 m-0">
        Token prefix: {result.token_prefix} · expires{' '}
        {new Date(result.expires_at).toISOString().slice(0, 10)}
      </p>
    </div>
  );
}

interface NewInviteFormProps {
  onCreated: (result: CreateInviteResult) => void;
  lastCreated: CreateInviteResult | null;
}

function NewInviteForm({ onCreated, lastCreated }: NewInviteFormProps): ReactElement {
  const create = useCreateInvite();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const toggleRole = (g: InviteRoleGroup): void => {
    setForm((prev) => {
      const has = prev.role_groups.includes(g);
      const role_groups = has ? prev.role_groups.filter((x) => x !== g) : [...prev.role_groups, g];
      return { ...prev, role_groups };
    });
  };

  const onSubmit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    const body: CreateInviteBody = {
      email: form.email.trim().toLowerCase(),
      display_name: form.display_name.trim(),
      role_groups: form.role_groups,
      delivery_channel: form.delivery_channel,
      ...(form.country ? { country: form.country } : {}),
      ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
    };
    create.mutate(body, {
      onSuccess: (result) => {
        onCreated(result);
        setForm(EMPTY_FORM);
      },
    });
  };

  const canSubmit =
    form.email.trim().length > 0 &&
    form.display_name.trim().length > 0 &&
    form.role_groups.length > 0 &&
    !create.isPending;

  return (
    <section className="rounded-xl border border-border bg-card p-5 space-y-4">
      <header>
        <h2 className="font-display text-lg font-semibold text-foreground m-0">New invite</h2>
        <p className="text-xs text-muted-foreground mt-1 m-0">
          ADR-0035 invite-link flow. The plaintext URL is shown ONCE on create — copy it
          immediately. Token expires per service policy (default 7 days).
        </p>
      </header>

      <form onSubmit={onSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <FieldLabel htmlFor="invite-email">Email</FieldLabel>
          <Input
            id="invite-email"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="firstname.lastname@aiqadam.org"
            required
          />
        </div>

        <div className="space-y-1.5">
          <FieldLabel htmlFor="invite-display-name">Display name</FieldLabel>
          <Input
            id="invite-display-name"
            type="text"
            value={form.display_name}
            onChange={(e) => setForm({ ...form, display_name: e.target.value })}
            placeholder="Firstname Lastname"
            required
          />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <FieldLabel htmlFor="invite-roles">Role groups</FieldLabel>
          <div id="invite-roles" className="flex flex-wrap gap-1.5">
            {INVITE_ROLE_GROUPS.map((g) => {
              const active = form.role_groups.includes(g);
              return (
                <button
                  key={g}
                  type="button"
                  onClick={() => toggleRole(g)}
                  className={`font-mono text-[11px] px-2 py-1 rounded border transition-colors ${
                    active
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-card text-muted-foreground border-border hover:border-primary/40'
                  }`}
                >
                  {g}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-1.5">
          <FieldLabel htmlFor="invite-delivery">Delivery</FieldLabel>
          <select
            id="invite-delivery"
            value={form.delivery_channel}
            onChange={(e) =>
              setForm({ ...form, delivery_channel: e.target.value as InviteDeliveryChannel })
            }
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {INVITE_DELIVERY_CHANNELS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <FieldLabel htmlFor="invite-country">Country (optional)</FieldLabel>
          <select
            id="invite-country"
            value={form.country}
            onChange={(e) => setForm({ ...form, country: e.target.value as InviteCountry | '' })}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">— none —</option>
            {INVITE_COUNTRIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <FieldLabel htmlFor="invite-notes">Notes (optional)</FieldLabel>
          <textarea
            id="invite-notes"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={2}
            maxLength={2000}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </div>

        <div className="sm:col-span-2 flex items-center justify-end gap-2">
          {create.error && <p className="text-xs text-destructive m-0">{create.error.message}</p>}
          <Button type="submit" disabled={!canSubmit}>
            {create.isPending ? 'Creating…' : 'Create invite'}
          </Button>
        </div>
      </form>

      {lastCreated && <CreatedNotice result={lastCreated} />}
    </section>
  );
}

function ExistingInvitesTable(): ReactElement {
  const list = useInvites();
  const revoke = useRevokeInvite();

  const columns: DataTableColumn<InviteSummary>[] = [
    ...LIST_COLUMNS,
    {
      key: 'actions',
      label: '',
      align: 'right' as const,
      render: (r) =>
        r.status === 'pending' ? (
          <button
            type="button"
            onClick={() => revoke.mutate(r.id)}
            disabled={revoke.isPending}
            className="font-mono text-[10px] uppercase tracking-wider text-destructive hover:underline disabled:opacity-50"
          >
            Revoke
          </button>
        ) : null,
    },
  ];

  return (
    <section className="space-y-3">
      <header className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-foreground m-0">Existing invites</h2>
        {list.data && (
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            {list.data.invites.length} total
          </span>
        )}
      </header>

      <DataTable
        columns={columns}
        rows={list.data?.invites ?? []}
        rowKey={(r) => r.id}
        isLoading={list.isPending}
        errorMessage={list.error?.message ?? null}
        emptyHeading="No invites yet"
        emptyDescription="Create one above to get started."
      />
      {revoke.error && <p className="text-xs text-destructive">{revoke.error.message}</p>}
    </section>
  );
}

export function InvitesList(): ReactElement {
  const [lastCreated, setLastCreated] = useState<CreateInviteResult | null>(null);
  return (
    <div className="space-y-8">
      <NewInviteForm onCreated={setLastCreated} lastCreated={lastCreated} />
      <ExistingInvitesTable />
    </div>
  );
}

export default InvitesList;
