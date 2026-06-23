// AsyncSelect.stories.tsx — Storybook story for the AsyncSelect block.
// FR-MIG-004: AsyncSelect block (server-search dropdown).
// Stories: Default (sync resolve), Empty (resolves []).

import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { AsyncSelect } from '../../../../apps/web-next/src/blocks/workspace/AsyncSelect';
import type { AsyncSelectOption } from '../../../../apps/web-next/src/blocks/workspace/AsyncSelect';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const EVENTS = [
  { value: 'evt-001', label: 'AI Summit Tashkent 2026' },
  { value: 'evt-002', label: 'ML Bootcamp Almaty' },
  { value: 'evt-003', label: 'NLP Workshop Dushanbe' },
  { value: 'evt-004', label: 'Data Engineering Conf Baku' },
];

// ─── Stories ─────────────────────────────────────────────────────────────────

const meta = {
  title: 'Blocks / AsyncSelect',
  component: AsyncSelect,
  tags: ['autodocs'],
} satisfies Meta<typeof AsyncSelect>;

export default meta;
type Story = StoryObj<typeof meta>;

// Default: resolves synchronously — mimics a fast network or cached options.
export const Default: Story = {
  render: () => {
    function DefaultDemo() {
      const [value, setValue] = useState<AsyncSelectOption | null>(null);
      return (
        <div className="w-80 space-y-2">
          <AsyncSelect
            value={value}
            onChange={setValue}
            loadOptions={async (input) => {
              await Promise.resolve(); // microtick — resolves sync
              if (!input) return EVENTS;
              return EVENTS.filter((e) => e.label.toLowerCase().includes(input.toLowerCase()));
            }}
            placeholder="Search events…"
          />
          <p className="text-xs text-muted-foreground">
            Selected: {value ? `${value.label} (${value.value})` : '(none)'}
          </p>
        </div>
      );
    }
    return <DefaultDemo />;
  },
};

// Empty: loadOptions resolves to an empty array.
export const Empty: Story = {
  render: () => {
    function EmptyDemo() {
      const [value, setValue] = useState<AsyncSelectOption | null>(null);
      return (
        <div className="w-80">
          <AsyncSelect
            value={value}
            onChange={setValue}
            loadOptions={async () => []}
            placeholder="Search events…"
          />
        </div>
      );
    }
    return <EmptyDemo />;
  },
};
