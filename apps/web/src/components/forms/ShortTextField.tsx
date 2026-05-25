import type { ReactElement } from 'react';
import { inputStyle } from './styles';

export interface ShortTextFieldProps {
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  placeholder?: string | undefined;
}

export default function ShortTextField({
  value,
  onChange,
  disabled,
  placeholder,
}: ShortTextFieldProps): ReactElement {
  return (
    <input
      type="text"
      maxLength={200}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      placeholder={placeholder}
      style={inputStyle}
    />
  );
}
