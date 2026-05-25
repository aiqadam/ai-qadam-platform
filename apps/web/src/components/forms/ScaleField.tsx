import type { CSSProperties, ReactElement } from 'react';

// Hide the underlying <input type="radio"> visually but keep it in the
// accessibility tree. Matches the pattern used by CsatForm.
const SR_ONLY: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0,0,0,0)',
  border: 0,
};

// Adaptive scale picker. Renders a horizontal row of clickable number
// buttons sized by available width — never wraps even at 11 buttons
// (NPS 0-10), which was the source of the rendering bug Viktor flagged.
//
// Strategy: use CSS Grid with `repeat(${count}, minmax(0, 1fr))` so
// buttons share the panel width evenly. Min button height stays 44px
// for tap targets; width scales down to ~28px on narrow viewports.
// Font size also scales down at higher counts so two-digit numbers
// (10) don't overflow.

export interface ScaleFieldProps {
  min: number;
  max: number;
  minLabel?: string | undefined;
  maxLabel?: string | undefined;
  value: number | undefined;
  onChange: (v: number) => void;
  disabled: boolean;
  fieldKey: string;
}

export default function ScaleField({
  min,
  max,
  minLabel,
  maxLabel,
  value,
  onChange,
  disabled,
  fieldKey,
}: ScaleFieldProps): ReactElement {
  const buttons: number[] = [];
  for (let i = min; i <= max; i++) buttons.push(i);
  const count = buttons.length;

  // Unified visual treatment for every scale length. Earlier
  // branching on `count > 10` (compact 0-10 vs standard 1-10) made two
  // scales on the same form render with visibly different button
  // sizes — Viktor flagged this. CSS Grid with minmax(0, 1fr) handles
  // width-adaptation alone; consistent gap + font keep the visual
  // identity stable from 2-button to 11-button scales.
  const gap = 4;
  const fontSize = 14;

  return (
    <div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))`,
          gap,
        }}
      >
        {buttons.map((n) => (
          // Real radio input keeps keyboard nav + screen-reader semantics;
          // visual treatment is the styled label wrapping it.
          <label
            key={n}
            style={{
              // Width is grid-controlled; only set min sizing for tap
              // target. minWidth: 0 lets the grid actually shrink below
              // intrinsic content width on narrow screens.
              minWidth: 0,
              height: 44,
              borderRadius: 10,
              border: '1px solid var(--border)',
              background: value === n ? 'var(--primary)' : 'transparent',
              color: value === n ? 'var(--primary-foreground)' : 'var(--foreground)',
              fontFamily: 'var(--font-mono)',
              fontSize,
              fontWeight: 600,
              cursor: disabled ? 'not-allowed' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <input
              type="radio"
              name={fieldKey}
              value={n}
              checked={value === n}
              onChange={() => onChange(n)}
              disabled={disabled}
              style={SR_ONLY}
            />
            {n}
          </label>
        ))}
      </div>
      {(minLabel || maxLabel) && (
        <p
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 11,
            color: 'var(--muted-foreground)',
            margin: '6px 2px 0',
            fontFamily: 'var(--font-mono)',
          }}
        >
          <span>{minLabel ?? ''}</span>
          <span>{maxLabel ?? ''}</span>
        </p>
      )}
    </div>
  );
}
