# Design System Compliance Report

**Date:** 2026-06-22
**Scope:** `apps/web/src/` — all `.tsx` and `.css` files
**Reference:** `docs/04-development/design-system/Design system for AI agents/readme.md`

---

## Summary

| Area | Status | Detail |
|---|---|---|
| CSS token values | ✅ Pass | `design-system/tokens.css` is identical to the reference |
| CSS entry point wiring | ✅ Pass | `globals.css` imports all three layers correctly |
| Font loading | ✅ Pass | Geist, Inter, JetBrains Mono loaded via Google Fonts |
| Dark mode default | ✅ Pass | `data-theme="dark"` on `<html>` in `Layout.astro` |
| Icon library | ✅ Pass | Lucide only — no PrimeIcons, Heroicons, or Phosphor detected |
| Raw hex colors | ❌ Fail | 115 instances across 31 component files |
| Gradients | ❌ Fail | 1 instance in `MeDashboard.tsx` |
| Emoji in product copy | ❌ Fail | `✓` / `✅` / `❌` in ~10 places |
| `--accent` token misuse | ❌ Fail | Used as success-green in 3 places |
| Font weight range | ⚠️ Minor | Geist/Inter missing `wght@300` and `wght@700` |

---

## Violations

### 1. Raw hex colors — 115 instances in 31 files

**Rule:** "Always use `var(--token-name)` — never raw hex in CSS (except inside SVG `<img>` fallbacks)."

The most common patterns:

- **Error color as hex** — `color: '#dc2626'`, `color: '#c00'` → use `var(--destructive)` or `.helper.error`
- **Success/warning color as hex** — `'#10b981'`, `'#16a34a'`, `'#f59e0b'` → use `var(--success)`, `var(--warning)`
- **Status color maps** — `AuditEventsList.tsx`, `MeAccessLog.tsx`, `AdminInvitesList.tsx` define inline `Record<string, string>` with raw hex values → replace with token-based badge/dot classes

**Note:** `lib/og-template.tsx` (4 instances) generates server-rendered SVG for OG images — this is the one documented exception where CSS variables cannot be used.

**Worst offenders by count:**

| File | Instances |
|---|---|
| `workspace/CountryProvisioningWizard.tsx` | 19 |
| `workspace/TelegramCabinet.tsx` | 17 |
| `workspace/TgBroadcastComposer.tsx` | 9 |
| `workspace/TgBroadcastsList.tsx` | 8 |
| `workspace/FormBuilderPanel.tsx` | 4 |
| `workspace/AdminInvitesList.tsx` | 4 |
| `MeProfileForm.tsx` | 4 |

---

### 2. Gradient — 1 instance

**Rule:** "No gradients — none exist in the system."

```
apps/web/src/components/MeDashboard.tsx:867
  'linear-gradient(135deg, color-mix(in oklch, var(--primary) 14%, var(--card)) 0%, var(--card) 60%)'
```

Fix: replace with a solid `var(--card)` background with a teal-tinted border, or use the `.card.hoverable` pattern.

---

### 3. Emoji in product copy — ~10 instances

**Rule:** "Emoji: never in product copy."

| File | Usage |
|---|---|
| `OnboardingForm.tsx:254` | `✓ Your AI Qadam mailbox is ready.` |
| `RegistrationSidebar.tsx:235` | `✓ You're registered` |
| `AdminUserCreateForm.tsx:111` | `✓ Invite created` |
| `AnnounceComposer.tsx:602–604` | `✅ Sent:` / `❌ Failed:` |
| `EventControlPanel.tsx:201` | `Refreshed ✓` |

Fix: replace `✓` with a Lucide `<Check size={16} />` icon; replace `✅`/`❌` with `<CheckCircle>` / `<XCircle>` styled with `var(--success)` / `var(--destructive)`.

---

### 4. `--accent` misused as success green — 3 instances

**Rule:** `var(--primary)` is brand teal only. `--accent` resolves to the same muted/neutral value as `--secondary` — it is not green.

```
OnboardingForm.tsx:162      background: 'var(--accent, #10b981)'  ← step indicator active state
OnboardingForm.tsx:253      color: 'var(--accent, #10b981)'       ← success heading
AdminUserCreateForm.tsx:111 color: 'var(--accent, #10b981)'       ← invite-created heading
```

Fix: replace `var(--accent, #10b981)` with `var(--success)` for success states.

---

### 5. Font weight range (minor)

`Layout.astro` loads:
```
Geist:wght@400;500;600
Inter:wght@400;500;600
JetBrains+Mono:wght@400;500;600
```

The design system recommends also loading `300` and `700` for Geist (hero/display headings). This is low-risk — the browser will synthesize bold/thin — but worth updating for pixel-perfect display headings:

```html
family=Geist:wght@300;400;500;600;700&family=Inter:ital,wght@0,400;0,500;0,600;0,700;1,400&family=JetBrains+Mono:ital,wght@0,400;0,500;1,400
```

---

## What is correct

- Token values are in perfect sync with the reference design system
- No foreign icon libraries (no PrimeIcons, Heroicons, Phosphor, etc.)
- Lucide used correctly via `lucide-react` imports throughout
- `globals.css` cleanly imports tokens → components → portal — correct layer order
- Dark mode is the default theme as specified
- Cards use `.card` class with `var(--border)` — no shadow-heavy patterns
- Motion uses 150ms / `var(--ease-out)` consistently in the CSS layer
- `--font-sans` set on `body`, `14px` base size — matches spec

---

## Recommended fix order

1. **Create a shared `statusColor()` helper** that maps status strings to token-based CSS — eliminate the `Record<string, hex>` pattern in audit/access log components (high duplication, easy win).
2. **Fix `--accent` → `--success`** in OnboardingForm and AdminUserCreateForm (3 lines, trivial).
3. **Sweep `workspace/` components** for raw hex — CountryProvisioningWizard and TelegramCabinet alone account for 36 instances.
4. **Replace emoji** with Lucide icons in the 5 affected files.
5. **Remove gradient** from MeDashboard.
6. **Update Google Fonts link** in Layout.astro for full weight range.
