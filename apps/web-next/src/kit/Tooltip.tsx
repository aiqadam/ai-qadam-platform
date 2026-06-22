// filepath: apps/web-next/src/kit/Tooltip.tsx
'use client';

import * as RadixTooltip from '@radix-ui/react-tooltip';
import { type ReactNode } from 'react';

/** Default animation delay before the tooltip appears (ms). Matches Radix recommended default. */
const DELAY_DURATION = 300;

/** Distance between the trigger edge and the tooltip (px). Radix recommended value. */
const SIDE_OFFSET = 4;

export interface TooltipProps {
  /** The tooltip content. Accepts string or ReactNode for rich content. */
  content: string | ReactNode;
  /** The child element that triggers the tooltip on hover/focus. */
  children: ReactNode;
  /** Which side the tooltip appears relative to the trigger. Defaults to 'top'. */
  side?: 'top' | 'right' | 'bottom' | 'left';
  /** How to align along the triggering edge. Defaults to 'center'. */
  align?: 'start' | 'center' | 'end';
}

/**
 * Lightweight accessible tooltip kit atom.
 * - Appears on pointer hover and keyboard focus.
 * - role="tooltip" + aria-describedby wired automatically by Radix.
 * - Viewport-boundary flipping is Radix default (avoid-collisions: true).
 */
export function Tooltip({ content, children, side = 'top', align = 'center' }: TooltipProps) {
  return (
    <RadixTooltip.Provider delayDuration={DELAY_DURATION}>
      <RadixTooltip.Root>
        <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
        <RadixTooltip.Portal>
          <RadixTooltip.Content side={side} align={align} sideOffset={SIDE_OFFSET}>
            {content}
            <RadixTooltip.Arrow />
          </RadixTooltip.Content>
        </RadixTooltip.Portal>
      </RadixTooltip.Root>
    </RadixTooltip.Provider>
  );
}
