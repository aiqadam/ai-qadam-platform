# Step 3 — Code Summary

**Workflow:** wf-20260802-fix-194
**Step:** 3 — Code Summary (CodeDeveloper equivalent)
**Date:** 2026-08-02

## Diff (verbatim, vs. `origin/main`)

```diff
diff --git a/apps/web-next/src/pages/events/[id].astro b/apps/web-next/src/pages/events/[id].astro
@@ -101,18 +101,31 @@
 // F-WebU8 — tab routing. Validate the ?tab= param against the closed
 // set; pick a sensible default from the event's clock relative to
 // (starts_at, ends_at). Fully empty content (no recordings on a past
 // event, no livestream URL) still falls back to the tab's own empty
 // state so the page never looks broken.
+//
+// Defensive-fallback contract (mirrors `deriveDefaultTab` in
+// apps/web-next/src/lib/event-lifecycle-tab.test.ts so the inline
+// page logic matches its unit-test spec — see ISS-EVT-LIFECYCLE-TAB-001):
+//   • both dates parseable: 'finished' if past endsAt, else 'live' if
+//     past startsAt, else 'upcoming'
+//   • only startsAt unparseable: ALWAYS 'upcoming' — an event with a
+//     broken startsAt cannot confidently be marked finished
+//   • only endsAt unparseable: 'live' if past startsAt, else 'upcoming'
+//     (`now >= NaN` is false so 'finished' is unreachable)
+//   • both unparseable: 'upcoming' (both NaN comparisons false)
 const tabParam = Astro.url.searchParams.get('tab');
 const tabRequested: EventDetailTab | null =
   tabParam && (VALID_TABS as readonly string[]).includes(tabParam)
     ? (tabParam as EventDetailTab)
     : null;
 const now = Date.now();
 const startsAtMs = Date.parse(event.startsAt);
 const endsAtMs = Date.parse(event.endsAt);
+const startsAtValid = !Number.isNaN(startsAtMs);
+const endsAtValid = !Number.isNaN(endsAtMs);
 const defaultTab: EventDetailTab =
-  now >= endsAtMs ? 'finished' : now >= startsAtMs ? 'live' : 'upcoming';
+  startsAtValid && endsAtValid && now >= endsAtMs
+    ? 'finished'
+    : startsAtValid && now >= startsAtMs
+      ? 'live'
+      : 'upcoming';
 const activeTab: EventDetailTab = tabRequested ?? defaultTab;
```

```diff
diff --git a/apps/web-next/src/lib/event-lifecycle-tab.test.ts b/apps/web-next/src/lib/event-lifecycle-tab.test.ts
@@ -22,17 +22,40 @@
-import { describe, expect, it } from 'vitest';
-
 type EventDetailTab = 'upcoming' | 'live' | 'finished' | 'forum';
 
-// Mirrors [id].astro lines 106-110 exactly:
-//   const now = Date.now();
-//   const startsAtMs = Date.parse(event.startsAt);
-//   endsAtMs = Date.parse(event.endsAt);
-//   const defaultTab: EventDetailTab =
-//     now >= endsAtMs ? 'finished' : now >= startsAtMs ? 'live' : 'upcoming';
+// Mirrors [id].astro's `defaultTab` derivation (defensive-fallback
+// contract — see ISS-EVT-LIFECYCLE-TAB-001). The inline Astro logic
+// guards `now >= endsAtMs` and `now >= startsAtMs` with
+// `Number.isNaN(...)` so an unparseable ISO string cannot accidentally
+// trigger a "finished" verdict purely because the OTHER date still
+// parses — Date.parse returns NaN for a bad string, and any comparison
+// with NaN is false, but the naive ternary's first branch would still
+// win whenever the unrelated date is past. Re-implemented here as a
+// pure function so Vitest can exercise it without going through the
+// .astro frontmatter.
+//
+// Contract:
+//   • both dates parseable: 'finished' if past endsAt, else 'live' if
+//     past startsAt, else 'upcoming'
+//   • only startsAt unparseable: ALWAYS 'upcoming' — an event with a
+//     broken startsAt cannot confidently be marked finished
+//   • only endsAt unparseable: 'live' if past startsAt, else 'upcoming'
+//     (`now >= NaN` is false so 'finished' is unreachable)
+//   • both unparseable: 'upcoming' (both NaN comparisons false)
 function deriveDefaultTab(now: number, startsAt: string, endsAt: string): EventDetailTab {
   const startsAtMs = Date.parse(startsAt);
   const endsAtMs = Date.parse(endsAt);
-  return now >= endsAtMs ? 'finished' : now >= startsAtMs ? 'live' : 'upcoming';
+  const startsAtValid = !Number.isNaN(startsAtMs);
+  const endsAtValid = !Number.isNaN(endsAtMs);
+  if (startsAtValid && endsAtValid && now >= endsAtMs) return 'finished';
+  if (startsAtValid && now >= startsAtMs) return 'live';
+  return 'upcoming';
 }
```

## Design rationale

The original ternary is the simplest possible implementation of the
"finished if past endsAt, else live if past startsAt, else upcoming"
rule. It works correctly when both inputs parse. It breaks on
malformed input because **JS comparisons with NaN are always false,
not always true**:

| Input | Result of original ternary | Reason |
|---|---|---|
| both parseable, now past endsAt | `'finished'` ✓ | First branch matches |
| both parseable, now past startsAt | `'live'` ✓ | First branch false; second matches |
| both parseable, now before startsAt | `'upcoming'` ✓ | Both branches false |
| **both unparseable** | `'upcoming'` ✓ | Both `>=` are false (NaN coercion) |
| endsAt unparseable, now past startsAt | `'live'` ✓ | First branch false (NaN), second matches |
| endsAt unparseable, now before startsAt | `'upcoming'` ✓ | Both branches false |
| **startsAt unparseable, endsAt past** | **`'finished'` ✗** | First branch matches because `now >= endsAtMs` is true — **this is the bug** |

The fix: only mark `'finished'` when BOTH dates parseable (so an
unparseable startsAt cannot enable the "finished" verdict via the
unrelated endsAt).

## Verification

| Check | Command | Result |
|---|---|---|
| Targeted test | `cd apps/web-next && pnpm test src/lib/event-lifecycle-tab.test.ts` | 9/9 pass |
| Full web-next suite | `cd apps/web-next && pnpm test` | 40/40 files, 1017/1017 tests pass |
| Typecheck | `cd apps/web-next && pnpm typecheck` | 0 errors, 0 warnings |
| Build | `cd apps/web-next && pnpm build` | Success (`Server built in 13.98s`); pre-existing warnings unchanged |
| Lint | `cd apps/web-next && pnpm lint` | 2 pre-existing warnings (unrelated); none in this PR's diff |
