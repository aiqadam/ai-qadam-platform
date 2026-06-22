// filepath: apps/web-next/stories/L2 Kit/Tooltip.stories.tsx
//
// Story file for the Tooltip kit atom.
//
// NOTE: @storybook/react is not yet installed in apps/web-next, so this file
// cannot be type-checked or built locally. It follows the standard Storybook 8
// CSF3 pattern (Meta<typeof Tooltip>, StoryObj). Once @storybook/react is
// added to apps/web-next/package.json, remove the eslint-disable suppression
// and the local type stubs below.
// eslint-disable @typescript-eslint/no-explicit-any

import { Tooltip } from '@/kit/Tooltip';
import { Info } from 'lucide-react';

// Stub types until @storybook/react is added to web-next
type Meta = Record<string, unknown>;
type Story = Record<string, unknown>;

const meta = {
  title: 'L2 Kit/Tooltip',
  component: Tooltip,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Accessible tooltip built on Radix. Appears on hover (pointer) and focus (keyboard). role=tooltip and aria-describedby are wired automatically.',
      },
    },
  },
  argTypes: {
    side: {
      control: 'select',
      options: ['top', 'right', 'bottom', 'left'],
      description: 'Which side of the trigger the tooltip appears on',
    },
    align: {
      control: 'select',
      options: ['start', 'center', 'end'],
      description: 'How the tooltip aligns along the trigger edge',
    },
    delayDuration: {
      control: 'number',
      description: 'ms to wait before showing the tooltip (overrides component default of 300ms)',
    },
  },
} as Meta;

export default meta;

// ---- Stories ----

export const Default: Story = {
  args: {
    content: 'This is a helpful tooltip',
    children: <Info size={16} />,
    side: 'top',
    align: 'center',
  },
};

export const AllSides: Story = {
  parameters: {
    docs: {
      description: {
        story: 'All four side variants shown side by side for visual comparison.',
      },
    },
  },
  render: () => (
    <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
      {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
        <Tooltip key={side} content={`Side: ${side}`} side={side}>
          <Info size={16} />
        </Tooltip>
      ))}
    </div>
  ),
};

export const RichContent: Story = {
  name: 'Rich content (ReactNode)',
  parameters: {
    docs: {
      description: {
        story:
          'content accepts ReactNode, not just strings — useful for styled or multi-line hints.',
      },
    },
  },
  render: () => (
    <Tooltip
      content={
        <span>
          <strong>Bold label</strong>
          <br />
          Followed by a description sentence.
        </span>
      }
    >
      <Info size={16} />
    </Tooltip>
  ),
};
