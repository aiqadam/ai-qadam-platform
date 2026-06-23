// L3 workspace block — <EventControlPanelActions>.
//
// M2.2 — top-level action bar for the event control panel.
// Orchestrates Save (delegates to EventEditForm), Regenerate social card,
// and Cancel event (with confirm dialog). All actions share the same
// useWorkspaceEvent query cache via sibling blocks.

import { type Action, ActionBarIsland } from '@/blocks/workspace';
import { IslandRoot } from '@/lib/island-root';
import {
  useCancelEvent,
  useRegenerateSocialCard,
  useWorkspaceEvent,
} from '@/lib/use-workspace-events';
import { type ReactElement, useState } from 'react';

interface EventControlPanelActionsProps {
  eventId: string;
}

function EventControlPanelActionsInner({ eventId }: EventControlPanelActionsProps): ReactElement {
  const eventQuery = useWorkspaceEvent(eventId);
  const cancelMutation = useCancelEvent(eventId);
  const regenMutation = useRegenerateSocialCard(eventId);
  const [saveLoading, setSaveLoading] = useState(false);

  const event = eventQuery.data?.event;
  const isCancelled = event?.status === 'cancelled';

  function handleSave(): void {
    const form = document.getElementById('ev-edit-form') as HTMLFormElement | null;
    if (!form) return;
    setSaveLoading(true);
    const handler = (): void => setSaveLoading(false);
    form.addEventListener('submit', handler, { once: true });
    form.requestSubmit();
  }

  function handleRegen(): void {
    regenMutation.mutate();
  }

  function handleCancel(): void {
    cancelMutation.mutate(undefined, {
      onSuccess: () => window.location.reload(),
    });
  }

  const actions: Action[] = [
    {
      label: 'Save',
      onClick: handleSave,
      loading: saveLoading || eventQuery.isPending,
      disabled: !event || isCancelled,
    },
    {
      label: 'Regenerate social card',
      variant: 'outline',
      onClick: handleRegen,
      loading: regenMutation.isPending,
      disabled: !event,
    },
    {
      label: 'Cancel event',
      variant: 'destructive',
      onClick: handleCancel,
      loading: cancelMutation.isPending,
      disabled: !event || isCancelled,
      confirm: {
        title: 'Cancel event?',
        description:
          'This will mark the event as cancelled. Attendees will not be automatically notified.',
        confirmLabel: 'Yes, cancel event',
        cancelLabel: 'Keep event',
      },
    },
  ];

  return <ActionBarIsland actions={actions} />;
}

export function EventControlPanelActions(props: EventControlPanelActionsProps): ReactElement {
  return (
    <IslandRoot>
      <EventControlPanelActionsInner {...props} />
    </IslandRoot>
  );
}

export default EventControlPanelActions;
