import type { ReactElement } from 'react';
import { inputStyle } from './styles';

export interface LongTextFieldProps {
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  placeholder?: string | undefined;
}

export default function LongTextField({
  value,
  onChange,
  disabled,
  placeholder,
}: LongTextFieldProps): ReactElement {
  return (
    <textarea
      rows={4}
      maxLength={2000}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      placeholder={placeholder}
      style={{ ...inputStyle, resize: 'vertical' }}
    />
  );
}
