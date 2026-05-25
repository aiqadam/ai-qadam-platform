// L2 atom — Input.
//
// Stock shadcn input. Uses the token-bridged `border-input`,
// `bg-background`, `placeholder:text-muted-foreground`, and the
// `ring`/`ring-offset-background` focus pair so the focused state
// matches the Button + Select rings. No variants — width is the caller's
// concern, height is fixed at h-10 to align with default-size Button.
//
// `type` defaults to "text" via the underlying `<input>`; pass type=
// for password / email / number etc. as you would on a native input.

import { cn } from '@/lib/utils';
import { type InputHTMLAttributes, forwardRef } from 'react';

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';
