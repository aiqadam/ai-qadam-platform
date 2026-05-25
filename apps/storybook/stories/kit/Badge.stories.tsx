import { Badge } from '@/kit';
import type { Meta, StoryObj } from '@storybook/react';

// Stories for the L2 atom `Badge` (apps/web-next/src/kit/Badge.tsx).
// Five semantic variants — the variant should map to the meaning, not
// the desired color. The All story shows them side-by-side for quick
// visual scan during token edits.

const meta = {
  title: 'L2 Kit / Badge',
  component: Badge,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'inline-radio',
      options: ['default', 'secondary', 'destructive', 'outline', 'success'],
    },
  },
  args: {
    children: 'Badge',
  },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { variant: 'default' },
};

export const Success: Story = {
  args: { variant: 'success', children: 'Live' },
};

export const Destructive: Story = {
  args: { variant: 'destructive', children: 'Error' },
};

export const All: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Badge variant="default">Default</Badge>
      <Badge variant="secondary">Secondary</Badge>
      <Badge variant="destructive">Destructive</Badge>
      <Badge variant="outline">Outline</Badge>
      <Badge variant="success">Success</Badge>
    </div>
  ),
};
