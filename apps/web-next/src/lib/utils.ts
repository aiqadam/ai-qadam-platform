// L1 utility — `cn()` classname merger.
//
// Standard shadcn helper: clsx handles conditional + array inputs;
// tailwind-merge resolves Tailwind-class conflicts (later wins) so
// callers can pass an extra `className` prop without fighting variant
// classes. Five lines, zero ceremony, used by every atom in src/kit/.
//
// Per the PR-0c kickoff this is the only file the kit needs from
// src/lib/. The bigger L1 surface (apiClient, useAuth, query hooks)
// arrives in PR-0d and lives in src/lib/api-*.ts / src/lib/use-*.ts —
// arch-check restrictions only apply to those paths, not utils.ts.

import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
