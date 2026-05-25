import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/kit';
import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';

// Stories for the L2 atom `Select` (apps/web-next/src/kit/Select.tsx).
// Radix-backed combobox. Stories cover an uncontrolled "pick a country"
// (the canonical tenant picker) and a controlled state demo so consumers
// see the value+onValueChange shape they'll wire to React Hook Form or
// useState in real cabinets.

const meta = {
  title: 'L2 Kit / Select',
  component: Select,
  tags: ['autodocs'],
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

const COUNTRIES = [
  { value: 'uz', label: 'Uzbekistan' },
  { value: 'kz', label: 'Kazakhstan' },
  { value: 'tj', label: 'Tajikistan' },
  { value: 'xx', label: 'Pan-region' },
] as const;

export const Default: Story = {
  render: () => (
    <div className="w-64">
      <Select>
        <SelectTrigger>
          <SelectValue placeholder="Pick a country" />
        </SelectTrigger>
        <SelectContent>
          {COUNTRIES.map((c) => (
            <SelectItem key={c.value} value={c.value}>
              {c.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  ),
};

export const Controlled: Story = {
  render: () => {
    function ControlledDemo() {
      const [value, setValue] = useState<string>('uz');
      return (
        <div className="w-64 space-y-2">
          <Select value={value} onValueChange={setValue}>
            <SelectTrigger>
              <SelectValue placeholder="Pick a country" />
            </SelectTrigger>
            <SelectContent>
              {COUNTRIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">value = {value}</p>
        </div>
      );
    }
    return <ControlledDemo />;
  },
};

export const Disabled: Story = {
  render: () => (
    <div className="w-64">
      <Select disabled>
        <SelectTrigger>
          <SelectValue placeholder="Pick a country" />
        </SelectTrigger>
        <SelectContent>
          {COUNTRIES.map((c) => (
            <SelectItem key={c.value} value={c.value}>
              {c.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  ),
};
