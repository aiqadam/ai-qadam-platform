# Marketing UTM scheme — the canonical attribution standard

Status: locked. Changes require an ADR. Sprint 0.8 (roadmap §7).

UTM parameters are how we tell which channel, account, or campaign drove
a click. They feed three things: Plausible's source breakdown, the
`acquisition_source` columns on `registrations` (first-touch + last-touch),
and the marketing dashboard (Sprint 5.8). If a value isn't consistent, the
attribution is wrong; if the convention drifts, history breaks. Lock it
once, use it everywhere.

For the rationale, AARRR funnel ties, and dashboard plans see
[marketing-and-pr-playbook.md §16](./marketing-and-pr-playbook.md#16-utm-scheme--attribution-standard).

## 1. Where UTM goes (and doesn't)

UTM-tag every **external entry point** to aiqadam.org:

- LinkedIn posts, comments, DMs
- Telegram channel and group posts
- Email (newsletters, transactional with marketing intent)
- Sponsor / speaker / member co-promotion posts
- Influencer or partner placements
- Paid placements (LinkedIn, Meta, Telegram ads) when those ship
- Aggregator listings (Lu.ma, Eventbrite mirrors, etc.)

Do **not** UTM-tag:

- Internal links inside aiqadam.org or its subdomains
- Direct sharing of bare event URLs in 1:1 conversations where attribution
  has no operational use
- QR codes pointing at in-room check-in URLs

The rule of thumb: if a click crosses from "somewhere on the internet"
into our domain and we want to know which somewhere, it carries UTM.

## 2. The four parameters

| Param | What it is | Required | Examples |
|---|---|---|---|
| `utm_source` | The specific account or channel that drove the click | Yes | `binali-li`, `viktor-li`, `aiqadam-orgli`, `aiqadam-tg-uz`, `inf-{handle}`, `partner-{slug}`, `speaker-{handle}`, `sponsor-{slug}`, `member-{handle}` |
| `utm_medium` | The channel type | Yes | `linkedin_post`, `linkedin_message`, `telegram_channel`, `telegram_group`, `email_digest`, `email_transactional`, `referral`, `sponsor_post`, `speaker_post`, `paid_li`, `paid_meta`, `paid_telegram`, `aggregator` |
| `utm_campaign` | The specific campaign or event the link belongs to | Yes | `event-12`, `quarterly-digest-q2-26`, `country-launch-kz`, `sponsor-recruitment-q3-26` |
| `utm_content` | Variant identifier (A/B testing) | Optional | `headline-a`, `image-v2`, `cta-register` |

`utm_term` is **not used**. We reserve it for paid-search ads, which we
don't run today.

## 3. Allowed character set + casing

Strict rules. The URL builder enforces them; manual construction must
match.

- All four values are **lowercase**.
- `source`, `medium`, `campaign`: words separated by **hyphens** (`-`).
  No underscores. No spaces. No dots.
  - Exception: `medium` uses **underscores** between word-pairs that
    encode a channel-and-format (e.g. `linkedin_post`, `email_digest`).
    Treat these as fixed strings from the table above — do not invent
    new combinations.
- `content`: lowercase with hyphens; underscores are allowed for
  A/B variant codes (`headline_a_vs_b` reads cleaner than
  `headline-a-vs-b`).
- Allowed characters: `a-z`, `0-9`, `-`, `_`. Everything else is rejected.
- No leading or trailing hyphens.
- No consecutive hyphens (`--` is invalid).
- Maximum length per value: **64 characters**.

## 4. Stable values — never rename

Once a value enters circulation, **never change its spelling**. If
`utm_source=binali-li` is in use, do not later switch to
`binali-linkedin` — historical traffic will fragment across two source
buckets and breaks year-over-year comparisons. The same rule applies to
`utm_medium` and `utm_campaign` values once published.

If you genuinely need a new bucket, add a new value alongside the old
one. Document the change in this file; flag it to operators in the
weekly digest.

## 5. Canonical values

### 5.1 `utm_source` — accounts and people

| Pattern | When |
|---|---|
| `binali-li` | Binali Rustamov's LinkedIn (personal) |
| `viktor-li` | Viktor Drukker's LinkedIn (personal) |
| `aiqadam-orgli` | AI Qadam org page on LinkedIn |
| `aiqadam-tg-{country}` | The country-specific Telegram channel (`aiqadam-tg-uz`, `aiqadam-tg-kz`, `aiqadam-tg-tj`) |
| `aiqadam-tg-global` | The pan-CA Telegram channel |
| `speaker-{handle}` | A specific speaker's social account — `handle` is the agreed slug from the speaker kit |
| `sponsor-{slug}` | A specific sponsor's post or asset — `slug` matches the sponsor's row in Directus |
| `partner-{slug}` | A partner organization (universities, communities, accelerators) |
| `inf-{handle}` | An influencer placement (sponsored or organic) |
| `member-{handle}` | A specific member sharing via referral code (Sprint 3.6) |
| `newsletter` | The monthly digest |

### 5.2 `utm_medium` — channel types

These are the only allowed values. Adding a new one requires an ADR.

| Value | Meaning |
|---|---|
| `linkedin_post` | Organic LinkedIn post or comment |
| `linkedin_message` | LinkedIn DM (1:1 or small-group) |
| `telegram_channel` | Telegram broadcast channel post |
| `telegram_group` | Telegram group / chat message |
| `email_digest` | Newsletter / digest email |
| `email_transactional` | Operational email with marketing payload (rare; needs marketing-playbook §6 sign-off) |
| `referral` | Member-to-member share via referral code |
| `sponsor_post` | Co-promotion from a sponsor account |
| `speaker_post` | Co-promotion from a speaker account |
| `paid_li` | Paid LinkedIn placement (Sprint 5+ capability) |
| `paid_meta` | Paid Meta / Instagram placement |
| `paid_telegram` | Paid Telegram ad |
| `aggregator` | Lu.ma, Eventbrite, or other event-listing mirrors |

### 5.3 `utm_campaign` — the thing being promoted

Patterns:

| Pattern | When |
|---|---|
| `event-{N}` | A specific event. `N` is the integer event ID from Directus. |
| `quarterly-digest-q{1-4}-{YY}` | The sponsor quarterly digest. `quarterly-digest-q2-26` = Q2 2026. |
| `country-launch-{cc}` | The activation of a new country (`country-launch-kz`). |
| `sponsor-recruitment-q{1-4}-{YY}` | A quarter's sponsor-pipeline push. |
| `speaker-recruitment-q{1-4}-{YY}` | A quarter's speaker-pipeline push. |
| `evergreen` | Ongoing acquisition not tied to a specific event or quarter — bio links, footer links, etc. Use sparingly. |

### 5.4 `utm_content` — variant only

Set only when running an A/B test. Common patterns:

- `headline-a` / `headline-b`
- `image-v1` / `image-v2`
- `cta-register` / `cta-rsvp`

When not A/B testing, omit the parameter entirely. An empty
`utm_content=` value is invalid.

## 6. Worked examples

A LinkedIn post by Binali promoting AI Drinks UZ #12:

```
https://uz.aiqadam.org/events/12?utm_source=binali-li&utm_medium=linkedin_post&utm_campaign=event-12
```

A sponsor (Acme) co-promoting the same event from their LinkedIn:

```
https://uz.aiqadam.org/events/12?utm_source=sponsor-acme&utm_medium=sponsor_post&utm_campaign=event-12
```

Member referral from `@aliya` (Sprint 3.6 referral-code flow uses this
shape, with the referral code separate):

```
https://uz.aiqadam.org/?utm_source=member-aliya&utm_medium=referral&utm_campaign=evergreen
```

Q2 2026 sponsor digest CTA, A/B testing two headlines:

```
https://aiqadam.org/sponsors/?utm_source=newsletter&utm_medium=email_digest&utm_campaign=quarterly-digest-q2-26&utm_content=headline-a
https://aiqadam.org/sponsors/?utm_source=newsletter&utm_medium=email_digest&utm_campaign=quarterly-digest-q2-26&utm_content=headline-b
```

## 7. The URL builder

The single supported way to construct UTM-tagged links is the
URL builder, hosted at:

```
https://workspace.aiqadam.org/marketing/url-builder
```

(Local development: `http://localhost:4321/marketing/url-builder`.)

Operators paste the destination URL, pick the four values from the
allowed lists, and copy the result. The builder validates against the
rules in §3, normalises casing and whitespace, and previews the final URL
live. Manual construction is permitted only when the builder is
unavailable — values must still match §3.

## 8. Attribution model

The platform captures **first-touch** and **last-touch** UTM on
registration. Both live in `acquisition_source` jsonb on `registrations`
(see Sprint 3.6 schema). First-touch tells us which channel discovers
members; last-touch tells us which channel closes them. Multi-touch
attribution is deferred to Phase ζ when traffic justifies the model.

The first-touch cookie persists for **90 days**. Visits without UTM in
the same browser inherit the first-touch value.

## 9. Reviews + drift

The Plausible dashboard is the source of truth for what UTM strings
exist in the wild. Once a month an operator runs:

1. Plausible → Sources → list distinct `utm_source` values
2. Compare against §5.1
3. Flag drift in the weekly digest; fix at the source post (don't rename
   the bucket).

If a new bucket is needed, raise a PR amending §5 and document the
trigger in the PR description.

## 10. Open extensions

- Member referral codes (Sprint 3.6) layer on top of UTM via a separate
  `?ref=` parameter; the builder will gain a "referral mode" once that
  ships.
- Paid placements (Sprint 5+) will validate that `utm_medium` starts
  with `paid_` and require a budget code in `utm_content`.
- Phase ζ multi-touch model will keep all UTM hits in a `touchpoints`
  collection rather than only first/last on registration.

---

**See also:**

- [marketing-and-pr-playbook.md §16](./marketing-and-pr-playbook.md#16-utm-scheme--attribution-standard) — rationale and dashboard ties.
- [marketing-and-pr-playbook.md §17](./marketing-and-pr-playbook.md#17-marketing-dashboard-metrics--dashboards) — the dashboards that consume this data.
- `apps/web/src/lib/utm.ts` — the runtime implementation.
- `apps/web/src/pages/marketing/url-builder.astro` — the URL builder page.
