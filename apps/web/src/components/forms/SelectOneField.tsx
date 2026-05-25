import type { ReactElement } from 'react';

export interface SelectOneFieldProps {
  options: Array<{ value: string; label: string }>;
  value: string | undefined;
  onChange: (v: string) => void;
  disabled: boolean;
  fieldKey: string;
}

export default function SelectOneField({
  options,
  value,
  onChange,
  disabled,
  fieldKey,
}: SelectOneFieldProps): ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {options.map((opt) => (
        <label
          key={opt.value}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            cursor: disabled ? 'not-allowed' : 'pointer',
          }}
        >
          <input
            type="radio"
            name={fieldKey}
            value={opt.value}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
            disabled={disabled}
          />
          <span>{opt.label}</span>
        </label>
      ))}
    </div>
  );
}
