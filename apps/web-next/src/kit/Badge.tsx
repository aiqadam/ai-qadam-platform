// L2 atom — Badge.
//
// Compact pill for status / tag / count usage (e.g. "Live", "Draft",
// "12 unread"). Five variants matching the design-system semantic
// colors (default, secondary, destructive, outline, success) — pick
// the one that matches the meaning, not the color you want.
//
// Smaller surface than Button on purpose: badges don't have sizes
// (callers nudge with text-xs/text-sm in `className` if needed) and
// don't have asChild (badges are not interactive in the catalogue —
// if you need a clickable pill, use Button variant="outline" size="sm").

import { cn } from '@/lib/utils';
import { type VariantProps, cva } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground hover:bg-primary/80',
        secondary:
          'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
        destructive:
          'border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80',
        outline: 'text-foreground',
        success: 'border-transparent bg-success text-success-foreground hover:bg-success/80',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { badgeVariants };
