import { type ReactElement, useEffect, useRef, useState } from 'react';

// Organizer-side fullscreen QR scanner (s4-4). Browser BarcodeDetector
// API where available (Chrome / Edge / Safari 17+); manual-entry
// fallback otherwise. POSTs to /v1/checkin/:code (unchanged from
// Phase 1). On success the scanner pauses for ~1.5s with a toast,
// then resumes — ready for the next member's QR.

interface CheckinResponse {
  status: 'ok';
  alreadyCheckedIn: boolean;
  checkedInAt: string;
  event: {
    id: string;
    title: string;
    startsAt: string;
    endsAt: string;
    location: string | null;
  };
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'denied' }
  | { kind: 'unsupported' }
  | { kind: 'scanning' }
  | { kind: 'submitting'; code: string }
  | { kind: 'success'; event: CheckinResponse['event']; alreadyCheckedIn: boolean }
  | { kind: 'failed'; message: string };

interface BarcodeDetectorLike {
  detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue: string }>>;
}

interface BarcodeDetectorCtor {
  new (init?: { formats?: string[] }): BarcodeDetectorLike;
  getSupportedFormats: () => Promise<string[]>;
}

declare global {
  interface Window {
    BarcodeDetector?: BarcodeDetectorCtor;
  }
}

async function postCheckin(code: string): Promise<CheckinResponse> {
  const res = await fetch(`/api/v1/checkin/${code}`, { method: 'POST' });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? `check-in failed: HTTP ${res.status}`);
  }
  return (await res.json()) as CheckinResponse;
}

const TOAST_HOLD_MS = 1500;

export function CheckinScanner(): ReactElement {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [counter, setCounter] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const phaseRef = useRef<Phase>({ kind: 'idle' });
  const lastCodeRef = useRef<string | null>(null);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    if (!window.BarcodeDetector) {
      setPhase({ kind: 'unsupported' });
      return;
    }

    let stopped = false;
    let detector: BarcodeDetectorLike;
    try {
      detector = new window.BarcodeDetector({ formats: ['qr_code'] });
    } catch {
      setPhase({ kind: 'unsupported' });
      return;
    }

    async function start(): Promise<void> {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (stopped) {
          for (const t of stream.getTracks()) t.stop();
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setPhase({ kind: 'scanning' });
        void loop();
      } catch {
        setPhase({ kind: 'denied' });
      }
    }

    async function loop(): Promise<void> {
      while (!stopped) {
        const cur = phaseRef.current;
        // Only scan when ready; pause through submitting / toast phases.
        if (cur.kind !== 'scanning') {
          await new Promise((r) => setTimeout(r, 120));
          continue;
        }
        if (!videoRef.current || videoRef.current.readyState < 2) {
          await new Promise((r) => setTimeout(r, 100));
          continue;
        }
        try {
          const codes = await detector.detect(videoRef.current);
          const value = codes[0]?.rawValue;
          if (value && value !== lastCodeRef.current) {
            lastCodeRef.current = value;
            await handleDecoded(value);
          } else {
            await new Promise((r) => setTimeout(r, 200));
          }
        } catch {
          await new Promise((r) => setTimeout(r, 200));
        }
      }
    }

    async function handleDecoded(raw: string): Promise<void> {
      // Accept either a bare UUID or a full /checkin?code=... URL.
      const code = extractCode(raw);
      if (!code) {
        flashFail("Couldn't parse that QR");
        return;
      }
      setPhase({ kind: 'submitting', code });
      try {
        const result = await postCheckin(code);
        setPhase({
          kind: 'success',
          event: result.event,
          alreadyCheckedIn: result.alreadyCheckedIn,
        });
        if (!result.alreadyCheckedIn) setCounter((c) => c + 1);
        setTimeout(() => {
          if (!stopped) {
            lastCodeRef.current = null;
            setPhase({ kind: 'scanning' });
          }
        }, TOAST_HOLD_MS);
      } catch (err) {
        flashFail(err instanceof Error ? err.message : 'check-in failed');
      }
    }

    function flashFail(message: string): void {
      setPhase({ kind: 'failed', message });
      setTimeout(() => {
        if (!stopped) {
          lastCodeRef.current = null;
          setPhase({ kind: 'scanning' });
        }
      }, TOAST_HOLD_MS + 500);
    }

    void start();

    return () => {
      stopped = true;
      const tracks = streamRef.current?.getTracks() ?? [];
      for (const t of tracks) t.stop();
      streamRef.current = null;
    };
  }, []);

  if (phase.kind === 'unsupported') return <Unsupported />;
  if (phase.kind === 'denied') return <Denied />;

  const toast = toastForPhase(phase);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#000',
        overflow: 'hidden',
      }}
    >
      <video
        ref={videoRef}
        playsInline
        muted
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
        }}
      >
        <track kind="captions" />
      </video>

      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background: 'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.6) 100%)',
        }}
      />

      <div
        style={{
          position: 'absolute',
          top: 16,
          left: 16,
          right: 16,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          color: '#fff',
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}
      >
        <span style={{ background: 'rgba(0,0,0,0.5)', padding: '6px 10px', borderRadius: 6 }}>
          Scanner · {counter} checked in
        </span>
        <a
          href="/admin"
          style={{
            background: 'rgba(0,0,0,0.5)',
            padding: '6px 10px',
            borderRadius: 6,
            color: '#fff',
            textDecoration: 'none',
          }}
        >
          ✕ Close
        </a>
      </div>

      <ScannerBox phase={phase.kind} />

      {toast && (
        <div
          style={{
            position: 'absolute',
            bottom: 32,
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '12px 20px',
            borderRadius: 10,
            background: toast.bg,
            color: '#fff',
            fontFamily: 'var(--font-display)',
            fontWeight: 600,
            fontSize: 15,
            maxWidth: '88vw',
            textAlign: 'center',
            boxShadow: '0 10px 30px rgba(0,0,0,0.4)',
          }}
        >
          {toast.body}
        </div>
      )}
    </div>
  );
}

function extractCode(raw: string): string | null {
  // Allow plain UUID or a URL with ?code=...
  const uuid = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;
  const m = uuid.exec(raw);
  return m?.[1] ?? null;
}

function ScannerBox({ phase }: { phase: Phase['kind'] }): ReactElement {
  return (
    <div
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 'min(70vw, 320px)',
        aspectRatio: '1 / 1',
        border: '2px solid #fff',
        borderRadius: 16,
        overflow: 'hidden',
        boxShadow: '0 0 0 9999px rgba(0,0,0,0.35)',
      }}
    >
      {phase === 'scanning' && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            height: 2,
            background: 'var(--primary, oklch(0.7 0.105 192))',
            animation: 'aiqadam-scan 1.6s linear infinite',
            boxShadow: '0 0 8px var(--primary, oklch(0.7 0.105 192))',
          }}
        />
      )}
      <style>{`
        @keyframes aiqadam-scan {
          0% { top: 0; }
          50% { top: calc(100% - 2px); }
          100% { top: 0; }
        }
      `}</style>
    </div>
  );
}

function toastForPhase(phase: Phase): { body: string; bg: string } | null {
  if (phase.kind === 'submitting') {
    return { body: 'Checking in…', bg: 'rgba(0,0,0,0.7)' };
  }
  if (phase.kind === 'success') {
    return {
      body: phase.alreadyCheckedIn
        ? `Already checked in · ${phase.event.title}`
        : `✓ Checked in · ${phase.event.title}`,
      bg: 'color-mix(in oklch, oklch(0.6 0.18 145) 90%, transparent)',
    };
  }
  if (phase.kind === 'failed') {
    return { body: phase.message, bg: 'color-mix(in oklch, oklch(0.6 0.18 25) 90%, transparent)' };
  }
  return null;
}

function Unsupported(): ReactElement {
  return (
    <div style={messageBox}>
      <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, margin: '0 0 8px' }}>
        Camera scanner unsupported
      </h2>
      <p style={{ fontSize: 13, color: 'var(--muted-foreground)', margin: '0 0 16px' }}>
        This browser doesn't expose the BarcodeDetector API. Use Chrome (desktop or Android), Edge,
        or Safari 17+, or paste the check-in URL directly into the address bar.
      </p>
      <a href="/checkin" className="btn btn-outline" style={{ textDecoration: 'none' }}>
        Use member check-in page
      </a>
    </div>
  );
}

function Denied(): ReactElement {
  return (
    <div style={messageBox}>
      <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, margin: '0 0 8px' }}>
        Camera access denied
      </h2>
      <p style={{ fontSize: 13, color: 'var(--muted-foreground)', margin: 0 }}>
        Grant camera permission in your browser, then reload the page.
      </p>
    </div>
  );
}

const messageBox: React.CSSProperties = {
  padding: 32,
  border: '1px solid var(--border)',
  borderRadius: 12,
  background: 'var(--card)',
  maxWidth: 480,
  margin: '40px auto',
  textAlign: 'center',
};
