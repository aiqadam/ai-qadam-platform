// Shared visual tokens for the public form-renderer field components.
// Kept centralized so all 6 field types stay visually coherent without
// each component duplicating the same inline-style block.

import type { CSSProperties } from 'react';

export const inputStyle: CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: 'var(--background)',
  color: 'var(--foreground)',
  fontFamily: 'inherit',
  fontSize: 14,
};
