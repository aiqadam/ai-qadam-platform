// L3 workspace block — <AdminUsersCabinet>.
//
// FR-ADM-011: generalizes /workspace/admin/users from invite-list-only
// into "Invites" + "Manage users" tabs. One island owns the Radix Tabs
// state so both views live under a single client:load boundary rather
// than two independent islands racing to render tab chrome.

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/kit';
import { IslandRoot } from '@/lib/island-root';
import type { ReactElement } from 'react';
import { InvitesListInner } from './InvitesList';
import { UserRolesManagerInner } from './UserRolesManager';

// Uses the *Inner variants (not the public InvitesList/UserRolesManager)
// so this cabinet mounts exactly ONE RuntimeProvider/QueryClient root for
// both tabs, per island-root.tsx's "one provider per root" contract —
// nesting the already-wrapped public exports would triple-mount
// RuntimeProvider for no benefit (getQueryClient() is a singleton either
// way, but AuthProvider re-instantiation per nested root is pure waste).
function AdminUsersCabinetInner(): ReactElement {
  return (
    <Tabs defaultValue="invites">
      <TabsList>
        <TabsTrigger value="invites">Invites</TabsTrigger>
        <TabsTrigger value="manage-users">Manage users</TabsTrigger>
      </TabsList>
      <TabsContent value="invites">
        <InvitesListInner />
      </TabsContent>
      <TabsContent value="manage-users">
        <UserRolesManagerInner />
      </TabsContent>
    </Tabs>
  );
}

export function AdminUsersCabinet(): ReactElement {
  return (
    <IslandRoot>
      <AdminUsersCabinetInner />
    </IslandRoot>
  );
}

export default AdminUsersCabinet;
