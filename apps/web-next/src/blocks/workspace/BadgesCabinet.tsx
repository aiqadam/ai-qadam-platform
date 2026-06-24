// L3 workspace block — <BadgesCabinet>.
//
// Tabbed container for the badges cabinet. Wraps <BadgesListInner> and
// <BadgeAwardHistoryInner> in a single React island so they share one
// QueryClient scope and the tab state stays client-side.
//
// Two tabs:
//   "Badges"  — badge definitions + grant action (BadgesList inner)
//   "Awards"  — full grant history with per-badge filter + revoke
//
// FR-MIG-027. Auth gate is in the parent .astro page.

import { IslandRoot } from '@/lib/island-root';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/kit';
import { type ReactElement } from 'react';
import { BadgesListInner } from './BadgesList';
import { BadgeAwardHistoryInner } from './BadgeAwardHistory';

function BadgesCabinetInner(): ReactElement {
  return (
    <Tabs defaultValue="badges" className="space-y-4">
      <TabsList>
        <TabsTrigger value="badges">Badges</TabsTrigger>
        <TabsTrigger value="awards">Award history</TabsTrigger>
      </TabsList>
      <TabsContent value="badges">
        <BadgesListInner />
      </TabsContent>
      <TabsContent value="awards">
        <BadgeAwardHistoryInner />
      </TabsContent>
    </Tabs>
  );
}

export function BadgesCabinet(): ReactElement {
  return (
    <IslandRoot>
      <BadgesCabinetInner />
    </IslandRoot>
  );
}
