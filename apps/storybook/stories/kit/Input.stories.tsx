import { Input } from '@/kit';
import type { Meta, StoryObj } from '@storybook/react';

// Stories for the L2 atom `Input` (apps/web-next/src/kit/Input.tsx).
// The atom has no variants — width comes from the caller via className,
// type comes from the native attribute. We show one story per common
// input type + a disabled state to make the focus / disabled
// states visible.

const meta = {
  title: 'L2 Kit / Input',
  component: Input,
  tags: ['autodocs'],
  argTypes: {
    type: {
      control: 'inline-radio',
      options: ['text', 'email', 'password', 'number', 'search'],
    },
    disabled: { control: 'boolean' },
    placeholder: { control: 'text' },
  },
  args: {
    placeholder: 'Type here…',
    type: 'text',
  },
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Email: Story = {
  args: { type: 'email', placeholder: 'email@aiqadam.org' },
};

export const Disabled: Story = {
  args: { disabled: true, placeholder: 'Disabled input' },
};

export const WithLabel: Story = {
  render: (args) => (
    <div className="flex flex-col gap-2">
      <label htmlFor="story-input-email" className="text-sm font-medium text-foreground">
        Email address
      </label>
      <Input id="story-input-email" {...args} />
    </div>
  ),
  args: { type: 'email', placeholder: 'you@example.com' },
};
