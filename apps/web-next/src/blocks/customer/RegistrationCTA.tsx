// L3 block — <RegistrationCTA>.
//
// Event detail sidebar's primary CTA. Five states:
//   1. anon                    → "Sign in to register" link
//   2. authed + status pending → "Loading registration…"
//   3. authed + status null    → "Register" / "Join waitlist" button
//   4. authed + registered     → "You're registered" + Cancel button
//   5. authed + waitlisted     → "On waitlist" + Leave button
//
// Data-in/element-out + L1 only: receives eventId / capacity / count
// via props (the page fetched the event). Authentication + the
// register/cancel mutations come from L1 hooks (useAuth +
// useMyRegistrationStatus + useRegisterForEvent + useCancelRegistration
// in lib/use-registrations) so the block itself never sees raw fetch.
//
// Wiring: docs/architecture/wiring-map.md → registrations.

import { Button } from '@/kit';
import { useAuth } from '@/lib/use-auth';
import {
  type ActiveRegistrationStatus,
  useCancelRegistration,
  useMyRegistrationStatus,
  useRegisterForEvent,
} from '@/lib/use-registrations';
import { type ReactElement, useState } from 'react';

interface Props {
  eventId: string;
  capacity: number | null;
  registeredCount: number;
}

function signInHref(eventId: string): string {
  const next = `/events/${encodeURIComponent(eventId)}`;
  return `/api/v1/auth/login?next=${encodeURIComponent(next)}`;
}

function CapacityHint({
  capacity,
  count,
}: {
  capacity: number | null;
  count: number;
}): ReactElement {
  const hint = capacity != null ? `${count} / ${capacity} spots` : `${count} going`;
  return (
    <>
      <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        Capacity
      </p>
      <p className="text-sm text-foreground">{hint}</p>
    </>
  );
}

function AnonCta({ eventId, isFull }: { eventId: string; isFull: boolean }): ReactElement {
  return (
    <a
      href={signInHref(eventId)}
      className="block w-full text-center rounded-md bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium hover:bg-primary/90 transition-colors"
    >
      {isFull ? 'Sign in to join waitlist' : 'Sign in to register'}
    </a>
  );
}

interface AuthedCtaProps {
  eventId: string;
  isFull: boolean;
  status: ActiveRegistrationStatus | null;
  statusPending: boolean;
  onCountDelta: (delta: number) => void;
}

function AuthedCta({
  eventId,
  isFull,
  status,
  statusPending,
  onCountDelta,
}: AuthedCtaProps): ReactElement {
  const register = useRegisterForEvent(eventId);
  const cancel = useCancelRegistration(eventId);

  const onRegister = (): void => {
    register.mutate(undefined, {
      onSuccess: (next) => {
        if (next === 'registered') onCountDelta(+1);
      },
    });
  };
  const onCancel = (): void => {
    cancel.mutate(undefined, {
      onSuccess: () => {
        if (status === 'registered') onCountDelta(-1);
      },
    });
  };

  const busy = register.isPending || cancel.isPending;
  const mutationError = register.error?.message ?? cancel.error?.message ?? null;

  if (statusPending) {
    return <p className="text-xs text-muted-foreground">Loading registration…</p>;
  }
  if (status === null) {
    return (
      <Button onClick={onRegister} disabled={busy} className="w-full">
        {busy ? '…' : isFull ? 'Join waitlist' : 'Register'}
      </Button>
    );
  }
  if (status === 'registered') {
    return (
      <>
        <div className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-foreground">
          ✓ You're registered
        </div>
        <Button variant="outline" onClick={onCancel} disabled={busy} className="w-full">
          {busy ? '…' : 'Cancel registration'}
        </Button>
        {mutationError && <p className="text-xs text-destructive">{mutationError}</p>}
      </>
    );
  }
  return (
    <>
      <div className="rounded-md border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
        On waitlist — we'll email if a seat opens
      </div>
      <Button variant="outline" onClick={onCancel} disabled={busy} className="w-full">
        {busy ? '…' : 'Leave waitlist'}
      </Button>
      {mutationError && <p className="text-xs text-destructive">{mutationError}</p>}
    </>
  );
}

export function RegistrationCTA({ eventId, capacity, registeredCount }: Props): ReactElement {
  const auth = useAuth();
  const status = useMyRegistrationStatus(eventId);
  const [optimisticDelta, setOptimisticDelta] = useState(0);
  const count = registeredCount + optimisticDelta;
  const isFull = capacity != null && count >= capacity;

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <CapacityHint capacity={capacity} count={count} />
      {auth.isAuthenticated ? (
        <AuthedCta
          eventId={eventId}
          isFull={isFull}
          status={status.data ?? null}
          statusPending={status.isPending}
          onCountDelta={(d) => setOptimisticDelta((prev) => prev + d)}
        />
      ) : (
        <AnonCta eventId={eventId} isFull={isFull} />
      )}
    </div>
  );
}

export default RegistrationCTA;
