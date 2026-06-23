// L3 workspace atom — <FilterChip>.
//
// Small toggle chip for filter bars in AuditLogList, EventsList, and
// MembersList. Pure presentation; no fetch. Originally inlined in
// AuditLogList and EventsList; extracted here for reuse.

import { type ReactElement, type ReactNode } from 'react';

export interface FilterChipProps {
  /** When true, the chip renders in the "active" style. */
  active: boolean;
  /** Called when the operator clicks the chip. */
  onClick: () => void;
  /** Label text rendered inside the chip. */
  children: ReactNode;
}

export function FilterChip({ active, onClick, children }: FilterChipProps): ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`font-mono text-[11px] px-2 py-1 rounded border transition-colors ${
        active
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-card text-muted-foreground border-border hover:border-primary/40'
      }`}
    >
      {children}
    </button>
  );
}
