import {
  Button,
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/kit';
import type { Meta, StoryObj } from '@storybook/react';

// Stories for the L2 atom `Drawer` (apps/web-next/src/kit/Drawer.tsx).
// Radix Dialog primitive anchored to a screen edge. Stories compose the
// styled pieces around a trigger so the slide-in open/close is
// interactive in Storybook; the `side` prop flips the anchor.

const meta = {
  title: 'L2 Kit / Drawer',
  component: Drawer,
  tags: ['autodocs'],
} satisfies Meta<typeof Drawer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const RightFilters: Story = {
  render: () => (
    <Drawer>
      <DrawerTrigger asChild>
        <Button variant="outline">Filters</Button>
      </DrawerTrigger>
      <DrawerContent side="right">
        <DrawerHeader>
          <DrawerTitle>Filter members</DrawerTitle>
          <DrawerDescription>
            Narrow the directory by country, seniority, and tags.
          </DrawerDescription>
        </DrawerHeader>
        <div className="flex-1 text-sm text-muted-foreground">Filter controls go here.</div>
        <DrawerFooter>
          <Button variant="outline">Reset</Button>
          <Button>Apply</Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  ),
};

export const LeftNav: Story = {
  render: () => (
    <Drawer>
      <DrawerTrigger asChild>
        <Button variant="outline">Open left</Button>
      </DrawerTrigger>
      <DrawerContent side="left">
        <DrawerHeader>
          <DrawerTitle>Navigation</DrawerTitle>
          <DrawerDescription>Left-anchored variant.</DrawerDescription>
        </DrawerHeader>
        <div className="flex-1 text-sm text-muted-foreground">Panel body.</div>
      </DrawerContent>
    </Drawer>
  ),
};
