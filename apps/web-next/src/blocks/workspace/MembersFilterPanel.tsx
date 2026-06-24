// L3 workspace block — <MembersFilterPanel>.
//
// Filter sheet for the Members cabinet (M2.3a). Holds a DRAFT copy of
// the 7 filter primitives; Apply commits the draft to the parent.
//
// FR-MIG-029 adds the "Save as segment" inline section: a toggle that
// reveals a name input + segment type selector. On submit the panel
// calls `onSaveSegment` which the parent wires to useCreateSegment.

import {
  Button,
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
  Input,
} from '@/kit';
import { type MemberFilters, SENIORITY_OPTIONS, countActiveFilters } from '@/lib/member-filters';
import { CONSENT_PURPOSES, COUNTRY_CODES, SEGMENT_TYPES, type SegmentType } from '@/lib/types';
import { type ReactElement, type ReactNode, useState } from 'react';

interface Props {
  applied: MemberFilters;
  onApply: (next: MemberFilters) => void;
  filterQuery: Record<string, unknown>;
  onSaveSegment: (name: string, type: SegmentType) => void;
  isSavingSegment: boolean;
}

const SELECT_CLASS =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

const SEGMENT_TYPE_LABELS: Record<SegmentType, string> = {
  announcement: 'Announcement',
  telegram: 'Telegram',
  both: 'Both',
};

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}): ReactElement {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={htmlFor}
        className="block font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
      >
        {label}
      </label>
      {children}
    </div>
  );
}

export function MembersFilterPanel({
  applied,
  onApply,
  filterQuery,
  onSaveSegment,
  isSavingSegment,
}: Props): ReactElement {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<MemberFilters>(applied);
  const [saveOpen, setSaveOpen] = useState(false);
  const [segmentName, setSegmentName] = useState('');
  const [segmentType, setSegmentType] = useState<SegmentType>('announcement');
  const activeCount = countActiveFilters(applied);
  const hasFilter = Object.keys(filterQuery).length > 0;

  const onOpenChange = (next: boolean): void => {
    if (next) setDraft(applied);
    setOpen(next);
  };

  const set = <K extends keyof MemberFilters>(k: K, v: MemberFilters[K]): void =>
    setDraft((prev) => ({ ...prev, [k]: v }));

  const apply = (): void => {
    onApply(draft);
    setOpen(false);
  };

  const reset = (): void => {
    const cleared: MemberFilters = {
      country: '',
      seniority: '',
      industry: '',
      interest: '',
      employer: '',
      attendedMin: '',
      consent: '',
    };
    setDraft(cleared);
    onApply(cleared);
    setOpen(false);
  };

  const handleToggleSave = (): void => {
    setSaveOpen((prev) => !prev);
    setSegmentName('');
    setSegmentType('announcement');
  };

  const handleSaveSegment = (): void => {
    const name = segmentName.trim();
    if (!name) return;
    onSaveSegment(name, segmentType);
    setSaveOpen(false);
    setSegmentName('');
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerTrigger asChild>
        <Button variant="outline">Filters{activeCount > 0 ? ` (${activeCount})` : ''}</Button>
      </DrawerTrigger>
      <DrawerContent side="right" className="w-full max-w-md overflow-y-auto">
        <DrawerHeader>
          <DrawerTitle>Filter members</DrawerTitle>
          <DrawerDescription>
            Each filter maps to a Directus clause — the same shape a saved cohort stores.
          </DrawerDescription>
        </DrawerHeader>

        <div className="flex-1 space-y-4">
          <Field label="Country" htmlFor="mf-country">
            <select
              id="mf-country"
              value={draft.country}
              onChange={(e) => set('country', e.target.value)}
              className={SELECT_CLASS}
            >
              <option value="">— any —</option>
              {COUNTRY_CODES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Seniority" htmlFor="mf-seniority">
            <select
              id="mf-seniority"
              value={draft.seniority}
              onChange={(e) => set('seniority', e.target.value)}
              className={SELECT_CLASS}
            >
              <option value="">— any —</option>
              {SENIORITY_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Industry (contains)" htmlFor="mf-industry">
            <Input
              id="mf-industry"
              value={draft.industry}
              onChange={(e) => set('industry', e.target.value)}
              placeholder="e.g. fintech"
            />
          </Field>

          <Field label="Interest tag" htmlFor="mf-interest">
            <Input
              id="mf-interest"
              value={draft.interest}
              onChange={(e) => set('interest', e.target.value)}
              placeholder="e.g. llm-finetuning"
            />
          </Field>

          <Field label="Current employer (contains)" htmlFor="mf-employer">
            <Input
              id="mf-employer"
              value={draft.employer}
              onChange={(e) => set('employer', e.target.value)}
              placeholder="e.g. acme"
            />
          </Field>

          <Field label="Min events attended" htmlFor="mf-attended">
            <Input
              id="mf-attended"
              type="number"
              min={1}
              value={draft.attendedMin}
              onChange={(e) => set('attendedMin', e.target.value)}
            />
          </Field>

          <Field label="Active consent purpose" htmlFor="mf-consent">
            <select
              id="mf-consent"
              value={draft.consent}
              onChange={(e) => set('consent', e.target.value)}
              className={SELECT_CLASS}
            >
              <option value="">— any —</option>
              {CONSENT_PURPOSES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Field>

          <div className="border-t border-border pt-4 space-y-3">
            <div className="flex items-center gap-2">
              <input
                id="mf-save-toggle"
                type="checkbox"
                checked={saveOpen}
                onChange={handleToggleSave}
                disabled={!hasFilter}
                className="h-4 w-4 rounded border border-input accent-primary"
              />
              <label
                htmlFor="mf-save-toggle"
                className="text-sm text-foreground cursor-pointer select-none"
                title={hasFilter ? undefined : 'Apply at least one filter to save a segment'}
              >
                Save as segment
              </label>
            </div>

            {saveOpen && (
              <div className="space-y-3 pl-6">
                <Field label="Segment name" htmlFor="mf-segment-name">
                  <Input
                    id="mf-segment-name"
                    value={segmentName}
                    onChange={(e) => setSegmentName(e.target.value)}
                    placeholder="UZ AI engineers, senior+"
                    maxLength={120}
                    autoFocus
                  />
                </Field>

                <Field label="Segment type" htmlFor="mf-segment-type">
                  <select
                    id="mf-segment-type"
                    value={segmentType}
                    onChange={(e) => setSegmentType(e.target.value as SegmentType)}
                    className={SELECT_CLASS}
                  >
                    {SEGMENT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {SEGMENT_TYPE_LABELS[t]}
                      </option>
                    ))}
                  </select>
                </Field>

                <Button
                  type="button"
                  size="sm"
                  disabled={segmentName.trim().length === 0 || isSavingSegment}
                  onClick={handleSaveSegment}
                >
                  {isSavingSegment ? 'Saving…' : 'Save segment'}
                </Button>
              </div>
            )}
          </div>
        </div>

        <DrawerFooter>
          <Button variant="outline" onClick={reset}>
            Reset
          </Button>
          <Button onClick={apply}>Apply</Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

export default MembersFilterPanel;
