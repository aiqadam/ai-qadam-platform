import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/kit';
import type { Meta, StoryObj } from '@storybook/react';

// Stories for the L2 atom `Tabs` (apps/web-next/src/kit/Tabs.tsx).
// Radix-backed: the atom itself has no variants. The stories show the
// canonical 2-tab pattern (Overview + Forum, mirroring the planned
// event-detail page) and a many-tab horizontal-scroll case so
// downstream blocks know what to expect for overflow.

const meta = {
  title: 'L2 Kit / Tabs',
  component: Tabs,
  tags: ['autodocs'],
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Tabs defaultValue="overview" className="w-96">
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="forum">Forum</TabsTrigger>
      </TabsList>
      <TabsContent value="overview" className="text-sm text-muted-foreground">
        Overview tab content. Drop an L3 EventDetail block here in PR-1.3.
      </TabsContent>
      <TabsContent value="forum" className="text-sm text-muted-foreground">
        Forum tab content. Drop an L3 ForumThread block here in PR-1.7.
      </TabsContent>
    </Tabs>
  ),
};

export const FourTabs: Story = {
  render: () => (
    <Tabs defaultValue="details" className="w-[32rem]">
      <TabsList>
        <TabsTrigger value="details">Details</TabsTrigger>
        <TabsTrigger value="speakers">Speakers</TabsTrigger>
        <TabsTrigger value="sponsors">Sponsors</TabsTrigger>
        <TabsTrigger value="materials">Materials</TabsTrigger>
      </TabsList>
      <TabsContent value="details" className="text-sm text-muted-foreground">
        Details tab — primary copy lives here.
      </TabsContent>
      <TabsContent value="speakers" className="text-sm text-muted-foreground">
        Speakers tab — the future SpeakerGrid block.
      </TabsContent>
      <TabsContent value="sponsors" className="text-sm text-muted-foreground">
        Sponsors tab — the future SponsorWall block.
      </TabsContent>
      <TabsContent value="materials" className="text-sm text-muted-foreground">
        Materials tab — the future MaterialsList block.
      </TabsContent>
    </Tabs>
  ),
};
