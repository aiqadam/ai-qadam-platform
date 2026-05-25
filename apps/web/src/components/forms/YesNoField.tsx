import type { ReactElement } from 'react';

export interface YesNoFieldProps {
  value: boolean | undefined;
  onChange: (v: boolean) => void;
  disabled: boolean;
}

export default function YesNoField({ value, onChange, disabled }: YesNoFieldProps): ReactElement {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {[
        { v: true, label: 'Yes' },
        { v: false, label: 'No' },
      ].map(({ v, label }) => (
        <button
          key={label}
          type="button"
          disabled={disabled}
          onClick={() => onChange(v)}
          style={{
            minWidth: 80,
            padding: '10px 16px',
            borderRadius: 10,
            border: '1px solid var(--border)',
            background: value === v ? 'var(--primary)' : 'transparent',
            color: value === v ? 'var(--primary-foreground)' : 'var(--foreground)',
            fontSize: 14,
            fontWeight: 500,
            cursor: disabled ? 'not-allowed' : 'pointer',
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
