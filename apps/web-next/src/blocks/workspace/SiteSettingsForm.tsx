// L3 workspace block — <SiteSettingsForm>.
//
// Homepage singleton editor: three independent Form sections backed by
// updateSiteSettings() (PATCH /items/site_settings).
//   A. Hero — headline, subheadline, CTA label + URL
//   B. Footer Links — add/remove/reorder repeater
//   C. Contact / Social — flat URL + email fields
//
// FR-MIG-024. Auth gate is in the parent .astro page (operator role).

'use client';

import { Button, Input } from '@/kit';
import type { SiteSettings } from '@/lib/cms';
import { updateSiteSettings } from '@/lib/cms';
import { IslandRoot } from '@/lib/island-root';
import { Plus, X } from 'lucide-react';
import { type ReactElement, useState } from 'react';
import { z } from 'zod';
import { ActionBar } from './ActionBar';
import { Form } from './Form';

// ─── Zod schemas per section ───────────────────────────────────────────────────

const heroSchema = z.object({
  heroHeadline: z.string().min(1, 'Headline is required'),
  defaultDescription: z.string().min(1, 'Subheadline is required'),
  heroCtaLabel: z.string().min(1, 'CTA label is required'),
  heroCtaUrl: z.string().url('Must be a valid URL'),
});

const contactSchema = z.object({
  telegramUrl: z.string().url('Must be a valid URL').or(z.literal('')),
  twitterUrl: z.string().url('Must be a valid URL').or(z.literal('')),
  linkedinUrl: z.string().url('Must be a valid URL').or(z.literal('')),
  instagramUrl: z.string().url('Must be a valid URL').or(z.literal('')),
  youtubeUrl: z.string().url('Must be a valid URL').or(z.literal('')),
  contactEmailPartners: z.string().email('Must be a valid email').or(z.literal('')),
  contactEmailPress: z.string().email('Must be a valid email').or(z.literal('')),
  contactEmailSupport: z.string().email('Must be a valid email').or(z.literal('')),
});

// SECURITY: INV-4 — footer links must be validated before PATCH.
// Each link: label ≤ 100 chars, url must be valid URL or empty.
const footerLinksSchema = z
  .array(
    z.object({
      label: z.string().max(100, 'Label must be ≤ 100 characters'),
      url: z.string().url('Must be a valid URL').or(z.literal('')),
    }),
  )
  .max(20, 'Maximum 20 footer links allowed');

type HeroValues = z.infer<typeof heroSchema>;
type ContactValues = z.infer<typeof contactSchema>;
type FooterLink = z.infer<typeof footerLinksSchema>[number];

// ─── Section A: Hero ───────────────────────────────────────────────────────────

interface HeroSectionProps {
  initial: SiteSettings;
}

function HeroSection({ initial }: HeroSectionProps): ReactElement {
  const [pending, setPending] = useState(false);

  const defaults: HeroValues = {
    heroHeadline: initial.heroHeadline ?? '',
    defaultDescription: initial.defaultDescription,
    heroCtaLabel: initial.heroCtaLabel ?? '',
    heroCtaUrl: initial.heroCtaUrl ?? '',
  };

  async function handleSubmit(data: HeroValues): Promise<void> {
    setPending(true);
    try {
      await updateSiteSettings(data);
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="border-b pb-1">
        <h2 className="text-lg font-display font-semibold">Homepage Hero</h2>
        <p className="text-sm text-muted-foreground">
          Headline, subheadline, and call-to-action shown on the public homepage.
        </p>
      </div>
      <Form
        schema={heroSchema}
        defaultValues={defaults}
        onSubmit={handleSubmit}
        isPending={pending}
      />
    </section>
  );
}

// ─── Section C: Contact & Social ───────────────────────────────────────────────

interface ContactSectionProps {
  initial: SiteSettings;
}

function ContactSection({ initial }: ContactSectionProps): ReactElement {
  const [pending, setPending] = useState(false);

  const defaults: ContactValues = {
    telegramUrl: initial.telegramUrl ?? '',
    twitterUrl: initial.twitterUrl ?? '',
    linkedinUrl: initial.linkedinUrl ?? '',
    instagramUrl: initial.instagramUrl ?? '',
    youtubeUrl: initial.youtubeUrl ?? '',
    contactEmailPartners: initial.contactEmailPartners ?? '',
    contactEmailPress: initial.contactEmailPress ?? '',
    contactEmailSupport: initial.contactEmailSupport ?? '',
  };

  async function handleSubmit(data: ContactValues): Promise<void> {
    setPending(true);
    try {
      await updateSiteSettings(data);
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="border-b pb-1">
        <h2 className="text-lg font-display font-semibold">Contact &amp; Social</h2>
        <p className="text-sm text-muted-foreground">
          Telegram, Twitter / X, LinkedIn, Instagram, YouTube, and contact email addresses.
        </p>
      </div>
      <Form
        schema={contactSchema}
        defaultValues={defaults}
        onSubmit={handleSubmit}
        isPending={pending}
      />
    </section>
  );
}

// ─── Footer links editor ───────────────────────────────────────────────────────

interface FooterLinksEditorProps {
  links: FooterLink[];
  onChange: (links: FooterLink[]) => void;
  disabled?: boolean;
}

function FooterLinksEditor({ links, onChange, disabled }: FooterLinksEditorProps): ReactElement {
  function addLink(): void {
    onChange([...links, { label: '', url: '' }]);
  }

  function removeLink(index: number): void {
    onChange(links.filter((_, i) => i !== index));
  }

  function updateLink(index: number, field: 'label' | 'url', value: string): void {
    const next = links.map((link, i) => (i === index ? { ...link, [field]: value } : link));
    onChange(next);
  }

  // Stable key: label+url prevents empty-string collision on repeated adds.
  function rowKey(index: number, link: { label: string; url: string }): string {
    return `${index}-${link.label}-${link.url}`;
  }

  return (
    <div className="space-y-3">
      {links.length === 0 && <p className="text-sm text-muted-foreground">No footer links yet.</p>}

      <div className="border rounded-md">
        {/* Header row */}
        <div className="grid grid-cols-[1fr_1fr_auto] gap-2 px-3 py-2 border-b bg-muted/40">
          <span className="block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Label
          </span>
          <span className="block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            URL
          </span>
          <span className="sr-only">Actions</span>
        </div>

        {/* Data rows */}
        {links.map((link, index) => (
          <div
            key={rowKey(index, link)}
            className="grid grid-cols-[1fr_1fr_auto] gap-2 px-3 py-2 items-center border-b last:border-b-0"
          >
            <Input
              type="text"
              placeholder="e.g. About"
              value={link.label}
              onChange={(e) => updateLink(index, 'label', e.target.value)}
              disabled={disabled}
              aria-label={`Footer link ${index + 1} label`}
            />
            <Input
              type="url"
              placeholder="https://"
              value={link.url}
              onChange={(e) => updateLink(index, 'url', e.target.value)}
              disabled={disabled}
              aria-label={`Footer link ${index + 1} URL`}
            />
            <button
              type="button"
              onClick={() => removeLink(index)}
              disabled={disabled}
              aria-label={`Remove footer link ${index + 1}`}
              className="text-muted-foreground hover:text-destructive transition-colors p-1"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      <Button type="button" variant="outline" size="sm" onClick={addLink} disabled={disabled}>
        <Plus className="h-4 w-4 mr-1" />
        Add link
      </Button>
    </div>
  );
}

// ─── Section B: Footer Links ───────────────────────────────────────────────────

interface FooterSectionProps {
  initial: SiteSettings;
}

function FooterSection({ initial }: FooterSectionProps): ReactElement {
  const [pending, setPending] = useState(false);
  const [links, setLinks] = useState<FooterLink[]>(initial.footerLinks ?? []);

  async function handleSave(): Promise<void> {
    // SECURITY INV-4: validate against footerLinksSchema before PATCH.
    // parse() throws ZodError on invalid — caught by react-hook-form / caught here.
    footerLinksSchema.parse(links);
    setPending(true);
    try {
      await updateSiteSettings({ footerLinks: links });
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="border-b pb-1">
        <h2 className="text-lg font-display font-semibold">Footer Links</h2>
        <p className="text-sm text-muted-foreground">
          Links shown in the site footer. Add or remove rows below.
        </p>
      </div>

      <FooterLinksEditor links={links} onChange={setLinks} disabled={pending} />

      <ActionBar
        actions={[
          {
            label: 'Save',
            onClick: handleSave,
            loading: pending,
            disabled: links.length === 0,
          },
        ]}
      />
    </section>
  );
}

// ─── Main orchestrator ───────────────────────────────────────────────────────

export function SiteSettingsForm({
  initial,
}: {
  initial: SiteSettings;
}): ReactElement {
  return (
    <IslandRoot>
      <div className="space-y-10">
        <HeroSection initial={initial} />
        <FooterSection initial={initial} />
        <ContactSection initial={initial} />
      </div>
    </IslandRoot>
  );
}
