import type { ReactElement, ReactNode } from 'react';

// Shared <fieldset> + <legend> wrapper for every field-type
// component. Pulls the required-asterisk rendering + spacing into one
// place so per-type components only render their input control.

export interface FieldBlockProps {
  label: string;
  // `| undefined` for the strict exactOptionalPropertyTypes pass-through
  // (so a `field.required` that's optional in the form schema can flow
  // here without per-call narrowing).
  required?: boolean | undefined;
  children: ReactNode;
}

export default function FieldBlock({
  label,
  required = false,
  children,
}: FieldBlockProps): ReactElement {
  return (
    <fieldset style={{ border: 'none', padding: 0, margin: '0 0 24px' }}>
      <legend style={{ fontSize: 14, fontWeight: 500, marginBottom: 8, padding: 0 }}>
        {label}
        {required && <span style={{ color: 'var(--destructive, #c00)' }}> *</span>}
      </legend>
      {children}
    </fieldset>
  );
}
