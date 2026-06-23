// L3 workspace block — <ActionBar>.
//
// Consistent top-of-page action row for operator cabinets. Renders a
// horizontal bar of <Button> variants with independent loading/disabled
// states. Optional confirmation dialog before firing onClick. Optional
// sticky mode pins the bar to the top of the page body on scroll.
//
// AGENTS.md §5: Presentation-only — no direct API calls inside the block.

'use client';

import { Button } from '@/kit';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/kit/Dialog';
import { IslandRoot } from '@/lib/island-root';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';
import { type ReactElement, useEffect, useRef, useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ActionVariant = 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';

export interface Action {
  label: string;
  onClick: () => void | Promise<void>;
  variant?: ActionVariant;
  /** Replaces label with a spinner and disables the button */
  loading?: boolean | undefined;
  /** Prevents the button from firing */
  disabled?: boolean | undefined;
  /** Shows a confirmation dialog before executing onClick */
  confirm?: {
    title: string;
    description: string;
    confirmLabel?: string;
    cancelLabel?: string;
  };
}

export interface ActionBarProps {
  /** Ordered list of actions rendered left-to-right */
  actions: Action[];
  /** Pins the bar to the top of the page body on scroll */
  sticky?: boolean | undefined;
  /** Extra class(es) on the root element */
  className?: string;
}

// ─── Confirmation helpers ──────────────────────────────────────────────────────

interface ConfirmDialogProps {
  action: Action;
  children: ReactElement;
}

function ConfirmDialog({ action, children }: ConfirmDialogProps): ReactElement {
  const { confirm } = action;
  if (!confirm) return children;

  const [open, setOpen] = useState(false);

  function handleConfirm(): void {
    setOpen(false);
    action.onClick();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{confirm.title}</DialogTitle>
          <DialogDescription>{confirm.description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">{confirm.cancelLabel ?? 'Cancel'}</Button>
          </DialogClose>
          <Button
            variant={action.variant === 'destructive' ? 'destructive' : 'default'}
            onClick={handleConfirm}
          >
            {confirm.confirmLabel ?? 'Confirm'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Single action button ──────────────────────────────────────────────────────

interface ActionButtonProps {
  action: Action;
}

function ActionButton({ action }: ActionButtonProps): ReactElement {
  const { label, variant = 'default', loading, disabled, confirm } = action;

  const button = (
    <Button
      variant={variant}
      disabled={disabled || loading}
      className={cn(loading && 'relative')}
      onClick={confirm ? undefined : action.onClick}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {!loading && label}
    </Button>
  );

  if (confirm) {
    return <ConfirmDialog action={action}>{button}</ConfirmDialog>;
  }

  return button;
}

// ─── Sticky sentinel ──────────────────────────────────────────────────────────

interface StickyBarInnerProps {
  actions: Action[];
  className?: string | undefined;
}

function StickyBarInner({ actions, className }: StickyBarInnerProps): ReactElement {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry) setStuck(!entry.isIntersecting);
      },
      { threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div ref={sentinelRef} aria-hidden className="h-px" />
      <div
        className={cn(
          'flex items-center gap-3 py-3 border-b bg-background transition-shadow',
          stuck && 'sticky top-0 z-10 shadow-sm',
          className,
        )}
      >
        {actions.map((action) => (
          <ActionButton key={action.label} action={action} />
        ))}
      </div>
    </>
  );
}

// ─── Non-sticky variant ────────────────────────────────────────────────────────

interface NonStickyBarProps {
  actions: Action[];
  className?: string | undefined;
}

function NonStickyBar({ actions, className }: NonStickyBarProps): ReactElement {
  return (
    <div className={cn('flex items-center gap-3 py-3 border-b', className)}>
      {actions.map((action) => (
        <ActionButton key={action.label} action={action} />
      ))}
    </div>
  );
}

// ─── Public API ────────────────────────────────────────────────────────────────

export function ActionBar({ actions, sticky, className }: ActionBarProps): ReactElement {
  if (sticky) {
    return <StickyBarInner actions={actions} className={className} />;
  }
  return <NonStickyBar actions={actions} className={className} />;
}

/** Island-wrapped export — use this when the parent page needs client:load */
export function ActionBarIsland(props: ActionBarProps): ReactElement {
  return (
    <IslandRoot>
      <ActionBar {...props} />
    </IslandRoot>
  );
}
