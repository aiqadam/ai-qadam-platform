# Portal Content Triage — 2026-08-19

Source directory: `c:\Users\tvolo\dev\ai-dala\aiqadam\portal-content\20260819\`
13 source files reviewed. Extraction method noted per file (some PDFs had a font-embedding
defect that strips Cyrillic on `pdftotext`; the docx/pptx XML — unzip + tag-strip — was used
instead wherever this occurred, and produced clean, complete text).

---

## 1. File-by-file triage

### 1. `AI Qadam Manifesto.docx`
- **Language(s):** Russian primary body; bilingual title only ("Манифест сообщества AI Qadam
  Community Manifesto" — the EN phrase is a title-only gloss, not a full translation).
- **Summary:** The community's foundational values statement. States AI Qadam's purpose (open
  Central Asian AI community, aiming to become regional AI-community infrastructure), lists the
  seven core principles (Honesty over hype, Practice over theory, Quality over quantity,
  Right to fail, Community not advertising, Multilingualism, People for people), then explains
  "how we live" — the equals council/consent governance model, shared accountability, and the
  country-lead structure. Signed by five named community leads.
- **Theme:** **About Us** (mission, values, "who we are"). Could also lightly inform
  **Community Rules & Documents** (it's the values source the longer governance docs cite),
  but its natural home is About Us.

### 2. `AI Qadam Charter v0 1.docx`
- **Language(s):** Russian only (explicitly marked "Язык черновика: Русский" with a note that
  a bilingual public edition is a future step — i.e. no English version exists yet).
- **Summary:** A draft (v0.1, "СОГЛАШЕНИЕ СООБЩЕСТВА И УПРАВЛЕНИЯ" / "Community & Governance
  Charter") that explicitly merges two earlier documents — "Положение о Global Board" (v1.0)
  and "Community Agreement" (v1.3) — reconciled with the Kazakhstan MoU. Covers the seven
  principles, roles (Founder/Хранитель, Country Lead, direction coordinators, operating core),
  decision-making by consent, country veto and reputational veto, inter-chapter governance,
  finance model, brand/IP, ethics code, conflict escalation, and termination procedures. Includes
  three appendices: RACI matrix, principle examples, and the core team roster.
- **Theme:** **Community Rules & Documents.** This is the single most complete/current
  governance source (superset of the two separate older docs below) — best primary source for
  a "governance" or "how we're organized" page section.

### 3. `AI Qadam BFT v0_1 (2).docx` (+ same-name PDF)
- **Language(s):** Russian only.
- **Summary:** "Бизнес-функциональные требования" — a **product/engineering requirements
  document** for the AI Qadam platform (reputation graph, profile, Events/Education/
  People/Accelerator modules, partner visibility controls). Not narrative or governance content;
  it's a technical specification for developers, complete with FR/BR IDs, a RACI-style
  requirements table, and a phased roadmap.
- **Extraction note:** the `.docx` had an unusual embedded font causing every Cyrillic "к" to
  render as "ĸ" (a ligature substitution) — cosmetic only, text is otherwise fully readable.
  The companion PDF is **not usable** — `pdftotext` strips almost all Cyrillic characters from
  it (systemic font-encoding defect, see note at top). Use the `.docx` extraction, not the PDF.
- **Theme:** **None of the three themes.** This is an internal product-requirements document,
  not portal/marketing content. Flag as **out of scope** for the three pages — reference-only,
  should not be pulled from for any public page.

### 4. `AI Qadam Global Board Положение (2).docx`
- **Language(s):** Russian only.
- **Summary:** "Положение о Global Board" v1.0 — an earlier, narrower governance document
  focused specifically on the Global Board: its composition, chair, voting members vs.
  advisory ("direction") members, the two veto types (Country Lead veto, Founder reputational
  veto), voting procedure, Country Board mechanics, transparency/reporting duties, deadlock
  procedure, and Board entry/exit procedures. Also repeats the seven principles with "good/bad"
  examples for each.
- **Theme:** **Community Rules & Documents.** Note: this document is **superseded/absorbed** by
  the Charter draft (#2 above), which explicitly states it merges this document with the
  Community Agreement (#5). Treat as a historical/backing source, not the primary one — the
  Charter draft is more current and complete.

### 5. `AI Qadam Soglashenie v1 (2).docx`
- **Language(s):** Russian only.
- **Summary:** "Соглашение сообщества и управления AI Qadam" v1.0 ("Community & Governance
  Agreement") — a fuller predecessor to the Charter draft, covering the same ground as #2
  (principles, roles, consent decision-making, inter-chapter governance, finance, brand/IP,
  ethics, escalation, termination, legal transition) plus **five appendices** (RACI matrix,
  principle examples, consent-in-practice examples, veto-in-practice examples, and the core
  team roster) — notably more worked examples than the Charter draft currently contains.
- **Theme:** **Community Rules & Documents.** Same relationship to the Charter draft as #4:
  this is an earlier version that the Charter (#2) explicitly supersedes/merges, but it is
  **more detailed in places** (e.g. Appendix В/Г worked examples of consent and veto) than the
  Charter draft's placeholder appendices. Worth pulling the extra worked examples from this
  file even though the Charter is otherwise primary.

### 6. `AI-Qadam-factsheet-NEW.docx` (+ `.html` + `.pdf`, same content)
- **Language(s):** **Bilingual — full Russian AND full English**, back-to-back in the same
  document (RU section first, then a complete EN section mirroring it).
- **Summary:** A sponsorship/speaker-CFP one-pager for "AI Qadam Community of AI Practitioners"
  (Tashkent, June 2026). States core metrics (300 sign-ups / 2 meetups, 100+ in room, +78 peak
  NPS, 80+ companies, 25 returning, 28% advanced practitioners), a metric-by-metric comparison
  table for Meetup #1 vs #2, a list of what a partner/sponsor can cover, "already on board"
  partners (all UZ), and "what's next" (Meetup #3, first hackathon, KZ chapter, Uzbek-language
  events, audience topic demand). Contact info included.
- **Theme:** **Events & History** (the metrics/momentum/what's-next content) with a secondary
  slice for **About Us** (one-line "who we are" descriptor) and arguably a **Partnerships**
  angle (see §4 "fourth theme" discussion below) for the sponsorship ask itself.
- **Extraction note:** used the `.docx`; it is clean and already bilingual, so this is the best
  version to pull from directly (the `.html`/`.pdf` are redundant, not reviewed line-by-line
  since content is identical per the task brief).

### 7. `AI_Qadam_Kazakhstan_MoU-2105 (3).docx` (+ same-name PDF)
- **Language(s):** Russian only ("составлен в двух экземплярах на русском языке" — explicitly
  Russian-only per its own closing clause).
- **Summary:** A detailed Memorandum of Understanding between AI Qadam Global and AI Qadam
  Kazakhstan establishing the KZ chapter. Covers definitions, chapter status/autonomy, the
  two-tier Global Board / Country Board governance system (very similar to, and evidently the
  template for, the Charter's and Положение's governance sections), financial model (local
  funds stay local; global-partner funds split one-share-per-country), brand/IP licensing,
  quality-control metrics, "red lines" and termination procedure, dispute resolution, and the
  transition to a binding legal agreement within 6 months. Signed by Binali Rustamov (Founder
  Global) and Aigerim Kambetbayeva (Founder/Country Lead Kazakhstan).
- **Extraction note:** the companion PDF has the same Cyrillic-stripping defect as the BFT PDF —
  use the `.docx`, not the PDF.
- **Theme:** **Community Rules & Documents** (governance/legal), with a possible small
  **Events & History** contribution (it dates the community's founding to November 2025 and
  the first public event to 25 April 2026 in Tashkent — useful timeline anchors). Largely a
  legal/reference document rather than page prose — see "fourth theme" note below.

### 8. `Приложение№1_2026.doc`
- **Language(s):** Russian.
- **Extraction note:** Legacy OLE binary `.doc` (not a zip). `unzip` fails as expected.
  `pdftotext` has no counterpart PDF to fall back to. Recovered readable text via a UTF‑16LE
  decode pass over the raw bytes (the plain-text run inside the OLE stream), filtered to
  printable characters — this worked cleanly for the actual document text (unlike a raw
  `strings`-style dump, this produced coherent, complete sentences, not garbled fragments), so
  confidence in the recovered content is **high**, not "low confidence."
- **Summary:** **This file is unrelated to AI Qadam.** It is "Приложение №1 к Договору SS0011
  от 17 августа 2026 г." ("Annex 1 to Contract SS0011") — a technical work order between
  ТОО "Advanced Business Technologies" (ABiTech) as Заказчик (customer) and ТОО
  "InterKvadroSoft" as Исполнитель (contractor), specifying HTTP-service integration work
  between a 1C accounting system and something called "АСКОУ" (inventory/asset sync). Signed by
  directors Р.Д. Рахматуллаев and О.В. Мартышко. No AI Qadam branding, no community content,
  no relation to the other 12 files' subject matter.
- **Theme:** **None — out of scope entirely.** This appears to be a misplaced file (likely
  swept into this folder by accident from an unrelated ABiTech client engagement — note ABiTech
  is also the employer of a named AI Qadam community member, Volodymyr Tytenko, per the
  Partnership Deck team slide, which may explain how it ended up adjacent). **Recommend
  excluding from the portal content workflow entirely** and flagging to the human PO to confirm
  it doesn't belong in this batch.

### 9. `AI_Qadam_Deck_RU_CentralAsia_Regulator (May 2026).pptx` (+ pre-rendered PDF)
- **Language(s):** Russian only.
- **Summary:** A 17-slide deck aimed at regulators/state funds. Slides 1–15 are a Russian
  translation/adaptation of the Partnership Deck's narrative (why-now, first-event proof
  points, audience composition, four streams, chapter model, roadmap, "what we believe"), with
  two **regulator-specific slides not in the Partnership Deck**: Slide 16 "В русле
  госповестки всей Центральной Азии" (maps each country's AI national strategy/regulation —
  Uzbekistan's Decree УП-189, Kazakhstan's AI Law, Kyrgyzstan's National AI Council,
  Tajikistan's AI strategy to 2040) and Slide 17 "Регуляторы и госфонды" (explains the
  regulator/state-fund partnership value proposition: anonymized industry insight, talent
  pipeline for national programs, neutral dialogue venue, joint research — with an explicit
  independence disclaimer that government partners don't govern the community).
- **Extraction note:** `pdftotext` on the pre-rendered PDF **fails** (same Cyrillic-stripping
  defect as other PDFs in this set) — extraction was done from the `.pptx` XML instead
  (slide-by-slide `<a:t>` runs), which is clean and complete.
- **Theme:** **About Us** (mission/what-we-are slides, principles) + **Events & History**
  (Meetup #1 proof points, roadmap/momentum slides) + a **regulator/partnerships** angle that
  doesn't fit the three themes (see §4 below).

### 10. `AI_Qadam_Partnership_Deck (May 2026)_upd.pptx` (+ pre-rendered PDF)
- **Language(s):** **English only** (this is the international/English partnership deck,
  distinct from the Russian regulator deck above, not a translation pair of it).
- **Summary:** 15-slide general partnership/investor deck. Covers: why-now, first-event proof
  points (158 sign-ups, +78 NPS, 100+ in room), speaker lineup from Meetup #1, audience skill
  breakdown, "four streams one core" (Events/People/Education/Accelerator with what a partner
  gets from each), the chapter model (UZ active, KZ launching, TJ roadmap, "beyond" vision),
  near-term roadmap (Meetup #2, KZ chapter launch, Suhbat), three tiers of partnership
  contribution (one-off/monthly/annual) with partner benefits, a "where we draw the line"
  partner-boundaries slide, current partners (UZ venue/infra), leadership team bios, and a
  closing "what we believe" (the seven principles, English phrasing) values slide.
- **Extraction note:** this PDF extracted cleanly via `pdftotext` (no Cyrillic content, so the
  font defect didn't manifest) — used directly, no XML fallback needed.
- **Theme:** **About Us** (mission, values, leadership team bios, chapter model) +
  **Events & History** (Meetup #1 metrics, speaker lineup, roadmap) + partnerships content
  outside the three themes (see §4).

### 11. `AI-Qadam-sponsorship-deck-en.pdf`
- **Language(s):** English.
- **Summary:** 19-slide (18 form-feeds) sponsorship + call-for-speakers prospectus. Broader
  than the factsheet: momentum trajectory (Meetup #1→#2→now→#3→hackathon), "where we are /
  where we're going," what partners unlock (production, infra, talent, reputation), detailed
  "ways to help" itemized list, current partners (UZ venue/infra/pizza+merch/livestream —
  4 partners, one more than the factsheet's list), regional footprint (UZ active, KZ first
  chapter, TJ roadmap, "beyond"), audience topic-demand survey, **a "speakers so far" slide
  covering BOTH Meetup #1 and Meetup #2** (named speakers and talk titles for each), a
  "why speak with us" slide, contacts, and a closing community-photo slide.
- **Theme:** **Events & History** (this is by far the richest events/history source of any
  file — full Meetup #1 and #2 speaker rosters, metrics trajectory, and roadmap) with a
  secondary **About Us** contribution (the closing "it's about people" quote, mission framing).

### 12. `AI-Qadam-sponsorship-deck-ru.pdf`
- **Language(s):** Russian.
- **Summary:** **This is NOT an identical translation of the English deck** — it is a
  **21-slide** deck (20 form-feeds) vs. the English deck's 19 slides, i.e. **2 extra slides**.
  Content otherwise closely mirrors the EN deck (same metrics, same structure, same speaker
  slides for Meetup #1/#2, same partners, same roadmap). The clearly-identifiable extra content
  is a **"BUILD" product slide** (an open-source/agent-tooling roadmap section — mentions
  "Qadam Flow," Activepieces, MIT/Apache-2.0 licensing, SSO/RBAC, `github.com/aiqadam` — this
  reads like early platform/product content, possibly a preview of the BFT's Build module)
  that has **no counterpart in the English deck**.
- **Extraction note:** `pdftotext` on this PDF suffers **heavy Cyrillic character loss**, same
  systemic font-embedding defect as the other RU-language PDFs in this batch — large parts of
  the extracted RU text are unreadable placeholder characters. **No clean alternative source
  exists for this file** (no docx/pptx counterpart was provided, unlike the other decks) — flag
  this as a file that likely needs to be **re-exported from its original source** (e.g. Canva/
  Figma/Google Slides export to PDF with embedded/subset fonts fixed, or re-export as .pptx)
  before a human or agent can reliably read its full Russian text. The English deck (#11) and
  the readable slide titles/section markers recovered here are suf ficient to infer this is
  structurally the RU counterpart of the EN sponsorship deck, plus the extra Build slide(s), but
  exact RU wording could not be fully confirmed from this pass.
- **Theme:** **Events & History** primary, **About Us** secondary, and the unique "BUILD" slide
  content doesn't fit any of the three themes (see §4).

---

## 2. A note on a possible 4th theme

Several files (BFT, MoU, Global Board Положение / Charter's Layer B inter-chapter sections, the
regulator deck's slides 16–17, the "BUILD" slide in the RU sponsorship deck, and the entire
sponsorship/partnership decks' "ways to give/what partners get" content) are **not** "About
Us" / "Community Rules" / "Events & History" content in the sense of public-facing narrative —
they are:
- **Legal/governance reference documents** (MoU, Положение, BFT) — arguably belong in Community
  Rules & Documents as downloadable/linked PDFs rather than as page prose to rewrite, since they
  are formal instruments with signatures, not editorial copy.
- **Partnership/sponsorship/investor material** (both decks, both sponsorship PDFs, regulator
  deck slides 16–17) — this reads as a distinct "Partner With Us" or "Support Us" content
  category that doesn't map cleanly onto any of the three requested pages. Recommend the PO
  decide whether this becomes a 4th page/section, stays as downloadable collateral linked from
  About Us, or is deliberately out of scope for this portal-content pass.

---

## 3. Proposed page outlines

### Page A — About Us

| Heading (proposed) | Pull from |
|---|---|
| Who we are / mission statement | Manifesto (RU); Partnership Deck slide 1 "Vision & invitation to partner" + slide 2 "Why now" (EN); Regulator Deck slides 1–2 (RU); Factsheet one-line descriptor (RU+EN) |
| Our seven principles | Manifesto (RU, canonical numbered list with explanations); Partnership Deck slide 14 "What we believe" (EN, short-form); Regulator Deck slide 14 (RU, short-form); Global Board Положение §10 and Soglashenie §2/Appendix Б (RU, with "good/bad" worked examples — richest version of this content) |
| How we're organized (council of equals, consent, country leads) | Manifesto "Как мы живём" section (RU); Charter §3–§4 for the fuller governance detail (RU) — consider linking rather than duplicating, see §2 above |
| Chapter model / where we operate | Partnership Deck slide 8 "The chapter model" (EN); Regulator Deck slide 8 (RU) — UZ active/home base, KZ first chapter (June 2026), TJ roadmap, "beyond" vision |
| Leadership team | Partnership Deck slide 13 "Leadership Team" (EN, has full bios: Binali Rustamov, Aigerim Kambetbayeva, Ekaterina Vashurina, Viktor Drukker, Volodymyr Tytenko); Regulator Deck slide 13 (RU, team slide present but text not fully recovered — bios likely need re-extraction or reuse of EN bios if roles are language-agnostic); MoU/Charter appendices (core team roster, roles only, no bios) |
| Closing quote / tagline | Partnership Deck slide 14 "In the end, AI Qadam isn't really about AI. It's about people." (EN); Regulator Deck slide 14 equivalent (RU); Sponsorship deck EN closing slide (same quote) |

**Translation parity notes for About Us:**
- The seven principles exist in full, matching form in **both languages** (Manifesto RU;
  Partnership Deck EN short-form; Regulator Deck RU short-form) — good parity, though the
  *long-form explanations* (with good/bad examples) only exist in RU (Global Board Положение,
  Soglashenie Appendix Б) — no EN equivalent of the worked examples currently exists.
- The chapter-model slide exists in matching RU/EN pairs (Partnership Deck EN / Regulator Deck
  RU) — good parity.
- Leadership bios: full text confirmed only in **English** (Partnership Deck slide 13). The
  Russian regulator deck's equivalent slide 13 extracted mostly as slide furniture ("AI QADAM",
  page number) — the bio text itself did not come through clearly in this pass and should be
  re-checked directly in the source deck before assuming it's missing.
- Mission/"why now" framing exists in full RU/EN pairs (Regulator Deck / Partnership Deck) —
  good parity.

### Page B — Community Rules & Documents

| Heading (proposed) | Pull from |
|---|---|
| Our principles (link back to About Us or restate) | Manifesto; Charter §2 |
| Roles & responsibilities | Charter §3 (Founder/Хранитель, Country Lead, direction coordinator, operating core, facilitator, volunteers/members) — most current single source |
| How decisions are made (consent, vetoes) | Charter §4; Soglashenie Appendix В/Г for worked "good/bad" examples (richest source — Charter's own appendices are currently placeholders) |
| Inter-chapter governance (Global Board / Country Board) | Charter §5; Global Board Положение (full document, earlier/narrower version of the same content); Kazakhstan MoU Article 4-bis (most detailed worked version, KZ-specific but structurally general) |
| Brand, IP & non-commercial policy | Charter §6; MoU Article 16 |
| Code of ethics & conflict escalation | Charter §7 |
| Termination / offboarding procedures | Charter §8; Global Board Положение §11 (Board-specific entry/exit) |
| Legal status & transition plan | Charter §9; MoU Articles 13–15 |
| Downloadable source documents (as PDFs/links, not rewritten prose) | Charter v0.1; Soglashenie v1.0; Global Board Положение v1.0; Kazakhstan MoU v2.0 — recommend linking these as the actual legal record rather than paraphrasing, given they carry signatures/dates and are living drafts |

**Translation parity notes for Community Rules & Documents:**
- **All governance documents (Manifesto, Charter, Положение, Soglashenie, MoU) exist in
  Russian only.** There is currently **no English version of any governance/rules document** —
  the Charter draft explicitly flags this as future work ("двуязычная публичная редакция
  участникоориентированной части — следующим шагом"). This is the single largest translation
  gap found in this batch and should be flagged prominently to the PO, since this page is
  explicitly required in both languages per the brief.

**Duplicate/conflicting content flagged:**
- **Founder title inconsistency:** Charter and MoU call the founder role "Хранитель" (Steward/
  Guardian); Soglashenie and Global Board Положение call the same role "Основатель" (Founder).
  Same person (Binali Rustamov), same powers, different label — needs a PO decision on which
  term is canonical before writing page copy.
- **Governance document redundancy:** Charter v0.1 explicitly supersedes/merges Global Board
  Положение v1.0 and Soglashenie v1.0, but all three still exist as separate files with
  overlapping (occasionally verbatim-identical, e.g. the seven principles text) content. The
  Charter is the most current, but Soglashenie's appendices (consent-in-practice, veto-in-
  practice worked examples) are more complete than the Charter's own (currently placeholder)
  appendices — pull those specific sections from Soglashenie even though Charter is otherwise
  primary.
- **RACI matrix appears identical across Charter Appendix А and Soglashenie Appendix А** — no
  conflict, just true duplication; use either, prefer Charter for the surrounding date currency.
- **Country lead roster gaps:** all versions show "Country Lead — Uzbekistan: —" (role open) and
  several direction-coordinator seats marked "—" (open) as of these drafts' dates — if the page
  is meant to reflect current org structure, this needs a freshness check with the PO before
  publishing, since org rosters are the kind of content that goes stale fastest.

### Page C — Events & History

| Heading (proposed) | Pull from |
|---|---|
| Our story / founding timeline | MoU preamble (community founded November 2025; first public event 25 April 2026, Tashkent) — the only source with an explicit founding date |
| Meetup #1 recap (25 Apr 2026, Tashkent) | Factsheet (RU+EN, metrics table); Sponsorship Deck EN (fuller "speakers so far" slide — Anton Ustinov, Shokhzod Rakhmatov, Veronika Nasledova, Alex(ey) Kulagin, with talk titles); Partnership Deck EN slide 4 (same 4 speakers, EN); Regulator Deck RU slide 4 (same 4 speakers, RU) |
| Meetup #2 recap (20 Jun 2026, Tashkent) | Factsheet metrics table (RU+EN, #1 vs #2 comparison: sign-ups, show-rate, TG-group, returning, partner reach); Sponsorship Deck EN "speakers so far" (Pavel Popov, Alex Juraev, Konstantin Gus, with talk titles) — **note: Meetup #2 speaker names/talks exist only in the EN sponsorship deck among the files reviewed** |
| Community growth trajectory / momentum | Sponsorship Deck EN "trajectory" slide (Meetup #1 → #2 → now → #3 → hackathon); Factsheet dynamics table |
| What's next / roadmap | Factsheet "Планы / What's next" (RU+EN: Meetup #3 in September, first hackathon Q4, KZ chapter Almaty, Uzbek-language events); Partnership Deck EN slide 9 "Where we're going"; Regulator Deck RU slide 9 |
| Chapter expansion milestones | Partnership/Regulator Deck slide 8 (UZ active, KZ chapter June 2026, TJ roadmap); Kazakhstan MoU (formal chapter-founding document, dated 2026, KZ) |
| Audience/what people want (optional "by the numbers" sidebar) | Factsheet "кто в зале / who's in the room"; Sponsorship Deck EN audience skill/topic-demand slides; Partnership Deck EN slide 5–6 |

**Translation parity notes for Events & History:**
- Meetup #1 metrics and speaker info: **good RU/EN parity** — present in Factsheet (bilingual),
  Partnership Deck (EN), Regulator Deck (RU), and Sponsorship Deck EN.
- **Meetup #2 detailed speaker lineup (names + talk titles) exists only in the English
  sponsorship deck** (`AI-Qadam-sponsorship-deck-en.pdf`) among the reviewed files — the Russian
  sponsorship deck should contain the same section but its text could not be fully recovered
  due to the PDF font-encoding defect (see file #12 above); this needs source re-extraction to
  confirm RU wording, or a translator will need to translate the EN version fresh.
  Factsheet's Meetup #2 coverage is metrics-only (no speaker names/talks).
  Regulator/Partnership decks predate Meetup #2 and don't cover it.
- Roadmap/what's-next content: good RU/EN parity (Factsheet bilingual; Partnership Deck EN;
  Regulator Deck RU).
- Founding date/timeline: **only in the MoU**, which is Russian-only — no English source states
  the November 2025 founding date or explicitly frames the origin story in English. Needs
  translation.

**Duplicate/conflicting information flagged:**
- **Meetup #1 sign-up numbers are consistent across all sources** (158 sign-ups, +78 NPS,
  100+ in room, 80+ companies) — no conflict, good cross-source confirmation.
- **Meetup #2 date is consistent** (20 June 2026) across Factsheet and Sponsorship Deck EN.
- **Minor figure variance:** the Factsheet's dynamics table shows Meetup #1→#2 show-rate as
  63%→70% and partner reach as 25%→33%; the Sponsorship Deck EN trajectory slide shows the
  same underlying numbers (142 sign-ups, 102 in TG group for #2) but doesn't restate show-rate/
  partner-reach percentages, so nothing contradicts — just uneven level of detail per source,
  not a conflict.
- **"80+ companies" attribution:** Factsheet and both decks state 80+ companies attended, but
  it's stated as a Meetup #1 stat in some places and as a general/combined stat in others (e.g.
  Sponsorship Deck EN's headline "300 sign-ups · 2 meetups ... 80+ companies" groups it with the
  2-meetup aggregate rather than tying it to #1 specifically) — worth double-checking with the
  PO/data owner which meetup(s) the 80+ figure actually covers before publishing it as a precise
  claim.

---

## 4. Summary table

| # | File | Language(s) | Theme(s) |
|---|---|---|---|
| 1 | AI Qadam Manifesto.docx | RU (title only bilingual) | About Us |
| 2 | AI Qadam Charter v0 1.docx | RU only | Community Rules & Documents |
| 3 | AI Qadam BFT v0_1 (2).docx | RU only | **Out of scope** (product requirements doc) |
| 4 | AI Qadam Global Board Положение (2).docx | RU only | Community Rules & Documents (superseded by #2, still useful) |
| 5 | AI Qadam Soglashenie v1 (2).docx | RU only | Community Rules & Documents (superseded by #2, has richer appendices) |
| 6 | AI-Qadam-factsheet-NEW.docx | RU + EN (full bilingual) | Events & History (primary), About Us (secondary) |
| 7 | AI_Qadam_Kazakhstan_MoU-2105 (3).docx | RU only | Community Rules & Documents (primary), Events & History (founding date) |
| 8 | Приложение№1_2026.doc | RU | **Out of scope — unrelated document**, not AI Qadam content |
| 9 | AI_Qadam_Deck_RU_CentralAsia_Regulator (May 2026).pptx | RU only | About Us + Events & History + regulator/partnership content (4th-theme candidate) |
| 10 | AI_Qadam_Partnership_Deck (May 2026)_upd.pptx | EN only | About Us + Events & History + partnership content (4th-theme candidate) |
| 11 | AI-Qadam-sponsorship-deck-en.pdf | EN | Events & History (primary, richest source), About Us (secondary) |
| 12 | AI-Qadam-sponsorship-deck-ru.pdf | RU (partially unreadable — needs re-export) | Events & History (primary), About Us (secondary), plus a unique "BUILD" product slide not in the EN deck |

---

## 5. Flags for the human product owner

1. **File #8 (`Приложение№1_2026.doc`) is not AI Qadam content at all** — an unrelated ABiTech/
   InterKvadroSoft contract annex. Recommend removing it from this batch/workflow.
2. **File #12 (`AI-Qadam-sponsorship-deck-ru.pdf`) needs re-export** — its Cyrillic text does
   not extract cleanly from the current PDF (font-embedding issue), and no docx/pptx source
   was provided for it as a fallback, unlike every other RU document in this set.
3. **No English version of any governance/rules document exists** (Manifesto, Charter,
   Положение, Soglashenie, MoU are all Russian-only) — this is a hard blocker for shipping a
   bilingual Community Rules & Documents page as scoped; translation work is required before
   that page can go live in English.
4. **Founder title is inconsistent across documents** ("Хранитель" vs "Основатель") — needs a
   PO ruling before page copy is finalized.
5. **Consider a 4th "Partner With Us" theme/page** — a meaningful fraction of the source
   material (both decks' partnership-tier slides, both sponsorship PDFs, the regulator deck's
   government-partnership slides, the BFT's partner-facing module descriptions) is sponsorship/
   partnership collateral that doesn't naturally fit About Us, Community Rules, or Events &
   History.
6. **Org-roster content (current Country Leads, direction coordinators) has several open/blank
   seats in every source document reviewed** — confirm current staffing with the PO before
   publishing an org chart or leadership list, since these drafts may already be stale.
7. **Meetup #2 speaker lineup is confirmed only in English** — needs either a source-file
   re-check (the RU sponsorship deck) or fresh translation.
