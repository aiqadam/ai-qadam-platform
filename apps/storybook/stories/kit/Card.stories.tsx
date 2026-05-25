import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/kit';
import type { Meta, StoryObj } from '@storybook/react';

// Stories for the L2 atom `Card` (apps/web-next/src/kit/Card.tsx).
// The compound has 6 pieces (Card + Header + Title + Description +
// Content + Footer) so the stories show the canonical full layout, a
// header-only minimal layout, and the same card content rendered in
// a horizontal-grid context to make spacing assumptions visible.

const meta = {
  title: 'L2 Kit / Card',
  component: Card,
  tags: ['autodocs'],
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Card className="w-80">
      <CardHeader>
        <CardTitle>Card title</CardTitle>
        <CardDescription>One-line description below the title.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">Body content goes here.</p>
      </CardContent>
      <CardFooter className="flex justify-end">
        <Button size="sm">Action</Button>
      </CardFooter>
    </Card>
  ),
};

export const HeaderOnly: Story = {
  render: () => (
    <Card className="w-80">
      <CardHeader>
        <CardTitle>Minimal card</CardTitle>
        <CardDescription>No body, no footer.</CardDescription>
      </CardHeader>
    </Card>
  ),
};

export const Grid: Story = {
  render: () => (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {(['Member badges', 'Events this month', 'Forum questions'] as const).map((title) => (
        <Card key={title}>
          <CardHeader>
            <CardTitle>{title}</CardTitle>
            <CardDescription>KPI card placeholder.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">42</p>
          </CardContent>
        </Card>
      ))}
    </div>
  ),
};
