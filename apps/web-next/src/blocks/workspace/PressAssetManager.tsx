// L3 workspace block — <PressAssetManager>.
//
// Operator cabinet for /workspace/press (FR-MIG-026).
// Three independent Form sections:
//   A. Press page prose — hero title, boilerplate, SEO description,
//      contact SLA, contact guidance (press_page singleton).
//   B. Team bios — repeater: add / edit / soft-delete team_members rows.
//   C. Platform stats — countries_served + default_description
//      (site_settings singleton, reusing updateSiteSettings).
//
// MinIO media-asset upload is deferred (noted in handoff.yaml deferrals).
// Changes reflect immediately on /press via SSR fetch-on-load.
//
// Auth gate is in the parent .astro page (super-admin role).

'use client';

import { Button } from '@/kit';
import type { PressPage, SiteSettings, TeamMember } from '@/lib/cms';
import {
  createTeamMember,
  deleteTeamMember,
  updatePressPage,
  updateTeamMember,
} from '@/lib/cms';
import { updateSiteSettings } from '@/lib/cms';
import { IslandRoot } from '@/lib/island-root';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import { type ReactElement, useState } from 'react';
import { z } from 'zod';
import { Form } from './Form';

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const pressPageSchema = z.object({
  heroTitle: z.string().min(1, 'Hero title is required'),
  companyBoilerplate: z.string().min(1, 'Boilerplate is required'),
  seoDescription: z.string().min(1, 'SEO description is required'),
  contactResponseSla: z.string().min(1, 'Response SLA text is required'),
  contactGuidance: z.string().min(1, 'Contact guidance is required'),
});

const TEAM_MEMBER_ROLES = [
  'founder',
  'coo',
  'country_lead',
  'advisor',
  'organizer',
  'staff',
  'other',
] as const;

const teamMemberSchema = z.object({
  name: z.string().min(1, 'Name is required').max(120, 'Name must be ≤ 120 characters'),
  title: z.string().min(1, 'Title is required').max(120, 'Title must be ≤ 120 characters'),
  role: z.enum(TEAM_MEMBER_ROLES),
  bioMd: z.string().max(2000, 'Bio must be ≤ 2000 characters').or(z.literal('')),
  displayOrder: z.coerce.number().int().min(0).max(999),
});

const statsSchema = z.object({
  countriesServed: z.coerce.number().int().min(1, 'Must be ≥ 1').max(99, 'Must be ≤ 99'),
  defaultDescription: z.string().min(1, 'Description is required'),
});

type PressPageValues = z.infer<typeof pressPageSchema>;
type TeamMemberValues = z.infer<typeof teamMemberSchema>;
type StatsValues = z.infer<typeof statsSchema>;

// ─── Section A: Press page prose ─────────────────────────────────────────────

interface PressProseSectionProps {
  initial: PressPage;
}

function PressProseSection({ initial }: PressProseSectionProps): ReactElement {
  const [pending, setPending] = useState(false);

  const defaults: PressPageValues = {
    heroTitle: initial.heroTitle,
    companyBoilerplate: initial.companyBoilerplate,
    seoDescription: initial.seoDescription,
    contactResponseSla: initial.contactResponseSla,
    contactGuidance: initial.contactGuidance,
  };

  async function handleSubmit(data: PressPageValues): Promise<void> {
    setPending(true);
    try {
      await updatePressPage(data);
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="border-b pb-1">
        <h2 className="font-display text-lg font-semibold">Press page prose</h2>
        <p className="text-sm text-muted-foreground">
          Hero title, boilerplate, SEO description, and contact guidance shown on{' '}
          <a href="/press" className="text-primary hover:underline">
            /press
          </a>
          .
        </p>
      </div>
      <Form
        schema={pressPageSchema}
        defaultValues={defaults}
        onSubmit={handleSubmit}
        isPending={pending}
      />
    </section>
  );
}

// ─── Section B: Team bios ─────────────────────────────────────────────────────

interface TeamMemberRowProps {
  member: TeamMember;
  onSaved: (updated: TeamMember) => void;
  onDeleted: (id: string) => void;
}

function TeamMemberRow({ member, onSaved, onDeleted }: TeamMemberRowProps): ReactElement {
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);

  const defaults: TeamMemberValues = {
    name: member.name,
    title: member.title,
    role: member.role,
    bioMd: member.bioMd ?? '',
    displayOrder: member.displayOrder,
  };

  async function handleUpdate(data: TeamMemberValues): Promise<void> {
    setPending(true);
    try {
      await updateTeamMember(member.id, {
        name: data.name,
        title: data.title,
        role: data.role,
        bioMd: data.bioMd || null,
        displayOrder: data.displayOrder,
      });
      onSaved({ ...member, ...data, bioMd: data.bioMd || null });
      setEditing(false);
    } finally {
      setPending(false);
    }
  }

  async function handleDelete(): Promise<void> {
    setPending(true);
    try {
      await deleteTeamMember(member.id);
      onDeleted(member.id);
    } finally {
      setPending(false);
    }
  }

  if (editing) {
    return (
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="font-display text-sm font-semibold">Edit: {member.name}</span>
          <button
            type="button"
            onClick={() => setEditing(false)}
            aria-label="Cancel edit"
            className="text-muted-foreground hover:text-foreground transition-colors p-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <Form
          schema={teamMemberSchema}
          defaultValues={defaults}
          onSubmit={handleUpdate}
          isPending={pending}
        />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
      <div>
        <p className="font-display text-sm font-semibold">{member.name}</p>
        <p className="font-mono text-xs text-muted-foreground">
          {member.title} · {member.role} · order {member.displayOrder}
        </p>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setEditing(true)}
          disabled={pending}
          aria-label={`Edit ${member.name}`}
          className="text-muted-foreground hover:text-foreground transition-colors p-1"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={pending}
          aria-label={`Remove ${member.name}`}
          className="text-muted-foreground hover:text-destructive transition-colors p-1"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

interface TeamBiosSectionProps {
  initialMembers: TeamMember[];
}

const NEW_MEMBER_DEFAULTS: TeamMemberValues = {
  name: '',
  title: '',
  role: 'other',
  bioMd: '',
  displayOrder: 100,
};

function TeamBiosSection({ initialMembers }: TeamBiosSectionProps): ReactElement {
  const [members, setMembers] = useState(initialMembers);
  const [addingNew, setAddingNew] = useState(false);
  const [pending, setPending] = useState(false);

  function handleSaved(updated: TeamMember): void {
    setMembers((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
  }

  function handleDeleted(id: string): void {
    setMembers((prev) => prev.filter((m) => m.id !== id));
  }

  async function handleCreate(data: TeamMemberValues): Promise<void> {
    setPending(true);
    try {
      const id = await createTeamMember({
        name: data.name,
        title: data.title,
        role: data.role,
        bioMd: data.bioMd || null,
        displayOrder: data.displayOrder,
      });
      setMembers((prev) => [
        ...prev,
        { id, name: data.name, title: data.title, role: data.role, bioMd: data.bioMd || null, displayOrder: data.displayOrder },
      ]);
      setAddingNew(false);
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="border-b pb-1">
        <h2 className="font-display text-lg font-semibold">Team bios</h2>
        <p className="text-sm text-muted-foreground">
          Leadership and team bios shown in the press page leadership grid.
        </p>
      </div>

      <div className="space-y-2">
        {members.length === 0 && (
          <p className="text-sm text-muted-foreground">No team members yet.</p>
        )}
        {members.map((m) => (
          <TeamMemberRow key={m.id} member={m} onSaved={handleSaved} onDeleted={handleDeleted} />
        ))}
      </div>

      {addingNew ? (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-display text-sm font-semibold">Add team member</span>
            <button
              type="button"
              onClick={() => setAddingNew(false)}
              aria-label="Cancel add"
              className="text-muted-foreground hover:text-foreground transition-colors p-1"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <Form
            schema={teamMemberSchema}
            defaultValues={NEW_MEMBER_DEFAULTS}
            onSubmit={handleCreate}
            isPending={pending}
          />
        </div>
      ) : (
        <Button type="button" variant="outline" size="sm" onClick={() => setAddingNew(true)}>
          <Plus className="mr-1 h-4 w-4" />
          Add team member
        </Button>
      )}
    </section>
  );
}

// ─── Section C: Platform stats ────────────────────────────────────────────────

interface StatsSectionProps {
  initial: SiteSettings;
}

function StatsSection({ initial }: StatsSectionProps): ReactElement {
  const [pending, setPending] = useState(false);

  const defaults: StatsValues = {
    countriesServed: initial.countriesServed,
    defaultDescription: initial.defaultDescription,
  };

  async function handleSubmit(data: StatsValues): Promise<void> {
    setPending(true);
    try {
      await updateSiteSettings({
        countriesServed: data.countriesServed,
        defaultDescription: data.defaultDescription,
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="border-b pb-1">
        <h2 className="font-display text-lg font-semibold">Platform stats</h2>
        <p className="text-sm text-muted-foreground">
          Countries served count and default site description (used in SEO meta and OG tags).
        </p>
      </div>
      <Form
        schema={statsSchema}
        defaultValues={defaults}
        onSubmit={handleSubmit}
        isPending={pending}
      />
    </section>
  );
}

// ─── Main orchestrator ────────────────────────────────────────────────────────

export interface PressAssetManagerProps {
  pressPage: PressPage;
  teamMembers: TeamMember[];
  siteSettings: SiteSettings;
}

export function PressAssetManager({
  pressPage,
  teamMembers,
  siteSettings,
}: PressAssetManagerProps): ReactElement {
  return (
    <IslandRoot>
      <div className="space-y-10">
        <PressProseSection initial={pressPage} />
        <TeamBiosSection initialMembers={teamMembers} />
        <StatsSection initial={siteSettings} />
      </div>
    </IslandRoot>
  );
}
