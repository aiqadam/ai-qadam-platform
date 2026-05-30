// L3 workspace block — <SaveCohortModal>.
//
// Modal triggered from <MembersList>'s "Save as cohort" button. Captures
// a name + optional description and POSTs the operator's currently
// applied filter as a new cohort. On success, invalidates the cohorts
// list so <SavedCohortsPanel> picks the new entry up.
//
// Scope discipline (M2.3b-ii):
//   * No preview count — we don't want to call the cohort sample endpoint
//     which still has the industry/industry_tags field-name bug. The
//     operator already saw the filter's match count via the Members
//     table just above; saving it locks in that exact set.
//   * No load-back behavior — that lands with M2.3b-iii alongside the
//     inverse-mapping helper.

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from '@/kit';
import { IslandRoot } from '@/lib/island-root';
import { useSaveCohort } from '@/lib/use-cohorts';
import { type FormEvent, type ReactElement, useState } from 'react';

interface SaveCohortModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filterQuery: Record<string, unknown>;
}

function SaveCohortModalInner({
  open,
  onOpenChange,
  filterQuery,
}: SaveCohortModalProps): ReactElement {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const mutation = useSaveCohort();

  const trimmedName = name.trim();
  const canSubmit = trimmedName.length > 0 && !mutation.isPending;

  const handleSubmit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    if (!canSubmit) return;
    const trimmedDesc = description.trim();
    mutation.mutate(
      {
        name: trimmedName,
        ...(trimmedDesc.length > 0 ? { description: trimmedDesc } : {}),
        filter_query: filterQuery,
      },
      {
        onSuccess: () => {
          setName('');
          setDescription('');
          onOpenChange(false);
        },
      },
    );
  };

  const handleOpenChange = (next: boolean): void => {
    if (mutation.isPending) return;
    if (!next) {
      setName('');
      setDescription('');
      mutation.reset();
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save as cohort</DialogTitle>
          <DialogDescription>
            Cohorts are named, reusable filter sets — use them in announcements + sponsor analytics
            without re-typing the filter.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1">
            <label htmlFor="cohort-name" className="text-xs font-medium text-foreground">
              Name
            </label>
            <Input
              id="cohort-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="UZ AI engineers, 90d active"
              required
              maxLength={120}
              autoFocus
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="cohort-description" className="text-xs font-medium text-foreground">
              Description <span className="text-muted-foreground">(optional)</span>
            </label>
            <textarea
              id="cohort-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Who's in this cohort + why we built it."
              maxLength={2000}
              rows={3}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          {mutation.error ? (
            <p className="text-xs text-destructive" role="alert">
              Couldn't save cohort: {mutation.error.message}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={mutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {mutation.isPending ? 'Saving…' : 'Save cohort'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SaveCohortModal(props: SaveCohortModalProps): ReactElement {
  return (
    <IslandRoot>
      <SaveCohortModalInner {...props} />
    </IslandRoot>
  );
}
