// L3 customer block — <CheckinOperator>.
//
// FR-MIG-021: event-day QR check-in page for event operators.
// Renders an event dropdown + QR scanner (via @zxing/browser) + manual
// code entry fallback + success/error display + offline queue indicator.
//
// AGENTS.md §5: Presentation-only — uses useCheckin hook for data fetching.

'use client';

import { IslandRoot } from '@/lib/island-root';
import { useCheckin } from '@/lib/use-checkin';
import { cn } from '@/lib/utils';
import { Camera, CameraOff, CheckCircle, Clock, Loader2, XCircle } from 'lucide-react';
import { type ReactElement, useCallback, useEffect, useRef, useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ActiveEvent {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  location: string | null;
}

export interface CheckinOperatorProps {
  /** Events available for operator selection (today's events + 24h buffer). */
  events: ActiveEvent[];
  /** Pre-filled code from ?code= query param (self-serve mode). */
  prefilledCode?: string | null;
}

// LocalStorage queue entry shape.
interface QueuedCheckin {
  code: string;
  eventId: string;
  queuedAt: string;
}

const QUEUE_KEY = 'aiqadam:checkin:queue';
const OFFLINE_FLUSH_DEBOUNCE_MS = 500;

// ─── Phase machine ────────────────────────────────────────────────────────────

type Phase =
  | { kind: 'scanning' }
  | { kind: 'submitting' }
  | { kind: 'success'; alreadyCheckedIn: boolean; memberName: string; memberAvatar: string | null }
  | { kind: 'error'; message: string };

// ─── Offline queue helpers ────────────────────────────────────────────────────

function loadQueue(): QueuedCheckin[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as QueuedCheckin[];
  } catch {
    return [];
  }
}

function saveQueue(q: QueuedCheckin[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  } catch {
    // localStorage full or unavailable — ignore.
  }
}

// ─── QR scanner via @zxing/browser ───────────────────────────────────────────

async function startScanner(
  videoEl: HTMLVideoElement,
  onResult: (code: string) => void,
): Promise<() => void> {
  const { BrowserQRCodeReader } = await import('@zxing/browser');
  const reader = new BrowserQRCodeReader();
  const controls = await reader.decodeFromVideoDevice(undefined, videoEl, (result) => {
    if (result) {
      onResult(result.getText());
    }
  });
  return () => controls.stop();
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function Avatar({
  src,
  name,
  size = 64,
}: {
  src: string | null;
  name: string;
  size?: number;
}): ReactElement {
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        width={size}
        height={size}
        className="rounded-full object-cover"
        // arch-ignore: no-inline-style — dynamic pixel size from prop, no static token possible
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="flex items-center justify-center rounded-full bg-primary text-primary-foreground font-semibold"
      // arch-ignore: no-inline-style — dynamic pixel size from prop, no static token possible
      style={{ width: size, height: size, fontSize: size * 0.35 }}
      aria-label={name}
    >
      {initials}
    </div>
  );
}

function OfflineBanner({ queueCount }: { queueCount: number }): ReactElement {
  return (
    <div className="flex items-center gap-2 rounded-md bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
      <Clock className="h-4 w-4 shrink-0" />
      <span className="font-medium">Offline mode</span>
      {queueCount > 0 && (
        <span>
          — {queueCount} check-in{queueCount !== 1 ? 's' : ''} pending
        </span>
      )}
    </div>
  );
}

function SuccessScreen({
  alreadyCheckedIn,
  memberName,
  memberAvatar,
  onReset,
}: {
  alreadyCheckedIn: boolean;
  memberName: string;
  memberAvatar: string | null;
  onReset: () => void;
}): ReactElement {
  useEffect(() => {
    const timer = setTimeout(onReset, 5000);
    return () => clearTimeout(timer);
  }, [onReset]);

  return (
    <div className="flex flex-col items-center gap-4 py-8 text-center animate-in fade-in zoom-in duration-300">
      <div
        className={cn(
          'flex h-16 w-16 items-center justify-center rounded-full',
          alreadyCheckedIn ? 'bg-amber-500/10' : 'bg-primary/10',
        )}
      >
        <CheckCircle
          className={cn('h-8 w-8', alreadyCheckedIn ? 'text-amber-500' : 'text-primary')}
        />
      </div>
      <Avatar src={memberAvatar} name={memberName} size={80} />
      <div>
        <p className="text-lg font-semibold">{memberName}</p>
        <p
          className={cn(
            'mt-1 text-sm font-medium',
            alreadyCheckedIn ? 'text-amber-600 dark:text-amber-400' : 'text-primary',
          )}
        >
          {alreadyCheckedIn ? 'Already checked in' : 'Checked in'}
        </p>
      </div>
    </div>
  );
}

function ErrorScreen({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}): ReactElement {
  return (
    <div className="flex flex-col items-center gap-4 py-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
        <XCircle className="h-8 w-8 text-destructive" />
      </div>
      <p className="text-sm text-muted-foreground">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-2 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Try again
      </button>
    </div>
  );
}

function CameraViewfinder({
  videoRef,
  cameraError,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  cameraError: boolean;
}): ReactElement {
  if (cameraError) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-8 text-center">
        <CameraOff className="h-10 w-10 text-muted-foreground" />
        <p className="text-sm font-medium">Camera unavailable</p>
        <p className="text-xs text-muted-foreground">Use manual code entry below.</p>
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-black">
      <video
        ref={videoRef}
        className="w-full aspect-video object-cover"
        muted
        playsInline
        autoPlay
      />
      <div className="flex items-center gap-2 bg-black/80 px-4 py-2 text-xs text-white/70">
        <Camera className="h-3.5 w-3.5" />
        Point camera at QR code
      </div>
    </div>
  );
}

function EventSelector({
  events,
  selectedId,
  onSelect,
  disabled,
}: {
  events: ActiveEvent[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  disabled: boolean;
}): ReactElement {
  return (
    <div className="space-y-1.5">
      <label htmlFor="event-select" className="block text-sm font-medium">
        Event
      </label>
      <select
        id="event-select"
        value={selectedId ?? ''}
        onChange={(e) => onSelect(e.target.value || null)}
        disabled={disabled}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      >
        {events.length === 0 ? (
          <option value="">No active events</option>
        ) : (
          <>
            <option value="" disabled>
              Select an event…
            </option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.title}
              </option>
            ))}
          </>
        )}
      </select>
    </div>
  );
}

function ManualEntryForm({
  manualCode,
  onManualCodeChange,
  onSubmit,
  disabled,
  submitting,
}: {
  manualCode: string;
  onManualCodeChange: (code: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  disabled: boolean;
  submitting: boolean;
}): ReactElement {
  return (
    <form onSubmit={onSubmit} className="flex gap-2">
      <input
        type="text"
        value={manualCode}
        onChange={(e) => onManualCodeChange(e.target.value)}
        placeholder="Enter check-in code…"
        disabled={submitting || disabled}
        className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={submitting || !manualCode.trim() || disabled}
        className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Checking in…
          </>
        ) : (
          'Check in'
        )}
      </button>
    </form>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

// Extracted to avoid cognitive complexity threshold in the main component.
function useCheckinMachine(events: ActiveEvent[], prefilledCode: string | null | undefined) {
  const [selectedEventId, setSelectedEventId] = useState<string | null>(events[0]?.id ?? null);
  const [manualCode, setManualCode] = useState('');
  const [phase, setPhase] = useState<Phase>({ kind: 'scanning' });
  const [cameraError, setCameraError] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [queueCount, setQueueCount] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerCleanupRef = useRef<(() => void) | null>(null);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Refs for stable access in async callbacks.
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const selectedEventIdRef = useRef(selectedEventId);
  selectedEventIdRef.current = selectedEventId;
  const prefilledCodeRef = useRef(prefilledCode);
  prefilledCodeRef.current = prefilledCode;

  const checkinMutation = useCheckin();

  const performCheckin = useCallback(
    async (token: string) => {
      const eventId = selectedEventIdRef.current;
      if (!eventId) return;
      if (phaseRef.current.kind === 'submitting') return;

      setPhase({ kind: 'submitting' });
      scannerCleanupRef.current?.();

      try {
        const result = await checkinMutation.mutateAsync({
          token,
          eventId,
        });
        setPhase({
          kind: 'success',
          alreadyCheckedIn: result.alreadyCheckedIn,
          memberName: result.member.name,
          memberAvatar: result.member.avatar,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Check-in failed. Please try again.';
        setPhase({ kind: 'error', message: msg });
      }
    },
    [checkinMutation],
  );

  // Store performCheckin in a ref for the self-serve effect.
  const performCheckinRef = useRef(performCheckin);
  performCheckinRef.current = performCheckin;

  const handleRetry = useCallback(() => {
    setPhase({ kind: 'scanning' });
    setManualCode('');
    if (cameraError || !videoRef.current) return;

    void startScanner(videoRef.current, (code) => {
      let token = code.trim();
      try {
        const url = new URL(code);
        token = url.searchParams.get('code') ?? code.trim();
      } catch {
        // Not a URL.
      }
      void performCheckinRef.current?.(token);
    })
      .then((stop) => {
        scannerCleanupRef.current = stop;
      })
      .catch(() => {
        setCameraError(true);
      });
  }, [cameraError]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const code = manualCode.trim();
      if (!code) return;
      void performCheckin(code);
      setManualCode('');
    },
    [manualCode, performCheckin],
  );

  // Online/offline detection.
  useEffect(() => {
    setIsOnline(navigator.onLine);
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // Sync queue count.
  useEffect(() => {
    setQueueCount(loadQueue().length);
  }, []);

  // Flush queue on reconnect.
  useEffect(() => {
    if (!isOnline) return;
    const queue = loadQueue();
    if (queue.length === 0) return;

    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    flushTimerRef.current = setTimeout(async () => {
      const remaining: QueuedCheckin[] = [];
      for (const entry of queue) {
        try {
          await checkinMutation.mutateAsync({ token: entry.code, eventId: entry.eventId });
        } catch {
          remaining.push(entry);
        }
      }
      saveQueue(remaining);
      setQueueCount(remaining.length);
    }, OFFLINE_FLUSH_DEBOUNCE_MS);

    return () => {
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    };
  }, [isOnline, checkinMutation]);

  // Self-serve mode: auto-submit prefilled code on mount.
  useEffect(() => {
    const code = prefilledCodeRef.current;
    const eventId = selectedEventIdRef.current;
    if (code && eventId && performCheckinRef.current) {
      void performCheckinRef.current(code);
    }
    // Intentional: runs once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Start QR scanner when event is selected and camera is ready.
  useEffect(() => {
    if (!selectedEventId || prefilledCode || cameraError || !videoRef.current) return;

    let stopped = false;

    void startScanner(videoRef.current, (code) => {
      if (stopped) return;
      let token = code.trim();
      try {
        const url = new URL(code);
        token = url.searchParams.get('code') ?? code.trim();
      } catch {
        // Not a URL.
      }
      void performCheckinRef.current?.(token);
    })
      .then((stop) => {
        if (stopped) return;
        scannerCleanupRef.current = stop;
      })
      .catch(() => {
        setCameraError(true);
      });

    return () => {
      stopped = true;
      scannerCleanupRef.current?.();
      scannerCleanupRef.current = null;
    };
  }, [selectedEventId, prefilledCode, cameraError]);

  return {
    selectedEventId,
    setSelectedEventId,
    manualCode,
    setManualCode,
    phase,
    cameraError,
    isOnline,
    queueCount,
    videoRef,
    handleRetry,
    handleSubmit,
    isOperatorMode: !prefilledCode,
    isDisabled: !selectedEventId,
  };
}

export function CheckinOperator({ events, prefilledCode }: CheckinOperatorProps): ReactElement {
  const state = useCheckinMachine(events, prefilledCode ?? null);

  return (
    <IslandRoot>
      <div className="space-y-6">
        {!state.isOnline && <OfflineBanner queueCount={state.queueCount} />}

        {state.isOperatorMode && (
          <EventSelector
            events={events}
            selectedId={state.selectedEventId}
            onSelect={state.setSelectedEventId}
            disabled={state.isDisabled}
          />
        )}

        {state.phase.kind === 'success' && (
          <SuccessScreen
            alreadyCheckedIn={state.phase.alreadyCheckedIn}
            memberName={state.phase.memberName}
            memberAvatar={state.phase.memberAvatar}
            onReset={state.handleRetry}
          />
        )}

        {state.phase.kind === 'error' && (
          <ErrorScreen message={state.phase.message} onRetry={state.handleRetry} />
        )}

        {state.phase.kind !== 'success' && state.phase.kind !== 'error' && (
          <>
            <CameraViewfinder videoRef={state.videoRef} cameraError={state.cameraError} />
            <ManualEntryForm
              manualCode={state.manualCode}
              onManualCodeChange={state.setManualCode}
              onSubmit={state.handleSubmit}
              disabled={state.isDisabled}
              submitting={state.phase.kind === 'submitting'}
            />
          </>
        )}
      </div>
    </IslandRoot>
  );
}
