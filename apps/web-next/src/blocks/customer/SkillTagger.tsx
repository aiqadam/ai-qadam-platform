// L3 block — <SkillTagger>.
//
// /me/profile skill-tag editor. Add via input + Enter; remove via
// per-chip × button. Skills surface to the member directory + drive
// event-invite targeting (country leads route the right invites to
// the right tags).
//
// Hook-driven: reads the full profile via useMyFullProfile, writes
// via useAddSkill / useRemoveSkill. Cache invalidation in the hook
// re-fetches the profile so all consumers see the new list.
//
// Wiring: docs/architecture/wiring-map.md → member_skills.

import { Button, Input } from '@/kit';
import { IslandRoot } from '@/lib/island-root';
import { useAddSkill, useMyFullProfile, useRemoveSkill } from '@/lib/use-me-profile';
import { type FormEvent, type ReactElement, useState } from 'react';

function SkillTaggerInner(): ReactElement {
  const profile = useMyFullProfile();
  const add = useAddSkill();
  const remove = useRemoveSkill();
  const [draft, setDraft] = useState('');

  if (profile.isPending) {
    return <p className="text-xs text-muted-foreground">Loading skills…</p>;
  }
  if (profile.error || !profile.data) {
    return (
      <p className="text-xs text-destructive">Skills unavailable. Reload the page to retry.</p>
    );
  }

  const skills = profile.data.skills;
  const busyAdd = add.isPending;
  const busyRemove = remove.isPending;
  const submitError = add.error?.message ?? remove.error?.message ?? null;

  const onSubmit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    const trimmed = draft.trim();
    if (trimmed.length < 2) return;
    add.mutate(trimmed, {
      onSuccess: () => setDraft(''),
    });
  };

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="px-5 py-4 border-b border-border">
        <h2 className="font-display text-lg font-semibold text-foreground">Skills</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Skill tags help country leads route the right invites and match you with relevant events.
          Lowercase, hyphen-separated.
        </p>
      </div>
      <div className="px-5 py-4">
        <div className="flex flex-wrap gap-2 mb-4 min-h-[28px]">
          {skills.length === 0 && (
            <span className="text-xs text-muted-foreground">
              No skills added yet. Try <code className="font-mono text-[11px]">llm-finetuning</code>
              , <code className="font-mono text-[11px]">mlops</code>,{' '}
              <code className="font-mono text-[11px]">computer-vision</code>.
            </span>
          )}
          {skills.map((s) => (
            <span
              key={s.id}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border bg-background text-xs"
            >
              {s.skill_tag}
              <button
                type="button"
                onClick={() => remove.mutate(s.id)}
                disabled={busyRemove}
                aria-label={`Remove ${s.skill_tag}`}
                className="text-muted-foreground hover:text-foreground transition-colors leading-none text-sm cursor-pointer"
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <form onSubmit={onSubmit} className="flex gap-2">
          <Input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="add a skill tag"
            maxLength={80}
            className="flex-1"
          />
          <Button type="submit" variant="outline" disabled={busyAdd || draft.trim().length < 2}>
            {busyAdd ? '…' : 'Add'}
          </Button>
        </form>
        {submitError && <p className="text-xs text-destructive mt-2">{submitError}</p>}
      </div>
    </div>
  );
}

export function SkillTagger(): ReactElement {
  return (
    <IslandRoot>
      <SkillTaggerInner />
    </IslandRoot>
  );
}

export default SkillTagger;
