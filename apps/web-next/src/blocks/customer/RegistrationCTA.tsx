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
// Wiring: docs/04-development/architecture/wiring-map.md → registrations.

import { Button } from '@/kit';
import { IslandRoot } from '@/lib/island-root';
import { useAuth } from '@/lib/use-auth';
import {
  type ActiveRegistrationStatus,
  useCancelRegistration,
  useMyRegistrationStatus,
  useRegisterForEvent,
} from '@/lib/use-registrations';
import { type ReactElement, useState } from 'react';

interface Translations {
  capacity: string;
  // Templates (containing literal "{{count}}"/"{{capacity}}" placeholders),
  // not functions — client:load islands serialize props as JSON, which
  // silently drops function values to null (ISS-EVT-005-1). CapacityHint
  // does its own placeholder substitution below.
  spotsTemplate: string;
  goingCountTemplate: string;
  sign_in_to_join_waitlist: string;
  sign_in_to_register: string;
  loading_registration: string;
  join_waitlist: string;
  register: string;
  busy: string;
  registered_confirmation: string;
  cancel_registration: string;
  on_waitlist: string;
  leave_waitlist: string;
}

interface Props {
  eventId: string;
  capacity: number | null;
  registeredCount: number;
  t: Translations;
}

function signInHref(eventId: string): string {
  const next = `/events/${encodeURIComponent(eventId)}`;
  return `/api/v1/auth/login?next=${encodeURIComponent(next)}`;
}

function CapacityHint({
  capacity,
  count,
  t,
}: {
  capacity: number | null;
  count: number;
  t: Translations;
}): ReactElement {
  const hint =
    capacity != null
      ? t.spotsTemplate.replace('{{count}}', String(count)).replace('{{capacity}}', String(capacity))
      : t.goingCountTemplate.replace('{{count}}', String(count));
  return (
    <>
      <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {t.capacity}
      </p>
      <p className="text-sm text-foreground">{hint}</p>
    </>
  );
}

function AnonCta({
  eventId,
  isFull,
  t,
}: {
  eventId: string;
  isFull: boolean;
  t: Translations;
}): ReactElement {
  return (
    <a
      href={signInHref(eventId)}
      className="block w-full text-center rounded-md bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium hover:bg-primary/90 transition-colors"
    >
      {isFull ? t.sign_in_to_join_waitlist : t.sign_in_to_register}
    </a>
  );
}

interface AuthedCtaProps {
  eventId: string;
  isFull: boolean;
  status: ActiveRegistrationStatus | null;
  statusPending: boolean;
  onCountDelta: (delta: number) => void;
  t: Translations;
}

function AuthedCta({
  eventId,
  isFull,
  status,
  statusPending,
  onCountDelta,
  t,
}: AuthedCtaProps): ReactElement {
  const register = useRegisterForEvent(eventId);
  const cancel = useCancelRegistration(eventId);

  const isBusy = register.isPending || cancel.isPending;
  const errorMsg = register.error?.message ?? cancel.error?.message ?? null;

  if (statusPending) {
    return <p className="text-xs text-muted-foreground">{t.loading_registration}</p>;
  }

  const handleRegister = (): void => {
    register.mutate(undefined, { onSuccess: () => onCountDelta(+1) });
  };

  if (status === null) {
    const label = isBusy ? t.busy : isFull ? t.join_waitlist : t.register;
    return (
      <Button onClick={handleRegister} disabled={isBusy} className="w-full">
        {label}
      </Button>
    );
  }

  const handleCancel = (): void => {
    cancel.mutate(undefined);
  };

  if (status === 'registered') {
    return (
      <>
        <div className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-foreground">
          {t.registered_confirmation}
        </div>
        <Button variant="outline" onClick={handleCancel} disabled={isBusy} className="w-full">
          {isBusy ? t.busy : t.cancel_registration}
        </Button>
        {errorMsg && <p className="text-xs text-destructive">{errorMsg}</p>}
      </>
    );
  }

  return (
    <>
      <div className="rounded-md border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
        {t.on_waitlist}
      </div>
      <Button variant="outline" onClick={handleCancel} disabled={isBusy} className="w-full">
        {isBusy ? t.busy : t.leave_waitlist}
      </Button>
      {errorMsg && <p className="text-xs text-destructive">{errorMsg}</p>}
    </>
  );
}

function RegistrationCTAInner({ eventId, capacity, registeredCount, t }: Props): ReactElement {
  const auth = useAuth();
  const status = useMyRegistrationStatus(eventId);
  const [optimisticDelta, setOptimisticDelta] = useState(0);
  const count = registeredCount + optimisticDelta;
  const isFull = capacity != null && count >= capacity;

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <CapacityHint capacity={capacity} count={count} t={t} />
      {auth.isAuthenticated ? (
        <AuthedCta
          eventId={eventId}
          isFull={isFull}
          status={status.data ?? null}
          statusPending={status.isPending}
          onCountDelta={(d) => setOptimisticDelta((prev) => prev + d)}
          t={t}
        />
      ) : (
        <AnonCta eventId={eventId} isFull={isFull} t={t} />
      )}
    </div>
  );
}

export function RegistrationCTA(props: Props): ReactElement {
  return (
    <IslandRoot>
      <RegistrationCTAInner {...props} />
    </IslandRoot>
  );
}

export default RegistrationCTA;
