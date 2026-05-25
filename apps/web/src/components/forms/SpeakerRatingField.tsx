import type { ReactElement } from 'react';
import ScaleField from './ScaleField';

// D8 — per-speaker rating block. Renders one ScaleField row per
// confirmed event speaker, with the speaker's name as a row label.
//
// Submission payload shape: { [speaker_key]: rating_int } stored under
// the parent field's `key`. Speaker keys are stable display names
// (sluggified) — operators can read responses by name in the inbox
// without joining against event_speakers at read time.
//
// When `speakers` is empty (no eventContext or no confirmed speakers
// for this event), the field renders a friendly notice instead of an
// empty container. This keeps the field harmless when an operator
// attaches a form with speaker_rating to an event that has no
// speakers yet — the rest of the form still works.

export interface Speaker {
  name: string | null;
  talkTitle?: string | null;
}

export interface SpeakerRatingFieldProps {
  speakers: Speaker[];
  scale: { min: number; max: number; min_label?: string; max_label?: string };
  value: Record<string, number>;
  onChange: (next: Record<string, number>) => void;
  disabled: boolean;
  fieldKey: string;
}

export default function SpeakerRatingField({
  speakers,
  scale,
  value,
  onChange,
  disabled,
  fieldKey,
}: SpeakerRatingFieldProps): ReactElement {
  const namedSpeakers = speakers.filter((s) => s.name && s.name.trim().length > 0);

  if (namedSpeakers.length === 0) {
    return (
      <p
        style={{
          margin: 0,
          fontSize: 13,
          color: 'var(--muted-foreground)',
          fontStyle: 'italic',
        }}
      >
        Speaker ratings will appear here once the event has confirmed speakers.
      </p>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {namedSpeakers.map((s, idx) => {
        const speakerKey = sluggifyName(s.name ?? '') || `speaker-${idx}`;
        return (
          <div key={speakerKey}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 500,
                marginBottom: 6,
              }}
            >
              {s.name}
              {s.talkTitle && (
                <span
                  style={{
                    color: 'var(--muted-foreground)',
                    fontWeight: 400,
                    marginLeft: 6,
                  }}
                >
                  — {s.talkTitle}
                </span>
              )}
            </div>
            <ScaleField
              min={scale.min}
              max={scale.max}
              minLabel={scale.min_label}
              maxLabel={scale.max_label}
              value={value[speakerKey]}
              onChange={(v) => onChange({ ...value, [speakerKey]: v })}
              disabled={disabled}
              fieldKey={`${fieldKey}-${speakerKey}`}
            />
          </div>
        );
      })}
    </div>
  );
}

// Stable url-safe key derived from the speaker display name. Operators
// see the same key in the responses inbox.
function sluggifyName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
