#!/usr/bin/env bash
# Idempotently bootstrap the AI Qadam Directus schema. Re-runnable —
# every call checks if the collection / item already exists before
# creating. Safe to invoke against a fresh Directus or to extend
# an existing one.
#
# Usage:
#   DIRECTUS_URL=https://cms.aiqadam.org \
#   DIRECTUS_TOKEN=$(cat /tmp/aiqadam-secrets-DIRECTUS_TOKEN) \
#   bash infrastructure/directus/bootstrap.sh
#
# Collections created:
#   actor_kinds      — field on directus_users (Sprint 5.5/1)
#   sponsors         — sponsor org records (Sprint 5.5/1)
#   speakers         — speaker records (Sprint 5.5/1)
#   eulas            — EULA datasets, versioned, immutable (Sprint 5.5/2)
#   consent_records  — per-user per-intent consent log (Sprint 5.5/2)
#   eula_acceptances — audit trail of EULA acceptances (Sprint 5.5/2)
#   events.eula_id   — nullable FK; per-event EULA override (Sprint 5.5/2)
#   event_types.default_eula_id — nullable FK; per-type default (Sprint 5.5/2)
#   interactions          — every outbound message (Sprint 5.5/3)
#   interaction_deliveries — per recipient × channel (Sprint 5.5/3)
#   interaction_responses — structured replies (CSAT, RSVP, ...) (Sprint 5.5/3)
#   countries        — tenant catalogue (uz, kz, tj)
#   event_types      — meetup / workshop / hackathon / conference / online
#   events           — first-class events
#   registrations    — user registrations on events
#   point_awards     — gamification ledger
#   partners         — homepage partners per country
#   homepage_hero    — singleton per country
#
# After this lands, run infrastructure/directus/migrate-from-platform.sh
# to copy data from the existing platform.events / .registrations /
# .point_awards tables into Directus.

set -euo pipefail

: "${DIRECTUS_URL:?DIRECTUS_URL is required}"
: "${DIRECTUS_TOKEN:?DIRECTUS_TOKEN is required}"

H_AUTH="Authorization: Bearer ${DIRECTUS_TOKEN}"
H_JSON="content-type: application/json"

# ──────────── helpers ───────────────────────────────────────────────────

# Skip if HTTP 200 GET succeeds (already exists), else POST the body.
ensure() {
  local kind="$1"      # human label
  local check_url="$2" # GET to test existence
  local create_url="$3"
  local body="$4"
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" -H "${H_AUTH}" "${check_url}")
  if [ "${code}" = "200" ]; then
    echo "  ✓ ${kind} (exists)"
    return 0
  fi
  code=$(curl -s -o /tmp/directus-resp -w "%{http_code}" \
    -H "${H_AUTH}" -H "${H_JSON}" -X POST "${create_url}" --data "${body}")
  if [ "${code}" = "200" ] || [ "${code}" = "204" ]; then
    echo "  + ${kind} (created)"
  else
    echo "  ✗ ${kind} HTTP ${code}"
    head -c 200 /tmp/directus-resp
    echo
    return 1
  fi
}

# ──────────── countries ─────────────────────────────────────────────────

echo "[countries]"
ensure "collection countries" \
  "${DIRECTUS_URL}/collections/countries" \
  "${DIRECTUS_URL}/collections" \
  '{
    "collection":"countries",
    "schema":{"name":"countries"},
    "meta":{
      "icon":"public",
      "note":"Tenant catalogue. Code = lowercase ISO 3166-1 alpha-2.",
      "sort_field":"code",
      "archive_field":"is_active",
      "archive_value":"false",
      "unarchive_value":"true"
    },
    "fields":[
      {"field":"code","type":"string","schema":{"is_primary_key":true,"is_nullable":false,"max_length":2},"meta":{"interface":"input","width":"half","required":true}},
      {"field":"name","type":"string","schema":{"is_nullable":false,"max_length":100},"meta":{"interface":"input","width":"half","required":true}},
      {"field":"name_ru","type":"string","schema":{"is_nullable":true,"max_length":100},"meta":{"interface":"input","width":"half"}},
      {"field":"tz","type":"string","schema":{"is_nullable":false,"max_length":50,"default_value":"UTC"},"meta":{"interface":"input","width":"half","note":"IANA timezone, e.g. Asia/Tashkent"}},
      {"field":"is_active","type":"boolean","schema":{"default_value":true,"is_nullable":false},"meta":{"interface":"boolean","width":"half"}}
    ]
  }'

seed_country() {
  local code="$1" name="$2" name_ru="$3" tz="$4"
  ensure "country ${code}" \
    "${DIRECTUS_URL}/items/countries/${code}" \
    "${DIRECTUS_URL}/items/countries" \
    "$(jq -nc --arg c "$code" --arg n "$name" --arg r "$name_ru" --arg t "$tz" \
       '{code:$c,name:$n,name_ru:$r,tz:$t,is_active:true}')"
}
seed_country uz "Uzbekistan" "Узбекистан" "Asia/Tashkent"
seed_country kz "Kazakhstan" "Казахстан"   "Asia/Almaty"
seed_country tj "Tajikistan" "Таджикистан" "Asia/Dushanbe"

# ════════════════════════════════════════════════════════════════════════
# F-S4.5 — Country profile fields (locale, currency, holidays, channel pref)
# ════════════════════════════════════════════════════════════════════════
#
# Per-country defaults that shape operator UX + downstream services.
# Lives on the same row as the existing countries collection (1:1 with
# tenant; a separate profile table would be over-modelling). Defaults
# are sensible enough that provisioning a new country (Sprint 4.1/4.2)
# can write blanks and let the country lead tune in-cabinet later.
#
# Editing surface: /workspace/admin/countries (super_admin only).
# Read surface: any signed-in operator (these are not secrets).

echo "[F-S4.5 — countries.default_locale]"
ensure "field countries.default_locale" \
  "${DIRECTUS_URL}/fields/countries/default_locale" \
  "${DIRECTUS_URL}/fields/countries" \
  '{
    "field":"default_locale",
    "type":"string",
    "schema":{"is_nullable":false,"default_value":"en","max_length":12},
    "meta":{
      "interface":"select-dropdown",
      "width":"half",
      "options":{"choices":[
        {"text":"English","value":"en"},
        {"text":"Russian","value":"ru"},
        {"text":"Kazakh","value":"kk"},
        {"text":"Uzbek (Latin)","value":"uz-Latn"},
        {"text":"Uzbek (Cyrillic)","value":"uz-Cyrl"},
        {"text":"Tajik","value":"tg"}
      ]},
      "note":"Default page locale on this country subdomain when the visitor has no aiqadam-locale cookie. Per-user choice still wins."
    }
  }'

echo "[F-S4.5 — countries.currency_code]"
ensure "field countries.currency_code" \
  "${DIRECTUS_URL}/fields/countries/currency_code" \
  "${DIRECTUS_URL}/fields/countries" \
  '{
    "field":"currency_code",
    "type":"string",
    "schema":{"is_nullable":false,"default_value":"USD","max_length":3},
    "meta":{
      "interface":"select-dropdown",
      "width":"half",
      "options":{"choices":[
        {"text":"USD — US Dollar","value":"USD"},
        {"text":"UZS — Uzbek Som","value":"UZS"},
        {"text":"KZT — Kazakhstani Tenge","value":"KZT"},
        {"text":"KGS — Kyrgyzstani Som","value":"KGS"},
        {"text":"TJS — Tajikistani Somoni","value":"TJS"},
        {"text":"EUR — Euro","value":"EUR"}
      ]},
      "note":"Default currency for sponsor invoices + budget displays in this country cabinet. ISO 4217."
    }
  }'

echo "[F-S4.5 — countries.public_holidays]"
ensure "field countries.public_holidays" \
  "${DIRECTUS_URL}/fields/countries/public_holidays" \
  "${DIRECTUS_URL}/fields/countries" \
  '{
    "field":"public_holidays",
    "type":"json",
    "schema":{"is_nullable":true},
    "meta":{
      "interface":"list",
      "special":["cast-json"],
      "width":"full",
      "options":{"template":"{{date}} — {{label}}","fields":[
        {"field":"date","type":"string","meta":{"interface":"datetime","options":{"includeTime":false}}},
        {"field":"label","type":"string","meta":{"interface":"input"}}
      ]},
      "note":"YYYY-MM-DD entries — event scheduling UI warns when a draft event lands on one. Country lead maintains."
    }
  }'

echo "[F-S4.5 — countries.default_reminder_channel]"
ensure "field countries.default_reminder_channel" \
  "${DIRECTUS_URL}/fields/countries/default_reminder_channel" \
  "${DIRECTUS_URL}/fields/countries" \
  '{
    "field":"default_reminder_channel",
    "type":"string",
    "schema":{"is_nullable":false,"default_value":"email","max_length":20},
    "meta":{
      "interface":"select-dropdown",
      "width":"half",
      "options":{"choices":[
        {"text":"Email first","value":"email"},
        {"text":"Telegram first (fallback email)","value":"telegram"}
      ]},
      "note":"Channel preference for service-level reminders in this country. Per-user opt-out still wins. Telegram routing lands with F-S5.5."
    }
  }'

# Backfill the existing three countries with country-appropriate defaults.
# PATCH is idempotent; re-running bootstrap is safe.
set_country_profile() {
  local code="$1" locale="$2" currency="$3" channel="$4" holidays="$5"
  curl -fsS -X PATCH \
    -H "Authorization: Bearer ${DIRECTUS_TOKEN}" \
    -H "Content-Type: application/json" \
    "${DIRECTUS_URL}/items/countries/${code}" \
    -d "$(jq -nc --arg l "$locale" --arg c "$currency" --arg ch "$channel" --argjson h "$holidays" \
      '{default_locale:$l,currency_code:$c,default_reminder_channel:$ch,public_holidays:$h}')" \
    > /dev/null && echo "[F-S4.5] backfilled ${code}"
}

# Public holidays are a subset (major civic + cultural); country lead
# maintains the canonical list via /workspace/admin/countries.
set_country_profile uz "uz-Latn" "UZS" "telegram" \
  '[{"date":"2026-01-01","label":"New Year"},{"date":"2026-03-21","label":"Navruz"},{"date":"2026-09-01","label":"Independence Day"},{"date":"2026-12-08","label":"Constitution Day"}]'
set_country_profile kz "ru" "KZT" "telegram" \
  '[{"date":"2026-01-01","label":"New Year"},{"date":"2026-03-22","label":"Nauryz"},{"date":"2026-05-09","label":"Victory Day"},{"date":"2026-12-16","label":"Independence Day"}]'
set_country_profile tj "tg" "TJS" "telegram" \
  '[{"date":"2026-01-01","label":"New Year"},{"date":"2026-03-21","label":"Navruz"},{"date":"2026-09-09","label":"Independence Day"},{"date":"2026-11-06","label":"Constitution Day"}]'

# ──────────── event_types ───────────────────────────────────────────────

echo "[event_types]"
ensure "collection event_types" \
  "${DIRECTUS_URL}/collections/event_types" \
  "${DIRECTUS_URL}/collections" \
  '{
    "collection":"event_types",
    "schema":{"name":"event_types"},
    "meta":{"icon":"category","note":"Event format taxonomy. Add freely.","sort_field":"sort"},
    "fields":[
      {"field":"key","type":"string","schema":{"is_primary_key":true,"is_nullable":false,"max_length":50},"meta":{"interface":"input","width":"half","required":true,"note":"machine name, lowercase, no spaces"}},
      {"field":"label","type":"string","schema":{"is_nullable":false,"max_length":100},"meta":{"interface":"input","width":"half","required":true}},
      {"field":"color","type":"string","schema":{"is_nullable":true,"max_length":20},"meta":{"interface":"select-color","width":"half"}},
      {"field":"sort","type":"integer","schema":{"is_nullable":false,"default_value":0},"meta":{"interface":"input","width":"half"}}
    ]
  }'

seed_type() {
  local key="$1" label="$2" color="$3" sort="$4"
  ensure "type ${key}" \
    "${DIRECTUS_URL}/items/event_types/${key}" \
    "${DIRECTUS_URL}/items/event_types" \
    "$(jq -nc --arg k "$key" --arg l "$label" --arg c "$color" --argjson s "$sort" \
       '{key:$k,label:$l,color:$c,sort:$s}')"
}
seed_type meetup     "Meetup"      "#2dd4bf" 10
seed_type workshop   "Workshop"    "#8b5cf6" 20
seed_type hackathon  "Hackathon"   "#f59e0b" 30
seed_type conference "Conference"  "#ec4899" 40
seed_type online     "Online"      "#3b82f6" 50

# ──────────── events ────────────────────────────────────────────────────

echo "[events]"
ensure "collection events" \
  "${DIRECTUS_URL}/collections/events" \
  "${DIRECTUS_URL}/collections" \
  '{
    "collection":"events",
    "schema":{"name":"events"},
    "meta":{
      "icon":"event",
      "note":"Single events. Status lifecycle: draft -> published -> cancelled.",
      "archive_field":"status",
      "archive_value":"cancelled",
      "unarchive_value":"draft",
      "sort_field":"starts_at"
    },
    "fields":[
      {"field":"id","type":"uuid","schema":{"is_primary_key":true,"has_auto_increment":false,"is_nullable":false,"default_value":"gen_random_uuid()"},"meta":{"interface":"input","readonly":true,"hidden":true,"special":["uuid"]}},
      {"field":"title","type":"string","schema":{"is_nullable":false,"max_length":200},"meta":{"interface":"input","width":"full","required":true}},
      {"field":"description","type":"text","schema":{"is_nullable":false},"meta":{"interface":"input-multiline","width":"full","required":true}},
      {"field":"status","type":"string","schema":{"is_nullable":false,"default_value":"draft","max_length":20},"meta":{"interface":"select-dropdown","width":"half","required":true,"options":{"choices":[{"text":"Draft","value":"draft"},{"text":"Published","value":"published"},{"text":"Cancelled","value":"cancelled"}]}}},
      {"field":"format","type":"string","schema":{"is_nullable":false,"max_length":50},"meta":{"interface":"select-dropdown-m2o","width":"half","required":true,"options":{"template":"{{label}}"},"display":"related-values","display_options":{"template":"{{label}}"}}},
      {"field":"starts_at","type":"timestamp","schema":{"is_nullable":false},"meta":{"interface":"datetime","width":"half","required":true}},
      {"field":"ends_at","type":"timestamp","schema":{"is_nullable":false},"meta":{"interface":"datetime","width":"half","required":true}},
      {"field":"capacity","type":"integer","schema":{"is_nullable":true},"meta":{"interface":"input","width":"half","note":"empty = unlimited"}},
      {"field":"location","type":"string","schema":{"is_nullable":true,"max_length":255},"meta":{"interface":"input","width":"half","note":"empty = online or TBA"}},
      {"field":"country","type":"string","schema":{"is_nullable":false,"max_length":2},"meta":{"interface":"select-dropdown-m2o","width":"half","required":true,"display":"related-values","display_options":{"template":"{{name}}"}}},
      {"field":"date_created","type":"timestamp","schema":{"default_value":"now()"},"meta":{"interface":"datetime","readonly":true,"hidden":true,"width":"half","special":["date-created"]}},
      {"field":"date_updated","type":"timestamp","schema":{"is_nullable":true},"meta":{"interface":"datetime","readonly":true,"hidden":true,"width":"half","special":["date-updated"]}}
    ]
  }'

# M2O relations on events
ensure "relation events.format -> event_types.key" \
  "${DIRECTUS_URL}/relations/events/format" \
  "${DIRECTUS_URL}/relations" \
  '{"collection":"events","field":"format","related_collection":"event_types","schema":{"on_delete":"RESTRICT"}}'

ensure "relation events.country -> countries.code" \
  "${DIRECTUS_URL}/relations/events/country" \
  "${DIRECTUS_URL}/relations" \
  '{"collection":"events","field":"country","related_collection":"countries","schema":{"on_delete":"RESTRICT"}}'

# ──────────── registrations ─────────────────────────────────────────────

echo "[registrations]"
ensure "collection registrations" \
  "${DIRECTUS_URL}/collections/registrations" \
  "${DIRECTUS_URL}/collections" \
  '{
    "collection":"registrations",
    "schema":{"name":"registrations"},
    "meta":{
      "icon":"how_to_reg",
      "note":"Membership ledger. Status: registered | waitlisted | cancelled | attended.",
      "sort_field":"date_created"
    },
    "fields":[
      {"field":"id","type":"uuid","schema":{"is_primary_key":true,"is_nullable":false,"default_value":"gen_random_uuid()"},"meta":{"interface":"input","readonly":true,"hidden":true,"special":["uuid"]}},
      {"field":"event","type":"uuid","schema":{"is_nullable":false},"meta":{"interface":"select-dropdown-m2o","width":"half","required":true,"display":"related-values","display_options":{"template":"{{title}}"}}},
      {"field":"user","type":"uuid","schema":{"is_nullable":false},"meta":{"interface":"select-dropdown-m2o","width":"half","required":true,"display":"related-values","display_options":{"template":"{{email}}"}}},
      {"field":"status","type":"string","schema":{"is_nullable":false,"default_value":"registered","max_length":20},"meta":{"interface":"select-dropdown","width":"half","required":true,"options":{"choices":[{"text":"Registered","value":"registered"},{"text":"Waitlisted","value":"waitlisted"},{"text":"Cancelled","value":"cancelled"},{"text":"Attended","value":"attended"}]}}},
      {"field":"checkin_code","type":"uuid","schema":{"is_nullable":false,"default_value":"gen_random_uuid()"},"meta":{"interface":"input","width":"half","readonly":true,"special":["uuid"]}},
      {"field":"checked_in_at","type":"timestamp","schema":{"is_nullable":true},"meta":{"interface":"datetime","width":"half","readonly":true}},
      {"field":"cancelled_at","type":"timestamp","schema":{"is_nullable":true},"meta":{"interface":"datetime","width":"half","readonly":true}},
      {"field":"date_created","type":"timestamp","schema":{"default_value":"now()"},"meta":{"interface":"datetime","readonly":true,"hidden":true,"special":["date-created"]}},
      {"field":"date_updated","type":"timestamp","schema":{"is_nullable":true},"meta":{"interface":"datetime","readonly":true,"hidden":true,"special":["date-updated"]}}
    ]
  }'

ensure "relation registrations.event -> events.id" \
  "${DIRECTUS_URL}/relations/registrations/event" \
  "${DIRECTUS_URL}/relations" \
  '{"collection":"registrations","field":"event","related_collection":"events","schema":{"on_delete":"CASCADE"}}'

ensure "relation registrations.user -> directus_users.id" \
  "${DIRECTUS_URL}/relations/registrations/user" \
  "${DIRECTUS_URL}/relations" \
  '{"collection":"registrations","field":"user","related_collection":"directus_users","schema":{"on_delete":"CASCADE"}}'

# ──────────── point_awards ──────────────────────────────────────────────

echo "[point_awards]"
ensure "collection point_awards" \
  "${DIRECTUS_URL}/collections/point_awards" \
  "${DIRECTUS_URL}/collections" \
  '{
    "collection":"point_awards",
    "schema":{"name":"point_awards"},
    "meta":{"icon":"emoji_events","note":"Event-sourced points ledger.","sort_field":"date_created"},
    "fields":[
      {"field":"id","type":"uuid","schema":{"is_primary_key":true,"default_value":"gen_random_uuid()","is_nullable":false},"meta":{"interface":"input","readonly":true,"hidden":true,"special":["uuid"]}},
      {"field":"user","type":"uuid","schema":{"is_nullable":false},"meta":{"interface":"select-dropdown-m2o","width":"half","required":true,"display":"related-values","display_options":{"template":"{{email}}"}}},
      {"field":"country","type":"string","schema":{"is_nullable":false,"max_length":2},"meta":{"interface":"select-dropdown-m2o","width":"half","required":true,"display":"related-values","display_options":{"template":"{{name}}"}}},
      {"field":"source","type":"string","schema":{"is_nullable":false,"default_value":"event_attended","max_length":50},"meta":{"interface":"select-dropdown","width":"half","required":true,"options":{"choices":[{"text":"Event attended","value":"event_attended"}]}}},
      {"field":"source_ref","type":"uuid","schema":{"is_nullable":false},"meta":{"interface":"input","width":"half"}},
      {"field":"points","type":"integer","schema":{"is_nullable":false,"default_value":10},"meta":{"interface":"input","width":"half","required":true}},
      {"field":"date_created","type":"timestamp","schema":{"default_value":"now()"},"meta":{"interface":"datetime","readonly":true,"hidden":true,"special":["date-created"]}}
    ]
  }'

ensure "relation point_awards.user -> directus_users.id" \
  "${DIRECTUS_URL}/relations/point_awards/user" \
  "${DIRECTUS_URL}/relations" \
  '{"collection":"point_awards","field":"user","related_collection":"directus_users","schema":{"on_delete":"CASCADE"}}'

ensure "relation point_awards.country -> countries.code" \
  "${DIRECTUS_URL}/relations/point_awards/country" \
  "${DIRECTUS_URL}/relations" \
  '{"collection":"point_awards","field":"country","related_collection":"countries","schema":{"on_delete":"RESTRICT"}}'

# ──────────── partners ──────────────────────────────────────────────────

echo "[partners]"
ensure "collection partners" \
  "${DIRECTUS_URL}/collections/partners" \
  "${DIRECTUS_URL}/collections" \
  '{
    "collection":"partners",
    "schema":{"name":"partners"},
    "meta":{"icon":"handshake","note":"Homepage partner logos per country.","sort_field":"sort"},
    "fields":[
      {"field":"id","type":"uuid","schema":{"is_primary_key":true,"default_value":"gen_random_uuid()","is_nullable":false},"meta":{"interface":"input","readonly":true,"hidden":true,"special":["uuid"]}},
      {"field":"name","type":"string","schema":{"is_nullable":false,"max_length":100},"meta":{"interface":"input","width":"full","required":true}},
      {"field":"country","type":"string","schema":{"is_nullable":false,"max_length":2},"meta":{"interface":"select-dropdown-m2o","width":"half","required":true,"display":"related-values","display_options":{"template":"{{name}}"}}},
      {"field":"logo","type":"uuid","schema":{"is_nullable":true},"meta":{"interface":"file-image","width":"full","note":"optional — text fallback shown if missing"}},
      {"field":"url","type":"string","schema":{"is_nullable":true,"max_length":255},"meta":{"interface":"input","width":"full"}},
      {"field":"sort","type":"integer","schema":{"is_nullable":false,"default_value":100},"meta":{"interface":"input","width":"half"}}
    ]
  }'

ensure "relation partners.country -> countries.code" \
  "${DIRECTUS_URL}/relations/partners/country" \
  "${DIRECTUS_URL}/relations" \
  '{"collection":"partners","field":"country","related_collection":"countries","schema":{"on_delete":"RESTRICT"}}'

ensure "relation partners.logo -> directus_files.id" \
  "${DIRECTUS_URL}/relations/partners/logo" \
  "${DIRECTUS_URL}/relations" \
  '{"collection":"partners","field":"logo","related_collection":"directus_files","schema":{"on_delete":"SET NULL"}}'

# ──────────── homepage_hero (one row per country) ───────────────────────

echo "[homepage_hero]"
ensure "collection homepage_hero" \
  "${DIRECTUS_URL}/collections/homepage_hero" \
  "${DIRECTUS_URL}/collections" \
  '{
    "collection":"homepage_hero",
    "schema":{"name":"homepage_hero"},
    "meta":{
      "icon":"campaign",
      "note":"Hero block on country homepage. One row per country (enforce via app, Directus doesn'\''t unique-constrain on m2o).",
      "sort_field":"country"
    },
    "fields":[
      {"field":"id","type":"uuid","schema":{"is_primary_key":true,"default_value":"gen_random_uuid()","is_nullable":false},"meta":{"interface":"input","readonly":true,"hidden":true,"special":["uuid"]}},
      {"field":"country","type":"string","schema":{"is_nullable":false,"max_length":2},"meta":{"interface":"select-dropdown-m2o","width":"half","required":true,"display":"related-values","display_options":{"template":"{{name}}"}}},
      {"field":"eyebrow","type":"string","schema":{"is_nullable":true,"max_length":100},"meta":{"interface":"input","width":"full"}},
      {"field":"title","type":"string","schema":{"is_nullable":true,"max_length":200},"meta":{"interface":"input","width":"full","note":"empty = fall back to next upcoming event title"}},
      {"field":"subtitle","type":"text","schema":{"is_nullable":true},"meta":{"interface":"input-multiline","width":"full"}},
      {"field":"cta_label","type":"string","schema":{"is_nullable":true,"max_length":50},"meta":{"interface":"input","width":"half"}},
      {"field":"cta_url","type":"string","schema":{"is_nullable":true,"max_length":255},"meta":{"interface":"input","width":"half"}}
    ]
  }'

ensure "relation homepage_hero.country -> countries.code" \
  "${DIRECTUS_URL}/relations/homepage_hero/country" \
  "${DIRECTUS_URL}/relations" \
  '{"collection":"homepage_hero","field":"country","related_collection":"countries","schema":{"on_delete":"CASCADE"}}'

# ──────────── actor_kinds on directus_users (Sprint 5.5/1) ──────────────
#
# Per the interaction architecture, every directus_users row carries an
# `actor_kinds` array describing which actor categories the user wears
# (client | operator | speaker | sponsor_rep). A single human can have
# multiple kinds. Authorization decisions in the API + cabinets read
# this field per-context (sponsor cabinet checks sponsor_rep + linked
# sponsors.rep_user, etc.).
#
# Idempotency: GET the field; if it exists, skip; otherwise POST.

echo "[directus_users.actor_kinds]"
ensure "field directus_users.actor_kinds" \
  "${DIRECTUS_URL}/fields/directus_users/actor_kinds" \
  "${DIRECTUS_URL}/fields/directus_users" \
  '{
    "field":"actor_kinds",
    "type":"json",
    "schema":{
      "is_nullable":false,
      "default_value":"[\"client\"]"
    },
    "meta":{
      "interface":"select-multiple-checkbox",
      "special":["cast-json"],
      "options":{
        "choices":[
          {"text":"Client","value":"client"},
          {"text":"Operator","value":"operator"},
          {"text":"Speaker","value":"speaker"},
          {"text":"Sponsor rep","value":"sponsor_rep"}
        ]
      },
      "width":"full",
      "note":"Which actor categories this user occupies. A single human can wear multiple hats."
    }
  }'

# ──────────── sponsors (Sprint 5.5/1) ───────────────────────────────────
#
# Sponsor organizations. Single user per sponsor (Q4 — multi-rep was
# deemed overkill at community scale). Eventually replaces the
# placeholder `partners` collection used by the homepage; partners stays
# for now as a homepage-display alias (W1.2 will fold them together).

echo "[sponsors]"
ensure "collection sponsors" \
  "${DIRECTUS_URL}/collections/sponsors" \
  "${DIRECTUS_URL}/collections" \
  '{
    "collection":"sponsors",
    "schema":{"name":"sponsors"},
    "meta":{
      "icon":"verified",
      "note":"Sponsor organizations. Single cabinet user per sponsor (Q4).",
      "sort_field":"sort",
      "archive_field":"status",
      "archive_value":"archived",
      "unarchive_value":"active"
    },
    "fields":[
      {"field":"id","type":"uuid","schema":{"is_primary_key":true,"default_value":"gen_random_uuid()","is_nullable":false},"meta":{"interface":"input","readonly":true,"hidden":true,"special":["uuid"]}},
      {"field":"name","type":"string","schema":{"is_nullable":false,"max_length":160},"meta":{"interface":"input","width":"half","required":true}},
      {"field":"slug","type":"string","schema":{"is_nullable":false,"max_length":80,"is_unique":true},"meta":{"interface":"input","width":"half","required":true,"note":"URL slug — lowercase + dashes"}},
      {"field":"country","type":"string","schema":{"is_nullable":false,"max_length":2},"meta":{"interface":"select-dropdown-m2o","width":"half","required":true,"display":"related-values","display_options":{"template":"{{name}}"}}},
      {"field":"status","type":"string","schema":{"is_nullable":false,"default_value":"active","max_length":20},"meta":{"interface":"select-dropdown","width":"half","options":{"choices":[{"text":"Active","value":"active"},{"text":"Pending","value":"pending"},{"text":"Archived","value":"archived"}]}}},
      {"field":"tier","type":"string","schema":{"is_nullable":true,"max_length":20},"meta":{"interface":"select-dropdown","width":"half","options":{"choices":[{"text":"Bronze","value":"bronze"},{"text":"Silver","value":"silver"},{"text":"Gold","value":"gold"},{"text":"Platinum","value":"platinum"}]},"note":"Phase 5d sponsorship tier — unused until then"}},
      {"field":"rep_user","type":"uuid","schema":{"is_nullable":true},"meta":{"interface":"select-dropdown-m2o","width":"half","display":"related-values","display_options":{"template":"{{email}}"},"note":"Cabinet login user — gates sponsor cabinet access"}},
      {"field":"logo","type":"uuid","schema":{"is_nullable":true},"meta":{"interface":"file-image","width":"full"}},
      {"field":"website","type":"string","schema":{"is_nullable":true,"max_length":255},"meta":{"interface":"input","width":"full"}},
      {"field":"description","type":"text","schema":{"is_nullable":true},"meta":{"interface":"input-multiline","width":"full"}},
      {"field":"sort","type":"integer","schema":{"is_nullable":false,"default_value":100},"meta":{"interface":"input","width":"half"}}
    ]
  }'

ensure "relation sponsors.country -> countries.code" \
  "${DIRECTUS_URL}/relations/sponsors/country" \
  "${DIRECTUS_URL}/relations" \
  '{"collection":"sponsors","field":"country","related_collection":"countries","schema":{"on_delete":"RESTRICT"}}'

ensure "relation sponsors.rep_user -> directus_users.id" \
  "${DIRECTUS_URL}/relations/sponsors/rep_user" \
  "${DIRECTUS_URL}/relations" \
  '{"collection":"sponsors","field":"rep_user","related_collection":"directus_users","schema":{"on_delete":"SET NULL"}}'

ensure "relation sponsors.logo -> directus_files.id" \
  "${DIRECTUS_URL}/relations/sponsors/logo" \
  "${DIRECTUS_URL}/relations" \
  '{"collection":"sponsors","field":"logo","related_collection":"directus_files","schema":{"on_delete":"SET NULL"}}'

# ──────────── speakers (Sprint 5.5/1) ───────────────────────────────────
#
# Speakers are people who present at events. user FK is REQUIRED — a
# speaker is always a directus_users row (which carries email + name +
# linked accounts). Speakers may also be clients (commonly).

echo "[speakers]"
ensure "collection speakers" \
  "${DIRECTUS_URL}/collections/speakers" \
  "${DIRECTUS_URL}/collections" \
  '{
    "collection":"speakers",
    "schema":{"name":"speakers"},
    "meta":{
      "icon":"campaign",
      "note":"People who present at events. Linked 1:1 to a directus_users row.",
      "archive_field":"status",
      "archive_value":"archived",
      "unarchive_value":"active"
    },
    "fields":[
      {"field":"id","type":"uuid","schema":{"is_primary_key":true,"default_value":"gen_random_uuid()","is_nullable":false},"meta":{"interface":"input","readonly":true,"hidden":true,"special":["uuid"]}},
      {"field":"user","type":"uuid","schema":{"is_nullable":false,"is_unique":true},"meta":{"interface":"select-dropdown-m2o","width":"half","required":true,"display":"related-values","display_options":{"template":"{{email}}"},"note":"The speaker'\''s directus_users row"}},
      {"field":"country","type":"string","schema":{"is_nullable":false,"max_length":2},"meta":{"interface":"select-dropdown-m2o","width":"half","required":true,"display":"related-values","display_options":{"template":"{{name}}"}}},
      {"field":"status","type":"string","schema":{"is_nullable":false,"default_value":"active","max_length":20},"meta":{"interface":"select-dropdown","width":"half","options":{"choices":[{"text":"Active","value":"active"},{"text":"Pending","value":"pending"},{"text":"Archived","value":"archived"}]}}},
      {"field":"bio","type":"text","schema":{"is_nullable":true},"meta":{"interface":"input-rich-text-md","width":"full","note":"Markdown"}},
      {"field":"headline","type":"string","schema":{"is_nullable":true,"max_length":160},"meta":{"interface":"input","width":"full","note":"One-line e.g. \"Principal ML Engineer at Uzum Lab\""}},
      {"field":"linkedin_url","type":"string","schema":{"is_nullable":true,"max_length":255},"meta":{"interface":"input","width":"half"}},
      {"field":"twitter_handle","type":"string","schema":{"is_nullable":true,"max_length":40},"meta":{"interface":"input","width":"half"}},
      {"field":"photo","type":"uuid","schema":{"is_nullable":true},"meta":{"interface":"file-image","width":"full"}}
    ]
  }'

ensure "relation speakers.user -> directus_users.id" \
  "${DIRECTUS_URL}/relations/speakers/user" \
  "${DIRECTUS_URL}/relations" \
  '{"collection":"speakers","field":"user","related_collection":"directus_users","schema":{"on_delete":"RESTRICT"}}'

ensure "relation speakers.country -> countries.code" \
  "${DIRECTUS_URL}/relations/speakers/country" \
  "${DIRECTUS_URL}/relations" \
  '{"collection":"speakers","field":"country","related_collection":"countries","schema":{"on_delete":"RESTRICT"}}'

ensure "relation speakers.photo -> directus_files.id" \
  "${DIRECTUS_URL}/relations/speakers/photo" \
  "${DIRECTUS_URL}/relations" \
  '{"collection":"speakers","field":"photo","related_collection":"directus_files","schema":{"on_delete":"SET NULL"}}'

# ──────────── eulas (Sprint 5.5/2) ──────────────────────────────────────
#
# Per Q1: capability only — multiple independent EULA datasets supported;
# texts come from legal later. No baseline EULA seeded by this script.
#
# Rows are immutable once published: to change a EULA, insert a new
# (slug, version) row. Old rows remain bound to all eula_acceptances
# that reference them so the audit trail is stable.

echo "[eulas]"
ensure "collection eulas" \
  "${DIRECTUS_URL}/collections/eulas" \
  "${DIRECTUS_URL}/collections" \
  '{
    "collection":"eulas",
    "schema":{"name":"eulas"},
    "meta":{
      "icon":"gavel",
      "note":"Immutable EULA texts. Multiple datasets via slug; new version = new row.",
      "sort_field":"valid_from",
      "archive_field":"status",
      "archive_value":"archived",
      "unarchive_value":"published"
    },
    "fields":[
      {"field":"id","type":"uuid","schema":{"is_primary_key":true,"default_value":"gen_random_uuid()","is_nullable":false},"meta":{"interface":"input","readonly":true,"hidden":true,"special":["uuid"]}},
      {"field":"slug","type":"string","schema":{"is_nullable":false,"max_length":80},"meta":{"interface":"input","width":"half","required":true,"note":"Dataset identifier — e.g. platform-baseline, hackathon-waiver, paid-event-tos"}},
      {"field":"version","type":"string","schema":{"is_nullable":false,"max_length":20},"meta":{"interface":"input","width":"half","required":true,"note":"Semver. New text = new version row."}},
      {"field":"locale","type":"string","schema":{"is_nullable":false,"default_value":"en","max_length":10},"meta":{"interface":"input","width":"half","note":"BCP-47, e.g. en | ru | uz-Latn | kk"}},
      {"field":"status","type":"string","schema":{"is_nullable":false,"default_value":"draft","max_length":20},"meta":{"interface":"select-dropdown","width":"half","options":{"choices":[{"text":"Draft","value":"draft"},{"text":"Published","value":"published"},{"text":"Archived","value":"archived"}]}}},
      {"field":"title","type":"string","schema":{"is_nullable":false,"max_length":200},"meta":{"interface":"input","width":"full","required":true}},
      {"field":"body_markdown","type":"text","schema":{"is_nullable":false},"meta":{"interface":"input-rich-text-md","width":"full","required":true,"note":"Once published, do NOT edit — insert a new version row instead"}},
      {"field":"applies_to_event_types","type":"json","schema":{"is_nullable":true,"default_value":"[]"},"meta":{"interface":"tags","special":["cast-json"],"width":"full","note":"Array of event_type keys; empty = applies generally"}},
      {"field":"required_consents","type":"json","schema":{"is_nullable":true,"default_value":"[]"},"meta":{"interface":"tags","special":["cast-json"],"width":"full","note":"Consent kinds the user implicitly grants by accepting: data_processing, sponsor_marketing, photo_release, code_of_conduct, minor_participation, ..."}},
      {"field":"valid_from","type":"timestamp","schema":{"is_nullable":false,"default_value":"now()"},"meta":{"interface":"datetime","width":"half","required":true}},
      {"field":"valid_until","type":"timestamp","schema":{"is_nullable":true},"meta":{"interface":"datetime","width":"half","note":"Null = no end"}}
    ]
  }'

# ──────────── consent_records (Sprint 5.5/2) ────────────────────────────
#
# Append-only-ish: each toggle creates a new row. Reading current state
# = SELECT most recent (granted_at DESC) per (user, initiator_actor_class,
# intent_class, scope) and check revoked_at. The /me/preferences UI in
# 5.5/6 writes these.

echo "[consent_records]"
ensure "collection consent_records" \
  "${DIRECTUS_URL}/collections/consent_records" \
  "${DIRECTUS_URL}/collections" \
  '{
    "collection":"consent_records",
    "schema":{"name":"consent_records"},
    "meta":{
      "icon":"check_circle",
      "note":"Per-user per-(actor-class × intent) consent log. Most recent row wins.",
      "sort_field":"granted_at"
    },
    "fields":[
      {"field":"id","type":"uuid","schema":{"is_primary_key":true,"default_value":"gen_random_uuid()","is_nullable":false},"meta":{"interface":"input","readonly":true,"hidden":true,"special":["uuid"]}},
      {"field":"user","type":"uuid","schema":{"is_nullable":false},"meta":{"interface":"select-dropdown-m2o","width":"half","required":true,"display":"related-values","display_options":{"template":"{{email}}"}}},
      {"field":"initiator_actor_class","type":"string","schema":{"is_nullable":false,"max_length":40},"meta":{"interface":"select-dropdown","width":"half","options":{"choices":[{"text":"Operator","value":"operator"},{"text":"Sponsor","value":"sponsor"},{"text":"Speaker","value":"speaker"},{"text":"System","value":"system"},{"text":"Client (peer)","value":"client"}]}}},
      {"field":"intent_class","type":"string","schema":{"is_nullable":false,"max_length":80},"meta":{"interface":"input","width":"half","note":"e.g. newsletter, sponsor_offer, speaker_promo, csat, event_announce"}},
      {"field":"scope","type":"json","schema":{"is_nullable":true},"meta":{"interface":"input-code","options":{"language":"json"},"special":["cast-json"],"width":"full","note":"e.g. {\"sponsor_id\":\"...\"} or {\"event_type\":\"hackathon\"}; null = all"}},
      {"field":"granted_at","type":"timestamp","schema":{"is_nullable":false,"default_value":"now()"},"meta":{"interface":"datetime","width":"half"}},
      {"field":"revoked_at","type":"timestamp","schema":{"is_nullable":true},"meta":{"interface":"datetime","width":"half","note":"Null = currently consented"}},
      {"field":"source","type":"string","schema":{"is_nullable":false,"default_value":"preferences_page","max_length":40},"meta":{"interface":"select-dropdown","width":"half","options":{"choices":[{"text":"Registration","value":"registration"},{"text":"Preferences page","value":"preferences_page"},{"text":"Bot command","value":"bot_command"},{"text":"Operator set","value":"operator_set"}]}}},
      {"field":"source_ref","type":"json","schema":{"is_nullable":true},"meta":{"interface":"input-code","options":{"language":"json"},"special":["cast-json"],"width":"half","note":"e.g. {\"registration_id\":\"...\"}"}}
    ]
  }'

ensure "relation consent_records.user -> directus_users.id" \
  "${DIRECTUS_URL}/relations/consent_records/user" \
  "${DIRECTUS_URL}/relations" \
  '{"collection":"consent_records","field":"user","related_collection":"directus_users","schema":{"on_delete":"CASCADE"}}'

# ──────────── eula_acceptances (Sprint 5.5/2) ───────────────────────────
#
# Legal audit trail. One row per (user × eula version × event_optional).
# IP + user agent recorded for non-repudiation.

echo "[eula_acceptances]"
ensure "collection eula_acceptances" \
  "${DIRECTUS_URL}/collections/eula_acceptances" \
  "${DIRECTUS_URL}/collections" \
  '{
    "collection":"eula_acceptances",
    "schema":{"name":"eula_acceptances"},
    "meta":{
      "icon":"fact_check",
      "note":"Audit trail: who agreed to what EULA when from where.",
      "sort_field":"accepted_at"
    },
    "fields":[
      {"field":"id","type":"uuid","schema":{"is_primary_key":true,"default_value":"gen_random_uuid()","is_nullable":false},"meta":{"interface":"input","readonly":true,"hidden":true,"special":["uuid"]}},
      {"field":"user","type":"uuid","schema":{"is_nullable":false},"meta":{"interface":"select-dropdown-m2o","width":"half","required":true,"display":"related-values","display_options":{"template":"{{email}}"}}},
      {"field":"eula","type":"uuid","schema":{"is_nullable":false},"meta":{"interface":"select-dropdown-m2o","width":"half","required":true,"display":"related-values","display_options":{"template":"{{slug}} v{{version}} ({{locale}})"}}},
      {"field":"source_event","type":"uuid","schema":{"is_nullable":true},"meta":{"interface":"select-dropdown-m2o","width":"half","display":"related-values","display_options":{"template":"{{title}}"},"note":"Optional — the event registration that triggered acceptance"}},
      {"field":"accepted_at","type":"timestamp","schema":{"is_nullable":false,"default_value":"now()"},"meta":{"interface":"datetime","width":"half"}},
      {"field":"ip_address","type":"string","schema":{"is_nullable":true,"max_length":45},"meta":{"interface":"input","width":"half","note":"IPv4 or IPv6"}},
      {"field":"user_agent","type":"string","schema":{"is_nullable":true,"max_length":500},"meta":{"interface":"input","width":"full"}}
    ]
  }'

ensure "relation eula_acceptances.user -> directus_users.id" \
  "${DIRECTUS_URL}/relations/eula_acceptances/user" \
  "${DIRECTUS_URL}/relations" \
  '{"collection":"eula_acceptances","field":"user","related_collection":"directus_users","schema":{"on_delete":"CASCADE"}}'

ensure "relation eula_acceptances.eula -> eulas.id" \
  "${DIRECTUS_URL}/relations/eula_acceptances/eula" \
  "${DIRECTUS_URL}/relations" \
  '{"collection":"eula_acceptances","field":"eula","related_collection":"eulas","schema":{"on_delete":"RESTRICT"}}'

ensure "relation eula_acceptances.source_event -> events.id" \
  "${DIRECTUS_URL}/relations/eula_acceptances/source_event" \
  "${DIRECTUS_URL}/relations" \
  '{"collection":"eula_acceptances","field":"source_event","related_collection":"events","schema":{"on_delete":"SET NULL"}}'

# ──────────── events.eula_id + event_types.default_eula_id ──────────────
#
# Two FK columns wire events to EULAs via the resolution chain documented
# in §5 of the architecture: events.eula_id (override) → event_types
# .default_eula_id (default) → null (no EULA prompt, registration flow is
# a no-op per Q1).

echo "[events.eula_id]"
ensure "field events.eula_id" \
  "${DIRECTUS_URL}/fields/events/eula_id" \
  "${DIRECTUS_URL}/fields/events" \
  '{
    "field":"eula_id",
    "type":"uuid",
    "schema":{"is_nullable":true},
    "meta":{
      "interface":"select-dropdown-m2o",
      "width":"half",
      "display":"related-values",
      "display_options":{"template":"{{slug}} v{{version}}"},
      "note":"Optional per-event EULA override. Falls back to event_type.default_eula_id, then to null (no prompt)."
    }
  }'

ensure "relation events.eula_id -> eulas.id" \
  "${DIRECTUS_URL}/relations/events/eula_id" \
  "${DIRECTUS_URL}/relations" \
  '{"collection":"events","field":"eula_id","related_collection":"eulas","schema":{"on_delete":"SET NULL"}}'

echo "[event_types.default_eula_id]"
ensure "field event_types.default_eula_id" \
  "${DIRECTUS_URL}/fields/event_types/default_eula_id" \
  "${DIRECTUS_URL}/fields/event_types" \
  '{
    "field":"default_eula_id",
    "type":"uuid",
    "schema":{"is_nullable":true},
    "meta":{
      "interface":"select-dropdown-m2o",
      "width":"full",
      "display":"related-values",
      "display_options":{"template":"{{slug}} v{{version}}"},
      "note":"Default EULA for events of this type. Individual events may override via events.eula_id."
    }
  }'

ensure "relation event_types.default_eula_id -> eulas.id" \
  "${DIRECTUS_URL}/relations/event_types/default_eula_id" \
  "${DIRECTUS_URL}/relations" \
  '{"collection":"event_types","field":"default_eula_id","related_collection":"eulas","schema":{"on_delete":"SET NULL"}}'

# ──────────── interactions (Sprint 5.5/3) ───────────────────────────────
#
# The architectural unit. Every outbound message in the platform — email,
# Telegram DM, in-app banner, CRM activity log — is rooted in a row here.
# Per §4 of docs/interaction-architecture.md.
#
# Inserts come from the InteractionsService (Sprint 5.5/4); operators
# should not insert manually. Lookups + audit views can read freely.
#
# Polymorphic note: initiator_id has no FK constraint because it can
# reference different tables based on initiator_actor (operator/client
# → directus_users; sponsor → sponsors; speaker → speakers; team →
# teams (not yet); system → null). The dispatcher enforces shape.

echo "[interactions]"
ensure "collection interactions" \
  "${DIRECTUS_URL}/collections/interactions" \
  "${DIRECTUS_URL}/collections" \
  '{
    "collection":"interactions",
    "schema":{"name":"interactions"},
    "meta":{
      "icon":"forum",
      "note":"Every outbound message. One interaction → N deliveries → 0..N responses.",
      "sort_field":"created_at",
      "archive_field":"policy_state",
      "archive_value":"cancelled",
      "unarchive_value":"draft"
    },
    "fields":[
      {"field":"id","type":"uuid","schema":{"is_primary_key":true,"default_value":"gen_random_uuid()","is_nullable":false},"meta":{"interface":"input","readonly":true,"hidden":true,"special":["uuid"]}},
      {"field":"initiator_actor","type":"string","schema":{"is_nullable":false,"max_length":20},"meta":{"interface":"select-dropdown","width":"half","required":true,"options":{"choices":[{"text":"Operator","value":"operator"},{"text":"Sponsor","value":"sponsor"},{"text":"Speaker","value":"speaker"},{"text":"Client","value":"client"},{"text":"Team","value":"team"},{"text":"System","value":"system"}]}}},
      {"field":"initiator_id","type":"uuid","schema":{"is_nullable":true},"meta":{"interface":"input","width":"half","note":"Polymorphic — refers to the table implied by initiator_actor; system has none."}},
      {"field":"audience","type":"json","schema":{"is_nullable":false,"default_value":"{}"},"meta":{"interface":"input-code","options":{"language":"json"},"special":["cast-json"],"width":"full","required":true,"note":"One of: {\"user_ids\":[...]} | {\"team_ids\":[...]} | {\"filter\":{...}}"}},
      {"field":"intent","type":"string","schema":{"is_nullable":false,"max_length":60},"meta":{"interface":"input","width":"half","required":true,"note":"e.g. registered, promoted, cancelled, reminder, event_announce, csat, enps, newsletter, sponsor_offer, speaker_promo, team_invite, eula_update, password_reset"}},
      {"field":"payload","type":"json","schema":{"is_nullable":false,"default_value":"{}"},"meta":{"interface":"input-code","options":{"language":"json"},"special":["cast-json"],"width":"full","note":"Versioned per intent — see InteractionsService for the schema map"}},
      {"field":"consent_basis","type":"string","schema":{"is_nullable":false,"max_length":30},"meta":{"interface":"select-dropdown","width":"half","required":true,"options":{"choices":[{"text":"Operational contract","value":"operational_contract"},{"text":"Event EULA","value":"event_eula"},{"text":"Explicit opt-in","value":"explicit_opt_in"},{"text":"Client-initiated","value":"client_initiated"},{"text":"B2B contract","value":"b2b_contract"}]}}},
      {"field":"consent_scope","type":"json","schema":{"is_nullable":true},"meta":{"interface":"input-code","options":{"language":"json"},"special":["cast-json"],"width":"half","note":"e.g. {\"event_id\":\"...\"} when consent_basis=event_eula"}},
      {"field":"allowed_channels","type":"json","schema":{"is_nullable":false,"default_value":"[]"},"meta":{"interface":"tags","special":["cast-json"],"width":"full","note":"Channel allow-list: email, telegram, in_app, push, crm, sms, web_modal"}},
      {"field":"fallback_chain","type":"json","schema":{"is_nullable":false,"default_value":"[]"},"meta":{"interface":"tags","special":["cast-json"],"width":"full","note":"Ordered fallback channels after the primary fails"}},
      {"field":"policy_state","type":"string","schema":{"is_nullable":false,"default_value":"draft","max_length":30},"meta":{"interface":"select-dropdown","width":"half","options":{"choices":[{"text":"Draft","value":"draft"},{"text":"Pending approval","value":"pending_approval"},{"text":"Approved","value":"approved"},{"text":"Scheduled","value":"scheduled"},{"text":"Sending","value":"sending"},{"text":"Sent","value":"sent"},{"text":"Suppressed by policy","value":"suppressed_by_policy"},{"text":"Cancelled","value":"cancelled"}]}}},
      {"field":"scheduled_for","type":"timestamp","schema":{"is_nullable":true},"meta":{"interface":"datetime","width":"half","note":"Null = send now"}},
      {"field":"expires_at","type":"timestamp","schema":{"is_nullable":true},"meta":{"interface":"datetime","width":"half","note":"Skip delivery if past this; e.g. event-reminder after event end"}},
      {"field":"experiment_assignment","type":"json","schema":{"is_nullable":true},"meta":{"interface":"input-code","options":{"language":"json"},"special":["cast-json"],"width":"full","note":"{\"experiment\":\"<key>\",\"variant\":\"<a|b|...>\"} when an experiment routes this interaction"}},
      {"field":"created_at","type":"timestamp","schema":{"is_nullable":false,"default_value":"now()"},"meta":{"interface":"datetime","width":"half","readonly":true}},
      {"field":"created_by","type":"uuid","schema":{"is_nullable":true},"meta":{"interface":"select-dropdown-m2o","width":"half","display":"related-values","display_options":{"template":"{{email}}"},"note":"Operator user when composed via admin; null when system-generated"}}
    ]
  }'

ensure "relation interactions.created_by -> directus_users.id" \
  "${DIRECTUS_URL}/relations/interactions/created_by" \
  "${DIRECTUS_URL}/relations" \
  '{"collection":"interactions","field":"created_by","related_collection":"directus_users","schema":{"on_delete":"SET NULL"}}'

# ──────────── interaction_deliveries (Sprint 5.5/3) ─────────────────────
#
# One row per (interaction × recipient × channel). The dispatcher writes
# the initial row at queue time and updates state through the lifecycle:
#   queued → sent → delivered → opened → clicked → responded
# or queued → failed / skipped_consent / skipped_policy.
#
# Recipient is exactly one of recipient_user / recipient_team. Directus
# can't express the XOR CHECK constraint via schema JSON; the dispatcher
# enforces it. Teams collection arrives in Phase 3 — recipient_team has
# NO FK constraint until then (added when teams ships).

echo "[interaction_deliveries]"
ensure "collection interaction_deliveries" \
  "${DIRECTUS_URL}/collections/interaction_deliveries" \
  "${DIRECTUS_URL}/collections" \
  '{
    "collection":"interaction_deliveries",
    "schema":{"name":"interaction_deliveries"},
    "meta":{
      "icon":"send",
      "note":"Per-recipient × channel attempt. Exactly one of recipient_user/recipient_team is set.",
      "sort_field":"attempted_at"
    },
    "fields":[
      {"field":"id","type":"uuid","schema":{"is_primary_key":true,"default_value":"gen_random_uuid()","is_nullable":false},"meta":{"interface":"input","readonly":true,"hidden":true,"special":["uuid"]}},
      {"field":"interaction","type":"uuid","schema":{"is_nullable":false},"meta":{"interface":"select-dropdown-m2o","width":"half","required":true,"display":"related-values","display_options":{"template":"{{intent}} ({{policy_state}})"}}},
      {"field":"recipient_user","type":"uuid","schema":{"is_nullable":true},"meta":{"interface":"select-dropdown-m2o","width":"half","display":"related-values","display_options":{"template":"{{email}}"},"note":"Set XOR with recipient_team"}},
      {"field":"recipient_team","type":"uuid","schema":{"is_nullable":true},"meta":{"interface":"input","width":"half","note":"FK to teams added in Phase 3. Until then this is a free uuid; do not populate."}},
      {"field":"channel","type":"string","schema":{"is_nullable":false,"max_length":20},"meta":{"interface":"select-dropdown","width":"half","required":true,"options":{"choices":[{"text":"Email","value":"email"},{"text":"Telegram","value":"telegram"},{"text":"In-app","value":"in_app"},{"text":"Push","value":"push"},{"text":"CRM activity","value":"crm"},{"text":"SMS","value":"sms"},{"text":"Web modal","value":"web_modal"}]}}},
      {"field":"state","type":"string","schema":{"is_nullable":false,"default_value":"queued","max_length":30},"meta":{"interface":"select-dropdown","width":"half","options":{"choices":[{"text":"Queued","value":"queued"},{"text":"Sent","value":"sent"},{"text":"Delivered","value":"delivered"},{"text":"Opened","value":"opened"},{"text":"Clicked","value":"clicked"},{"text":"Responded","value":"responded"},{"text":"Failed","value":"failed"},{"text":"Skipped (consent)","value":"skipped_consent"},{"text":"Skipped (policy)","value":"skipped_policy"}]}}},
      {"field":"attempted_at","type":"timestamp","schema":{"is_nullable":false,"default_value":"now()"},"meta":{"interface":"datetime","width":"half","readonly":true}},
      {"field":"delivered_at","type":"timestamp","schema":{"is_nullable":true},"meta":{"interface":"datetime","width":"half"}},
      {"field":"opened_at","type":"timestamp","schema":{"is_nullable":true},"meta":{"interface":"datetime","width":"half"}},
      {"field":"clicked_at","type":"timestamp","schema":{"is_nullable":true},"meta":{"interface":"datetime","width":"half"}},
      {"field":"responded_at","type":"timestamp","schema":{"is_nullable":true},"meta":{"interface":"datetime","width":"half"}},
      {"field":"failure_reason","type":"text","schema":{"is_nullable":true},"meta":{"interface":"input-multiline","width":"full","note":"Free-text — for state=failed or skipped_*"}}
    ]
  }'

ensure "relation interaction_deliveries.interaction -> interactions.id" \
  "${DIRECTUS_URL}/relations/interaction_deliveries/interaction" \
  "${DIRECTUS_URL}/relations" \
  '{"collection":"interaction_deliveries","field":"interaction","related_collection":"interactions","schema":{"on_delete":"CASCADE"}}'

ensure "relation interaction_deliveries.recipient_user -> directus_users.id" \
  "${DIRECTUS_URL}/relations/interaction_deliveries/recipient_user" \
  "${DIRECTUS_URL}/relations" \
  '{"collection":"interaction_deliveries","field":"recipient_user","related_collection":"directus_users","schema":{"on_delete":"CASCADE"}}'

# ──────────── interaction_responses (Sprint 5.5/3) ──────────────────────
#
# Structured replies: CSAT scores, eNPS scores, sponsor-interest clicks,
# unsubscribes, RSVP yes/no, etc. Free-form text replies (e.g. support)
# go straight to Twenty as activity; only structured replies belong here.

echo "[interaction_responses]"
ensure "collection interaction_responses" \
  "${DIRECTUS_URL}/collections/interaction_responses" \
  "${DIRECTUS_URL}/collections" \
  '{
    "collection":"interaction_responses",
    "schema":{"name":"interaction_responses"},
    "meta":{
      "icon":"rate_review",
      "note":"Structured replies to interaction_deliveries.",
      "sort_field":"received_at"
    },
    "fields":[
      {"field":"id","type":"uuid","schema":{"is_primary_key":true,"default_value":"gen_random_uuid()","is_nullable":false},"meta":{"interface":"input","readonly":true,"hidden":true,"special":["uuid"]}},
      {"field":"delivery","type":"uuid","schema":{"is_nullable":false},"meta":{"interface":"select-dropdown-m2o","width":"half","required":true,"display":"related-values","display_options":{"template":"{{channel}} → {{state}}"}}},
      {"field":"response_intent","type":"string","schema":{"is_nullable":false,"max_length":40},"meta":{"interface":"select-dropdown","width":"half","required":true,"options":{"choices":[{"text":"CSAT score","value":"csat_score"},{"text":"eNPS score","value":"enps_score"},{"text":"Sponsor interest","value":"sponsor_interest"},{"text":"Speaker question","value":"speaker_question"},{"text":"Unsubscribe","value":"unsubscribe"},{"text":"RSVP","value":"rsvp"},{"text":"Other","value":"other"}]}}},
      {"field":"payload","type":"json","schema":{"is_nullable":false,"default_value":"{}"},"meta":{"interface":"input-code","options":{"language":"json"},"special":["cast-json"],"width":"full","note":"e.g. {\"rating\":8,\"comment\":\"...\"} | {\"answer\":\"yes\"}"}},
      {"field":"received_at","type":"timestamp","schema":{"is_nullable":false,"default_value":"now()"},"meta":{"interface":"datetime","width":"half","readonly":true}},
      {"field":"event","type":"uuid","schema":{"is_nullable":true},"meta":{"interface":"select-dropdown-m2o","width":"half","display":"related-values","display_options":{"template":"{{title}}"},"note":"F-S1.2: cohort-level FK for fast CSAT-by-event aggregation. Set on csat_score responses; null otherwise."}}
    ]
  }'

# F-S1.2 — relation on the new event field
ensure "relation interaction_responses.event -> events.id" \
  "${DIRECTUS_URL}/relations/interaction_responses/event" \
  "${DIRECTUS_URL}/relations" \
  '{"collection":"interaction_responses","field":"event","related_collection":"events","schema":{"on_delete":"CASCADE"}}'

ensure "relation interaction_responses.delivery -> interaction_deliveries.id" \
  "${DIRECTUS_URL}/relations/interaction_responses/delivery" \
  "${DIRECTUS_URL}/relations" \
  '{"collection":"interaction_responses","field":"delivery","related_collection":"interaction_deliveries","schema":{"on_delete":"CASCADE"}}'

# ════════════════════════════════════════════════════════════════════════
# S0.1 — Demo-tenant isolation (roadmap §7 Sprint 0.1)
# ════════════════════════════════════════════════════════════════════════
#
# Tier (a) of the layered-staging plan: a synthetic "demo" tenant
# cohabits production inside every engine, isolated by Directus
# permission policies.
#
# Note on the country code: `countries.code` is varchar(2) per ISO 3166-1
# alpha-2 (uz/kz/tj). The demo tenant uses code `xx` — the ISO 3166-1
# user-assigned range (X-prefix is reserved for non-country use). The
# original PR #115 used `demo` (4 chars) which overflowed the column;
# this comment exists so future readers don't repeat the mistake. The
# human-readable name field stays "Demo (staging)".
#
# Schema pieces this block adds:
#
#   (1) `xx` row in countries (display name "Demo (staging)")
#   (2) `is_test_user` boolean on directus_users (default false)
#   (3) policy "S0.1 Demo-tenant isolation" + per-collection read filters
#       that hide country=xx rows from users with is_test_user=false
#
# Out of scope (lands in other PRs):
#   - email routing (Mailtrap vs Resend) — Agent-API S0.1
#   - Plausible is_test=true tagging — Agent-Web S0.1
#   - access-table binding (policy → role) — RBAC manifest ADR (S0.6) +
#     RBAC sync service (S2.2). Until S2.2 binds the policy to roles, the
#     policy exists in Directus but is inert; bootstrap re-runs with the
#     admin token bypass policies regardless.

echo "[S0.1 — demo tenant: country=xx]"
seed_country xx "Demo (staging)" "Демо" "UTC"

echo "[S0.1 — directus_users.is_test_user]"
ensure "field directus_users.is_test_user" \
  "${DIRECTUS_URL}/fields/directus_users/is_test_user" \
  "${DIRECTUS_URL}/fields/directus_users" \
  '{
    "field":"is_test_user",
    "type":"boolean",
    "schema":{"is_nullable":false,"default_value":false},
    "meta":{
      "interface":"boolean",
      "special":["cast-boolean"],
      "width":"half",
      "note":"True iff this user is a staging/training contact. Drives: (a) email dispatcher routes via Mailtrap; (b) Plausible events tagged is_test=true; (c) only these users see country=xx (demo) rows. Flip true only for the ~20 test contacts + country-lead trainees."
    }
  }'

# Deterministic policy UUID — stable across re-runs.
POLICY_DEMO_TENANT="500e0001-0000-4000-8000-000000000001"

echo "[S0.1 — policy: demo-tenant isolation]"
ensure "policy ${POLICY_DEMO_TENANT}" \
  "${DIRECTUS_URL}/policies/${POLICY_DEMO_TENANT}" \
  "${DIRECTUS_URL}/policies" \
  "$(jq -nc --arg id "$POLICY_DEMO_TENANT" '{
    id:$id,
    name:"S0.1 Demo-tenant isolation",
    icon:"science",
    description:"Restrict reads on country-scoped collections so country=xx (demo tenant) rows are visible only to users with directus_users.is_test_user=true. Bound to roles by RBAC manifest (S0.6) + sync service (S2.2).",
    admin_access:false,
    app_access:true,
    enforce_tfa:false
  }')"

# directus_permissions rows have auto-increment integer IDs, so the
# ensure() helper (GET-by-id) doesn't fit. Identify the row by the
# (policy, collection, action) triple via the items API filter syntax.
ensure_perm() {
  local kind="$1" collection="$2" action="$3" filter="$4"
  local count
  count=$(curl -s -H "${H_AUTH}" \
    "${DIRECTUS_URL}/permissions?filter%5Bpolicy%5D%5B_eq%5D=${POLICY_DEMO_TENANT}&filter%5Bcollection%5D%5B_eq%5D=${collection}&filter%5Baction%5D%5B_eq%5D=${action}&limit=1&fields=id" \
    | jq -r '.data | length' 2>/dev/null || echo 0)
  if [ "${count}" -gt 0 ]; then
    echo "  ✓ ${kind} (exists)"
    return 0
  fi
  local body
  body=$(jq -nc --arg pol "$POLICY_DEMO_TENANT" --arg col "$collection" \
                --arg act "$action" --argjson f "$filter" \
    '{policy:$pol, collection:$col, action:$act, permissions:$f, fields:["*"]}')
  local code
  code=$(curl -s -o /tmp/directus-resp -w "%{http_code}" \
    -H "${H_AUTH}" -H "${H_JSON}" -X POST "${DIRECTUS_URL}/permissions" --data "${body}")
  if [ "${code}" = "200" ] || [ "${code}" = "204" ]; then
    echo "  + ${kind} (created)"
  else
    echo "  ✗ ${kind} HTTP ${code}"
    head -c 300 /tmp/directus-resp; echo
    return 1
  fi
}

# Filter shape: a row is visible iff
#   (a) row is not the demo tenant (country != "xx"); OR
#   (b) the requester carries is_test_user=true.
# Per-collection LHS path differs: most use `country`; countries uses its
# PK `code`; registrations traverse via `event.country`; directus_users
# substitute the `is_test_user` field for the country check.

COUNTRY_FILTER='{"_or":[{"country":{"_neq":"xx"}},{"$CURRENT_USER.is_test_user":{"_eq":true}}]}'

echo "[S0.1 — permissions: demo-tenant isolation]"
ensure_perm "perm events/read"        events        read "$COUNTRY_FILTER"
ensure_perm "perm point_awards/read"  point_awards  read "$COUNTRY_FILTER"
ensure_perm "perm partners/read"      partners      read "$COUNTRY_FILTER"
ensure_perm "perm homepage_hero/read" homepage_hero read "$COUNTRY_FILTER"
ensure_perm "perm sponsors/read"      sponsors      read "$COUNTRY_FILTER"
ensure_perm "perm speakers/read"      speakers      read "$COUNTRY_FILTER"

ensure_perm "perm countries/read" countries read \
  '{"_or":[{"code":{"_neq":"xx"}},{"$CURRENT_USER.is_test_user":{"_eq":true}}]}'

ensure_perm "perm registrations/read" registrations read \
  '{"_or":[{"event":{"country":{"_neq":"xx"}}},{"$CURRENT_USER.is_test_user":{"_eq":true}}]}'

ensure_perm "perm directus_users/read" directus_users read \
  '{"_or":[{"is_test_user":{"_eq":false}},{"$CURRENT_USER.is_test_user":{"_eq":true}}]}'

# ════════════════════════════════════════════════════════════════════════
# F-S3.0 — Community member graph foundation (per ADR-0033 Part 1)
# ════════════════════════════════════════════════════════════════════════
#
# AI Qadam's data primitive is a member graph (people ↔ events ↔ skills
# ↔ employers ↔ interests ↔ consents), NOT a sales CRM. Per ADR-0033
# (Accepted 2026-05-20) Twenty is dropped and the platform-asset model
# lives in Directus. Future products (hackathons, HRtech, edtech, paid
# premium, mentorship) extend this graph with namespaced schema; the
# graph stays single-source-of-truth.
#
# This block adds:
#   companies              — orgs (sponsors AND employers AND product partners)
#   directus_users.*       — rich profile fields (job_title, employer FK,
#                            seniority, industry_tags, is_student, bio_md,
#                            appear_in_directory)
#   member_skills          — skill tags per member, optionally event-verified
#   member_employments     — employment history per member, per-employment
#                            share_with_sponsors consent
#   member_interests       — per-member topic + intent (looking_for_job, ...)
#   member_consents        — per-purpose consent ledger (events/marketing/
#                            research/recruiting/sponsor_share/content/
#                            paid_premium). Distinct from the broader
#                            consent_records (Sprint 5.5/2) which logs
#                            per-actor-class × intent_class; this one is
#                            the purpose-keyed ledger ADR-0033 mandates.
#   member_connections     — social graph edges (co-attended, hackathon
#                            teammates, mentor pair); powers "3 people you
#                            might meet" + future products
#   cohorts                — saved filter against members; feeds dispatcher
#                            audiences + partner_audiences entitlements
#   partner_audiences      — sponsor/partner ↔ cohort entitlement; THE
#                            consent-chain enforcement primitive
#   events.*               — visibility, audience_cohort, price_usd,
#                            capacity_band
#   event_types (seed)     — closed | paid | course_session (extends the
#                            existing meetup/workshop/hackathon/conference
#                            /online taxonomy)
#   event_outcomes         — denormalised post-event rollup
#   event_followups        — per-event followup checklist (retro, thank-you,
#                            recap, sponsor report)
#
# Idempotency: every helper call uses the existing ensure() pattern
# (GET-by-id; create on 404). Re-running this script against prod
# Directus produces only "(exists)" lines on the second run.
#
# NOT covered here (separate features):
#   - F-S3.2 cabinet at /workspace/members reads these collections
#   - F-S3.5 sponsor cabinet at /workspace/partners/[id] enforces the
#     sponsor PII boundary (cohort-aggregated views only; NEVER raw rows)
#   - F-S3.9 referral codes (referral_code on members + referred_by on
#     registrations) extends this graph

# ──────────── companies ─────────────────────────────────────────────────
#
# Universal org primitive: a company can be sponsor OR employer OR
# product partner (or any combination). Replaces the need for separate
# sponsor / employer collections; the existing `sponsors` collection
# (PR #78) stays for now as the cabinet display shape — F-S3.5 will
# fold its values into companies.is_sponsor.

echo "[companies]"
ensure "collection companies" \
  "${DIRECTUS_URL}/collections/companies" \
  "${DIRECTUS_URL}/collections" \
  '{
    "collection":"companies",
    "schema":{"name":"companies"},
    "meta":{
      "icon":"business",
      "note":"Org primitive. is_sponsor / is_employer / is_product_partner are independent flags.",
      "sort_field":"name",
      "archive_field":"status",
      "archive_value":"archived",
      "unarchive_value":"active"
    },
    "fields":[
      {"field":"id","type":"uuid","schema":{"is_primary_key":true,"default_value":"gen_random_uuid()","is_nullable":false},"meta":{"interface":"input","readonly":true,"hidden":true,"special":["uuid"]}},
      {"field":"name","type":"string","schema":{"is_nullable":false,"max_length":160},"meta":{"interface":"input","width":"half","required":true}},
      {"field":"slug","type":"string","schema":{"is_nullable":false,"max_length":80,"is_unique":true},"meta":{"interface":"input","width":"half","required":true,"note":"URL slug — lowercase + dashes"}},
      {"field":"industry","type":"string","schema":{"is_nullable":true,"max_length":80},"meta":{"interface":"input","width":"half","note":"Free text; cohort filters can group later"}},
      {"field":"size_band","type":"string","schema":{"is_nullable":true,"max_length":20},"meta":{"interface":"select-dropdown","width":"half","options":{"choices":[{"text":"1–10","value":"micro"},{"text":"11–50","value":"small"},{"text":"51–250","value":"medium"},{"text":"251–1000","value":"large"},{"text":"1000+","value":"xl"}]}}},
      {"field":"country","type":"string","schema":{"is_nullable":true,"max_length":2},"meta":{"interface":"select-dropdown-m2o","width":"half","display":"related-values","display_options":{"template":"{{name}}"},"note":"Primary country (tenant); null for global"}},
      {"field":"website","type":"string","schema":{"is_nullable":true,"max_length":255},"meta":{"interface":"input","width":"half"}},
      {"field":"logo","type":"uuid","schema":{"is_nullable":true},"meta":{"interface":"file-image","width":"full"}},
      {"field":"is_sponsor","type":"boolean","schema":{"default_value":false,"is_nullable":false},"meta":{"interface":"boolean","special":["cast-boolean"],"width":"third"}},
      {"field":"is_employer","type":"boolean","schema":{"default_value":false,"is_nullable":false},"meta":{"interface":"boolean","special":["cast-boolean"],"width":"third"}},
      {"field":"is_product_partner","type":"boolean","schema":{"default_value":false,"is_nullable":false},"meta":{"interface":"boolean","special":["cast-boolean"],"width":"third","note":"Hackathon / paid premium / edtech partner"}},
      {"field":"status","type":"string","schema":{"is_nullable":false,"default_value":"active","max_length":20},"meta":{"interface":"select-dropdown","width":"half","options":{"choices":[{"text":"Active","value":"active"},{"text":"Pending","value":"pending"},{"text":"Archived","value":"archived"}]}}},
      {"field":"date_created","type":"timestamp","schema":{"default_value":"now()"},"meta":{"interface":"datetime","readonly":true,"hidden":true,"special":["date-created"]}},
      {"field":"date_updated","type":"timestamp","schema":{"is_nullable":true},"meta":{"interface":"datetime","readonly":true,"hidden":true,"special":["date-updated"]}}
    ]
  }'

ensure "relation companies.country -> countries.code" \
  "${DIRECTUS_URL}/relations/companies/country" \
  "${DIRECTUS_URL}/relations" \
  '{"collection":"companies","field":"country","related_collection":"countries","schema":{"on_delete":"SET NULL"}}'

ensure "relation companies.logo -> directus_files.id" \
  "${DIRECTUS_URL}/relations/companies/logo" \
  "${DIRECTUS_URL}/relations" \
  '{"collection":"companies","field":"logo","related_collection":"directus_files","schema":{"on_delete":"SET NULL"}}'

# ──────────── directus_users rich-profile fields ────────────────────────
#
# Members carry a rich profile so cohorts, sponsor audiences, and
# product recommendations all read one row. Members manage these
# themselves via the F-S3.6 /me/profile cabinet (Cabinet #5).
#
# Per ADR-0033 sponsor PII boundary: sponsors NEVER read these fields
# directly. They see cohort-aggregated views (Metabase) entitled via
# partner_audiences. Per-employment share_with_sponsors gates the
# "talent slice" Phase-ζ extension.

echo "[directus_users.job_title]"
ensure "field directus_users.job_title" \
  "${DIRECTUS_URL}/fields/directus_users/job_title" \
  "${DIRECTUS_URL}/fields/directus_users" \
  '{
    "field":"job_title",
    "type":"string",
    "schema":{"is_nullable":true,"max_length":160},
    "meta":{"interface":"input","width":"half","note":"Self-reported current role; member edits via /me/profile"}
  }'

echo "[directus_users.employer]"
ensure "field directus_users.employer" \
  "${DIRECTUS_URL}/fields/directus_users/employer" \
  "${DIRECTUS_URL}/fields/directus_users" \
  '{
    "field":"employer",
    "type":"uuid",
    "schema":{"is_nullable":true},
    "meta":{
      "interface":"select-dropdown-m2o",
      "width":"half",
      "display":"related-values",
      "display_options":{"template":"{{name}}"},
      "note":"Current employer (FK companies). Employment history lives in member_employments."
    }
  }'

ensure "relation directus_users.employer -> companies.id" \
  "${DIRECTUS_URL}/relations/directus_users/employer" \
  "${DIRECTUS_URL}/relations" \
  '{"collection":"directus_users","field":"employer","related_collection":"companies","schema":{"on_delete":"SET NULL"}}'

echo "[directus_users.seniority]"
ensure "field directus_users.seniority" \
  "${DIRECTUS_URL}/fields/directus_users/seniority" \
  "${DIRECTUS_URL}/fields/directus_users" \
  '{
    "field":"seniority",
    "type":"string",
    "schema":{"is_nullable":true,"max_length":20},
    "meta":{
      "interface":"select-dropdown",
      "width":"half",
      "options":{"choices":[
        {"text":"Individual contributor","value":"ic"},
        {"text":"Senior IC","value":"senior"},
        {"text":"Lead / staff","value":"lead"},
        {"text":"Manager","value":"manager"},
        {"text":"Director","value":"director"},
        {"text":"VP","value":"vp"},
        {"text":"C-level / founder","value":"c_level"}
      ]},
      "note":"Self-reported career stage; powers cohort filtering"
    }
  }'

echo "[directus_users.industry_tags]"
ensure "field directus_users.industry_tags" \
  "${DIRECTUS_URL}/fields/directus_users/industry_tags" \
  "${DIRECTUS_URL}/fields/directus_users" \
  '{
    "field":"industry_tags",
    "type":"json",
    "schema":{"is_nullable":true,"default_value":"[]"},
    "meta":{
      "interface":"tags",
      "special":["cast-json"],
      "width":"full",
      "note":"Industries this member works in (free tags; cohort filters can group)"
    }
  }'

echo "[directus_users.is_student]"
ensure "field directus_users.is_student" \
  "${DIRECTUS_URL}/fields/directus_users/is_student" \
  "${DIRECTUS_URL}/fields/directus_users" \
  '{
    "field":"is_student",
    "type":"boolean",
    "schema":{"is_nullable":false,"default_value":false},
    "meta":{"interface":"boolean","special":["cast-boolean"],"width":"half","note":"Powers student-discount + university-cohort surfaces"}
  }'

echo "[directus_users.bio_md]"
ensure "field directus_users.bio_md" \
  "${DIRECTUS_URL}/fields/directus_users/bio_md" \
  "${DIRECTUS_URL}/fields/directus_users" \
  '{
    "field":"bio_md",
    "type":"text",
    "schema":{"is_nullable":true},
    "meta":{"interface":"input-rich-text-md","width":"full","note":"Member-managed bio (markdown). Public only if appear_in_directory=true."}
  }'

echo "[directus_users.appear_in_matches]"
# F-S1.5 — gates appearance in another member's pre-event matching email.
# Default true — members opt OUT (vs appear_in_directory which is opt IN).
# Reason: matching email is per-event, recipient-only — much smaller blast
# radius than a public directory listing. The trade-off favors discovery
# while keeping the kill switch on the member side.
ensure "field directus_users.appear_in_matches" \
  "${DIRECTUS_URL}/fields/directus_users/appear_in_matches" \
  "${DIRECTUS_URL}/fields/directus_users" \
  '{
    "field":"appear_in_matches",
    "type":"boolean",
    "schema":{"is_nullable":false,"default_value":true},
    "meta":{
      "interface":"boolean",
      "special":["cast-boolean"],
      "width":"half",
      "note":"F-S1.5 — opt-out for pre-event member-to-member match emails. Default TRUE (opt-out, not opt-in). When false, this member is never named in another member match email AND never receives one."
    }
  }'

echo "[directus_users.appear_in_directory]"
ensure "field directus_users.appear_in_directory" \
  "${DIRECTUS_URL}/fields/directus_users/appear_in_directory" \
  "${DIRECTUS_URL}/fields/directus_users" \
  '{
    "field":"appear_in_directory",
    "type":"boolean",
    "schema":{"is_nullable":false,"default_value":false},
    "meta":{
      "interface":"boolean",
      "special":["cast-boolean"],
      "width":"half",
      "note":"Member opt-in to appear in any member-facing directory. Default OFF — explicit opt-in. Sponsors NEVER read this field; partner_audiences governs sponsor exposure separately."
    }
  }'

# ════════════════════════════════════════════════════════════════════════
# F-S5.6 — Member visibility preferences (further fields)
# ════════════════════════════════════════════════════════════════════════
#
# Three additional opt-in/out flags surfaced in /me/profile alongside
# appear_in_directory + appear_in_matches.
#
# Defaults follow the social-proof-friendly side EXCEPT show_company,
# which is a privacy-first default off — public_profile renderers only
# print the current employer name when the member explicitly enables it.
#
# Consumer status (forward-looking — flags ship before downstream
# surfaces are universal):
#   appear_on_attendee_list      — registrations API doesn't yet expose
#                                  per-attendee names to other attendees;
#                                  the flag is the gate when that lands.
#   appear_on_public_leaderboard — /leaderboard today renders avatars+names
#                                  per F-S3.x; consumer to be added in a
#                                  follow-up (renderer reads the flag,
#                                  default-shows by current behavior).
#   show_company_on_public_profile — public profile pages /u/[handle] gate
#                                  the current-employer display on this flag.

echo "[F-S5.6 — directus_users.appear_on_attendee_list]"
ensure "field directus_users.appear_on_attendee_list" \
  "${DIRECTUS_URL}/fields/directus_users/appear_on_attendee_list" \
  "${DIRECTUS_URL}/fields/directus_users" \
  '{
    "field":"appear_on_attendee_list",
    "type":"boolean",
    "schema":{"is_nullable":false,"default_value":true},
    "meta":{
      "interface":"boolean",
      "special":["cast-boolean"],
      "width":"half",
      "note":"Member shown by name on event attendee lists visible to other attendees. Default ON — opt OUT. Sponsors NEVER read this; sponsor cabinet is cohort-aggregated only."
    }
  }'

echo "[F-S5.6 — directus_users.appear_on_public_leaderboard]"
ensure "field directus_users.appear_on_public_leaderboard" \
  "${DIRECTUS_URL}/fields/directus_users/appear_on_public_leaderboard" \
  "${DIRECTUS_URL}/fields/directus_users" \
  '{
    "field":"appear_on_public_leaderboard",
    "type":"boolean",
    "schema":{"is_nullable":false,"default_value":true},
    "meta":{
      "interface":"boolean",
      "special":["cast-boolean"],
      "width":"half",
      "note":"Name + total points appear on /leaderboard (public). Default ON — opt OUT. When off, member is excluded from the rendered list (still counted in rank arithmetic so ranks are stable)."
    }
  }'

echo "[F-S5.6 — directus_users.show_company_on_public_profile]"
ensure "field directus_users.show_company_on_public_profile" \
  "${DIRECTUS_URL}/fields/directus_users/show_company_on_public_profile" \
  "${DIRECTUS_URL}/fields/directus_users" \
  '{
    "field":"show_company_on_public_profile",
    "type":"boolean",
    "schema":{"is_nullable":false,"default_value":false},
    "meta":{
      "interface":"boolean",
      "special":["cast-boolean"],
      "width":"half",
      "note":"When appear_in_directory=true, also render the current employer name on public profile. Default OFF — privacy-first. Per-employment share_with_sponsors (on member_employments) governs sponsor exposure separately."
    }
  }'

# ──────────── member_skills ─────────────────────────────────────────────
#
# Tag-per-row keeps cohort filtering simple. verified_by_event nudges
# trust over time: "attended a fintech meetup" → fintech tag gets a
# verification signal usable for sponsor audience analytics.

echo "[member_skills]"
ensure "collection member_skills" \
  "${DIRECTUS_URL}/collections/member_skills" \
  "${DIRECTUS_URL}/collections" \
  '{
    "collection":"member_skills",
    "schema":{"name":"member_skills"},
    "meta":{
      "icon":"workspace_premium",
      "note":"One row per (member, skill_tag). Endorsements + event-verification accrue over time.",
      "sort_field":"date_created"
    },
    "fields":[
      {"field":"id","type":"uuid","schema":{"is_primary_key":true,"default_value":"gen_random_uuid()","is_nullable":false},"meta":{"interface":"input","readonly":true,"hidden":true,"special":["uuid"]}},
      {"field":"member","type":"uuid","schema":{"is_nullable":false},"meta":{"interface":"select-dropdown-m2o","width":"half","required":true,"display":"related-values","display_options":{"template":"{{email}}"}}},
      {"field":"skill_tag","type":"string","schema":{"is_nullable":false,"max_length":80},"meta":{"interface":"input","width":"half","required":true,"note":"Free tag (lowercase, hyphenated); e.g. python, llm-finetuning, fintech, ml-ops"}},
      {"field":"endorsement_count","type":"integer","schema":{"is_nullable":false,"default_value":0},"meta":{"interface":"input","width":"half","note":"Incremented by peer endorsements; not member-editable"}},
      {"field":"verified_by_event","type":"uuid","schema":{"is_nullable":true},"meta":{"interface":"select-dropdown-m2o","width":"half","display":"related-values","display_options":{"template":"{{title}}"},"note":"Event whose attendance verified this skill (optional)"}},
      {"field":"date_created","type":"timestamp","schema":{"default_value":"now()"},"meta":{"interface":"datetime","readonly":true,"hidden":true,"special":["date-created"]}}
    ]
  }'

ensure "relation member_skills.member -> directus_users.id" \
  "${DIRECTUS_URL}/relations/member_skills/member" \
  "${DIRECTUS_URL}/relations" \
  '{"collection":"member_skills","field":"member","related_collection":"directus_users","schema":{"on_delete":"CASCADE"}}'

ensure "relation member_skills.verified_by_event -> events.id" \
  "${DIRECTUS_URL}/relations/member_skills/verified_by_event" \
  "${DIRECTUS_URL}/relations" \
  '{"collection":"member_skills","field":"verified_by_event","related_collection":"events","schema":{"on_delete":"SET NULL"}}'

# ──────────── member_employments ────────────────────────────────────────
#
# Employment history. Per-employment share_with_sponsors flag is the
# member-controlled toggle that powers the Phase-ζ "talent slice"
# sponsor tier — sponsors only see employer info for members who
# explicitly opted in for THAT employment.

echo "[member_employments]"
ensure "collection member_employments" \
  "${DIRECTUS_URL}/collections/member_employments" \
  "${DIRECTUS_URL}/collections" \
  '{
    "collection":"member_employments",
    "schema":{"name":"member_employments"},
    "meta":{
      "icon":"work_history",
      "note":"Per-employment record. is_current + per-employment share_with_sponsors govern visibility.",
      "sort_field":"started_at"
    },
    "fields":[
      {"field":"id","type":"uuid","schema":{"is_primary_key":true,"default_value":"gen_random_uuid()","is_nullable":false},"meta":{"interface":"input","readonly":true,"hidden":true,"special":["uuid"]}},
      {"field":"member","type":"uuid","schema":{"is_nullable":false},"meta":{"interface":"select-dropdown-m2o","width":"half","required":true,"display":"related-values","display_options":{"template":"{{email}}"}}},
      {"field":"employer","type":"uuid","schema":{"is_nullable":false},"meta":{"interface":"select-dropdown-m2o","width":"half","required":true,"display":"related-values","display_options":{"template":"{{name}}"}}},
      {"field":"role","type":"string","schema":{"is_nullable":true,"max_length":160},"meta":{"interface":"input","width":"half"}},
      {"field":"started_at","type":"date","schema":{"is_nullable":true},"meta":{"interface":"datetime","options":{"includeTime":false},"width":"half"}},
      {"field":"ended_at","type":"date","schema":{"is_nullable":true},"meta":{"interface":"datetime","options":{"includeTime":false},"width":"half","note":"Null when is_current=true"}},
      {"field":"is_current","type":"boolean","schema":{"is_nullable":false,"default_value":false},"meta":{"interface":"boolean","special":["cast-boolean"],"width":"half"}},
      {"field":"share_with_sponsors","type":"boolean","schema":{"is_nullable":false,"default_value":false},"meta":{"interface":"boolean","special":["cast-boolean"],"width":"half","note":"Member-controlled per-employment opt-in. Default OFF. Gates Phase-ζ talent-slice sponsor exposure."}}
    ]
  }'

ensure "relation member_employments.member -> directus_users.id" \
  "${DIRECTUS_URL}/relations/member_employments/member" \
  "${DIRECTUS_URL}/relations" \
  '{"collection":"member_employments","field":"member","related_collection":"directus_users","schema":{"on_delete":"CASCADE"}}'

ensure "relation member_employments.employer -> companies.id" \
  "${DIRECTUS_URL}/relations/member_employments/employer" \
  "${DIRECTUS_URL}/relations" \
  '{"collection":"member_employments","field":"employer","related_collection":"companies","schema":{"on_delete":"RESTRICT"}}'

# ──────────── member_interests ──────────────────────────────────────────

echo "[member_interests]"
ensure "collection member_interests" \
  "${DIRECTUS_URL}/collections/member_interests" \
  "${DIRECTUS_URL}/collections" \
  '{
    "collection":"member_interests",
    "schema":{"name":"member_interests"},
    "meta":{
      "icon":"interests",
      "note":"One row per (member, topic, intent). Powers matching + recommendations + targeted invites.",
      "sort_field":"date_created"
    },
    "fields":[
      {"field":"id","type":"uuid","schema":{"is_primary_key":true,"default_value":"gen_random_uuid()","is_nullable":false},"meta":{"interface":"input","readonly":true,"hidden":true,"special":["uuid"]}},
      {"field":"member","type":"uuid","schema":{"is_nullable":false},"meta":{"interface":"select-dropdown-m2o","width":"half","required":true,"display":"related-values","display_options":{"template":"{{email}}"}}},
      {"field":"topic_tag","type":"string","schema":{"is_nullable":false,"max_length":80},"meta":{"interface":"input","width":"half","required":true,"note":"Free tag — e.g. computer-vision, mlops, ai-policy"}},
      {"field":"intent","type":"string","schema":{"is_nullable":false,"max_length":40},"meta":{
        "interface":"select-dropdown",
        "width":"half",
        "required":true,
        "options":{"choices":[
          {"text":"Interested in","value":"interested_in"},
          {"text":"Willing to speak","value":"willing_to_speak"},
          {"text":"Looking for job","value":"looking_for_job"},
          {"text":"Looking for cofounder","value":"looking_for_cofounder"},
          {"text":"Looking for mentor","value":"looking_for_mentor"},
          {"text":"Willing to mentor","value":"willing_to_mentor"}
        ]}
      }},
      {"field":"date_created","type":"timestamp","schema":{"default_value":"now()"},"meta":{"interface":"datetime","readonly":true,"hidden":true,"special":["date-created"]}}
    ]
  }'

ensure "relation member_interests.member -> directus_users.id" \
  "${DIRECTUS_URL}/relations/member_interests/member" \
  "${DIRECTUS_URL}/relations" \
  '{"collection":"member_interests","field":"member","related_collection":"directus_users","schema":{"on_delete":"CASCADE"}}'

# ──────────── member_consents ───────────────────────────────────────────
#
# Per-purpose consent ledger. Distinct from the (actor-class × intent)
# consent_records collection (Sprint 5.5/2): that one keys off the
# initiator of a message; this one keys off the WHY (events / marketing
# / research / recruiting / sponsor_share / content / paid_premium).
#
# Per ADR-0033 sponsor PII boundary: the (member_consents × partner_audiences)
# pair is the consent-chain enforcement primitive. Sponsors NEVER touch
# raw member rows — they read cohort-aggregated views filtered by
# member_consents.purpose=sponsor_share AND revoked_at IS NULL.
#
# Append-only-ish: each toggle inserts a new row. Reading current state =
# most-recent row per (member, purpose), check revoked_at IS NULL.

echo "[member_consents]"
ensure "collection member_consents" \
  "${DIRECTUS_URL}/collections/member_consents" \
  "${DIRECTUS_URL}/collections" \
  '{
    "collection":"member_consents",
    "schema":{"name":"member_consents"},
    "meta":{
      "icon":"verified_user",
      "note":"Per-purpose consent ledger. Most recent row per (member, purpose) wins. Pair with partner_audiences for sponsor PII enforcement.",
      "sort_field":"granted_at"
    },
    "fields":[
      {"field":"id","type":"uuid","schema":{"is_primary_key":true,"default_value":"gen_random_uuid()","is_nullable":false},"meta":{"interface":"input","readonly":true,"hidden":true,"special":["uuid"]}},
      {"field":"member","type":"uuid","schema":{"is_nullable":false},"meta":{"interface":"select-dropdown-m2o","width":"half","required":true,"display":"related-values","display_options":{"template":"{{email}}"}}},
      {"field":"purpose","type":"string","schema":{"is_nullable":false,"max_length":40},"meta":{
        "interface":"select-dropdown",
        "width":"half",
        "required":true,
        "options":{"choices":[
          {"text":"Events","value":"events"},
          {"text":"Marketing","value":"marketing"},
          {"text":"Research","value":"research"},
          {"text":"Recruiting","value":"recruiting"},
          {"text":"Sponsor share (aggregated)","value":"sponsor_share"},
          {"text":"Content","value":"content"},
          {"text":"Paid premium","value":"paid_premium"}
        ]},
        "note":"Coarse-grained purpose. Per-sponsor / per-employer scoping happens via partner_audiences."
      }},
      {"field":"granted_at","type":"timestamp","schema":{"is_nullable":false,"default_value":"now()"},"meta":{"interface":"datetime","width":"half"}},
      {"field":"revoked_at","type":"timestamp","schema":{"is_nullable":true},"meta":{"interface":"datetime","width":"half","note":"Null = currently granted"}},
      {"field":"source","type":"string","schema":{"is_nullable":false,"default_value":"preferences_page","max_length":40},"meta":{
        "interface":"select-dropdown",
        "width":"half",
        "options":{"choices":[
          {"text":"Signup","value":"signup"},
          {"text":"Preferences page","value":"preferences_page"},
          {"text":"Email link","value":"email_link"},
          {"text":"Event check-in","value":"event_check_in"}
        ]}
      }}
    ]
  }'

ensure "relation member_consents.member -> directus_users.id" \
  "${DIRECTUS_URL}/relations/member_consents/member" \
  "${DIRECTUS_URL}/relations" \
  '{"collection":"member_consents","field":"member","related_collection":"directus_users","schema":{"on_delete":"CASCADE"}}'

# ──────────── member_connections ────────────────────────────────────────
#
# Social-graph edges between two members. Powers "3 people you might
# meet at this event" + future products (mentor matching, hackathon
# team formation, alumni-of-cohort-X recommendations).
#
# Edges are undirected logically; the app reads both (a→b) and (b→a)
# rows and de-dupes. Writers should insert one row (lower-uuid first by
# convention) to avoid double-counting.

echo "[member_connections]"
ensure "collection member_connections" \
  "${DIRECTUS_URL}/collections/member_connections" \
  "${DIRECTUS_URL}/collections" \
  '{
    "collection":"member_connections",
    "schema":{"name":"member_connections"},
    "meta":{
      "icon":"hub",
      "note":"Member ↔ member edges. Writers insert with lower-uuid as member_a to avoid duplicates.",
      "sort_field":"date_created"
    },
    "fields":[
      {"field":"id","type":"uuid","schema":{"is_primary_key":true,"default_value":"gen_random_uuid()","is_nullable":false},"meta":{"interface":"input","readonly":true,"hidden":true,"special":["uuid"]}},
      {"field":"member_a","type":"uuid","schema":{"is_nullable":false},"meta":{"interface":"select-dropdown-m2o","width":"half","required":true,"display":"related-values","display_options":{"template":"{{email}}"}}},
      {"field":"member_b","type":"uuid","schema":{"is_nullable":false},"meta":{"interface":"select-dropdown-m2o","width":"half","required":true,"display":"related-values","display_options":{"template":"{{email}}"}}},
      {"field":"signal","type":"string","schema":{"is_nullable":false,"max_length":40},"meta":{
        "interface":"select-dropdown",
        "width":"half",
        "required":true,
        "options":{"choices":[
          {"text":"Co-attended event","value":"co_attended_event"},
          {"text":"Hackathon teammate","value":"hackathon_teammate"},
          {"text":"Mentor pair","value":"mentor_pair"}
        ]}
      }},
      {"field":"context_event","type":"uuid","schema":{"is_nullable":true},"meta":{"interface":"select-dropdown-m2o","width":"half","display":"related-values","display_options":{"template":"{{title}}"},"note":"Event where the connection formed (optional)"}},
      {"field":"weight","type":"integer","schema":{"is_nullable":false,"default_value":1},"meta":{"interface":"input","width":"half","note":"Higher = stronger signal; +1 per co-attendance, +5 for hackathon team, +10 for mentor pair"}},
      {"field":"date_created","type":"timestamp","schema":{"default_value":"now()"},"meta":{"interface":"datetime","readonly":true,"hidden":true,"special":["date-created"]}}
    ]
  }'

ensure "relation member_connections.member_a -> directus_users.id" \
  "${DIRECTUS_URL}/relations/member_connections/member_a" \
  "${DIRECTUS_URL}/relations" \
  '{"collection":"member_connections","field":"member_a","related_collection":"directus_users","schema":{"on_delete":"CASCADE"}}'

ensure "relation member_connections.member_b -> directus_users.id" \
  "${DIRECTUS_URL}/relations/member_connections/member_b" \
  "${DIRECTUS_URL}/relations" \
  '{"collection":"member_connections","field":"member_b","related_collection":"directus_users","schema":{"on_delete":"CASCADE"}}'

ensure "relation member_connections.context_event -> events.id" \
  "${DIRECTUS_URL}/relations/member_connections/context_event" \
  "${DIRECTUS_URL}/relations" \
  '{"collection":"member_connections","field":"context_event","related_collection":"events","schema":{"on_delete":"SET NULL"}}'

# ──────────── cohorts ───────────────────────────────────────────────────
#
# A cohort = a saved Directus filter against members. Operators build
# cohorts in the F-S3.2 Member Directory cabinet; the resulting filter
# is reusable as:
#   - audience for the Interactions dispatcher (F-S3.3 announce cabinet)
#   - entitled-audience for partner_audiences (sponsor reads via cohort)
#   - alumni-cohort feed for product spawn (edtech recs, etc.)
#
# filter_query is a Directus filter object — the same shape Directus
# uses in the API ?filter=... param. Stored as jsonb. Cron refreshes
# member_count_cached so cabinets don't re-evaluate on every view.

echo "[cohorts]"
ensure "collection cohorts" \
  "${DIRECTUS_URL}/collections/cohorts" \
  "${DIRECTUS_URL}/collections" \
  '{
    "collection":"cohorts",
    "schema":{"name":"cohorts"},
    "meta":{
      "icon":"groups",
      "note":"Saved filter against members. Feeds dispatcher + partner_audiences.",
      "sort_field":"name"
    },
    "fields":[
      {"field":"id","type":"uuid","schema":{"is_primary_key":true,"default_value":"gen_random_uuid()","is_nullable":false},"meta":{"interface":"input","readonly":true,"hidden":true,"special":["uuid"]}},
      {"field":"name","type":"string","schema":{"is_nullable":false,"max_length":120},"meta":{"interface":"input","width":"half","required":true}},
      {"field":"slug","type":"string","schema":{"is_nullable":false,"max_length":80,"is_unique":true},"meta":{"interface":"input","width":"half","required":true,"note":"Stable handle for API references"}},
      {"field":"description","type":"text","schema":{"is_nullable":true},"meta":{"interface":"input-multiline","width":"full","note":"What this cohort is for; visible to operators choosing audiences"}},
      {"field":"filter_query","type":"json","schema":{"is_nullable":false,"default_value":"{}"},"meta":{"interface":"input-code","options":{"language":"json"},"special":["cast-json"],"width":"full","required":true,"note":"Directus filter object against directus_users (joins via member_skills/member_interests/etc. supported)"}},
      {"field":"created_by","type":"uuid","schema":{"is_nullable":true},"meta":{"interface":"select-dropdown-m2o","width":"half","display":"related-values","display_options":{"template":"{{email}}"}}},
      {"field":"member_count_cached","type":"integer","schema":{"is_nullable":false,"default_value":0},"meta":{"interface":"input","width":"half","readonly":true,"note":"Refreshed by cron; cabinet UI shows this without re-evaluating filter on every page"}},
      {"field":"member_count_refreshed_at","type":"timestamp","schema":{"is_nullable":true},"meta":{"interface":"datetime","width":"half","readonly":true}},
      {"field":"date_created","type":"timestamp","schema":{"default_value":"now()"},"meta":{"interface":"datetime","readonly":true,"hidden":true,"special":["date-created"]}},
      {"field":"date_updated","type":"timestamp","schema":{"is_nullable":true},"meta":{"interface":"datetime","readonly":true,"hidden":true,"special":["date-updated"]}}
    ]
  }'

ensure "relation cohorts.created_by -> directus_users.id" \
  "${DIRECTUS_URL}/relations/cohorts/created_by" \
  "${DIRECTUS_URL}/relations" \
  '{"collection":"cohorts","field":"created_by","related_collection":"directus_users","schema":{"on_delete":"SET NULL"}}'

# ──────────── partner_audiences ─────────────────────────────────────────
#
# THE consent-chain enforcement primitive (per ADR-0033 sponsor PII
# boundary): partner X can see cohort Y for purpose Z, granted at T1,
# expires at T2. Every read of "what does this sponsor see?" runs
# through this table. Cohort-aggregated views (Metabase) filter on
# (partner, purpose, NOT-expired). Audited per record via audit_events
# once that collection lands (Sprint 2.5).

echo "[partner_audiences]"
ensure "collection partner_audiences" \
  "${DIRECTUS_URL}/collections/partner_audiences" \
  "${DIRECTUS_URL}/collections" \
  '{
    "collection":"partner_audiences",
    "schema":{"name":"partner_audiences"},
    "meta":{
      "icon":"verified_user",
      "note":"Partner ↔ cohort entitlement. Per ADR-0033 sponsor PII boundary, every sponsor read goes through here.",
      "sort_field":"granted_at"
    },
    "fields":[
      {"field":"id","type":"uuid","schema":{"is_primary_key":true,"default_value":"gen_random_uuid()","is_nullable":false},"meta":{"interface":"input","readonly":true,"hidden":true,"special":["uuid"]}},
      {"field":"partner","type":"uuid","schema":{"is_nullable":false},"meta":{"interface":"select-dropdown-m2o","width":"half","required":true,"display":"related-values","display_options":{"template":"{{name}}"},"note":"FK to companies (is_sponsor / is_employer / is_product_partner = true)"}},
      {"field":"cohort","type":"uuid","schema":{"is_nullable":false},"meta":{"interface":"select-dropdown-m2o","width":"half","required":true,"display":"related-values","display_options":{"template":"{{name}}"}}},
      {"field":"purpose","type":"string","schema":{"is_nullable":false,"max_length":40},"meta":{
        "interface":"select-dropdown",
        "width":"half",
        "required":true,
        "options":{"choices":[
          {"text":"Event invite","value":"event_invite"},
          {"text":"Job posting","value":"job_posting"},
          {"text":"Research invite","value":"research_invite"},
          {"text":"Sponsor analytics","value":"sponsor_analytics"}
        ]}
      }},
      {"field":"granted_at","type":"timestamp","schema":{"is_nullable":false,"default_value":"now()"},"meta":{"interface":"datetime","width":"half"}},
      {"field":"expires_at","type":"timestamp","schema":{"is_nullable":true},"meta":{"interface":"datetime","width":"half","note":"Null = no auto-expire; F-S3.5 cabinet enforces"}},
      {"field":"granted_by","type":"uuid","schema":{"is_nullable":true},"meta":{"interface":"select-dropdown-m2o","width":"half","display":"related-values","display_options":{"template":"{{email}}"},"note":"Operator who granted the entitlement"}}
    ]
  }'

ensure "relation partner_audiences.partner -> companies.id" \
  "${DIRECTUS_URL}/relations/partner_audiences/partner" \
  "${DIRECTUS_URL}/relations" \
  '{"collection":"partner_audiences","field":"partner","related_collection":"companies","schema":{"on_delete":"CASCADE"}}'

ensure "relation partner_audiences.cohort -> cohorts.id" \
  "${DIRECTUS_URL}/relations/partner_audiences/cohort" \
  "${DIRECTUS_URL}/relations" \
  '{"collection":"partner_audiences","field":"cohort","related_collection":"cohorts","schema":{"on_delete":"CASCADE"}}'

ensure "relation partner_audiences.granted_by -> directus_users.id" \
  "${DIRECTUS_URL}/relations/partner_audiences/granted_by" \
  "${DIRECTUS_URL}/relations" \
  '{"collection":"partner_audiences","field":"granted_by","related_collection":"directus_users","schema":{"on_delete":"SET NULL"}}'

# ──────────── events taxonomy extensions ────────────────────────────────
#
# Extend the existing events collection with cohort + visibility +
# pricing fields. Existing rows remain valid (all new fields nullable
# / with safe defaults). Per ADR-0033 Part 1.

echo "[events.visibility]"
ensure "field events.visibility" \
  "${DIRECTUS_URL}/fields/events/visibility" \
  "${DIRECTUS_URL}/fields/events" \
  '{
    "field":"visibility",
    "type":"string",
    "schema":{"is_nullable":false,"default_value":"public","max_length":20},
    "meta":{
      "interface":"select-dropdown",
      "width":"half",
      "options":{"choices":[
        {"text":"Public","value":"public"},
        {"text":"Cohort","value":"cohort"},
        {"text":"Invite-only","value":"invite_only"}
      ]},
      "note":"public = listed on country home; cohort = only audience_cohort sees it; invite_only = direct link only"
    }
  }'

echo "[events.audience_cohort]"
ensure "field events.audience_cohort" \
  "${DIRECTUS_URL}/fields/events/audience_cohort" \
  "${DIRECTUS_URL}/fields/events" \
  '{
    "field":"audience_cohort",
    "type":"uuid",
    "schema":{"is_nullable":true},
    "meta":{
      "interface":"select-dropdown-m2o",
      "width":"half",
      "display":"related-values",
      "display_options":{"template":"{{name}}"},
      "note":"For visibility=cohort: which cohort sees + can register. Required when visibility=cohort (app-enforced)."
    }
  }'

ensure "relation events.audience_cohort -> cohorts.id" \
  "${DIRECTUS_URL}/relations/events/audience_cohort" \
  "${DIRECTUS_URL}/relations" \
  '{"collection":"events","field":"audience_cohort","related_collection":"cohorts","schema":{"on_delete":"SET NULL"}}'

echo "[events.price_usd]"
ensure "field events.price_usd" \
  "${DIRECTUS_URL}/fields/events/price_usd" \
  "${DIRECTUS_URL}/fields/events" \
  '{
    "field":"price_usd",
    "type":"decimal",
    "schema":{"is_nullable":true,"numeric_precision":10,"numeric_scale":2},
    "meta":{"interface":"input","width":"half","note":"Null = free. Used for paid workshops / course sessions / closed events."}
  }'

echo "[events.capacity_band]"
ensure "field events.capacity_band" \
  "${DIRECTUS_URL}/fields/events/capacity_band" \
  "${DIRECTUS_URL}/fields/events" \
  '{
    "field":"capacity_band",
    "type":"string",
    "schema":{"is_nullable":true,"max_length":20},
    "meta":{
      "interface":"select-dropdown",
      "width":"half",
      "options":{"choices":[
        {"text":"Micro (<10)","value":"micro"},
        {"text":"Small (10–29)","value":"small"},
        {"text":"Medium (30–79)","value":"medium"},
        {"text":"Large (80–199)","value":"large"},
        {"text":"XL (200+)","value":"xl"}
      ]},
      "note":"Display banding; sponsor cabinet filters by this without exposing exact attendee counts pre-event"
    }
  }'

# ──────────── event_types seed extensions ───────────────────────────────
#
# Add closed / paid / course_session to the existing meetup / workshop /
# hackathon / conference / online taxonomy. seed_type() is idempotent.

echo "[event_types — extensions per ADR-0033]"
seed_type closed         "Closed event"   "#6b7280" 60
seed_type paid           "Paid event"     "#10b981" 70
seed_type course_session "Course session" "#a855f7" 80

# ──────────── event_outcomes ────────────────────────────────────────────
#
# Denormalised post-event rollup. One row per event. Refreshed by the
# F-S1.1c post-event cron (existing) PLUS a new F-S3.4 cabinet write
# path. Powers sponsor reports cheaply (no join across registrations +
# interaction_responses each render).

echo "[event_outcomes]"
ensure "collection event_outcomes" \
  "${DIRECTUS_URL}/collections/event_outcomes" \
  "${DIRECTUS_URL}/collections" \
  '{
    "collection":"event_outcomes",
    "schema":{"name":"event_outcomes"},
    "meta":{
      "icon":"insights",
      "note":"Post-event rollup. One row per event. App-enforced uniqueness on event FK.",
      "sort_field":"date_updated"
    },
    "fields":[
      {"field":"id","type":"uuid","schema":{"is_primary_key":true,"default_value":"gen_random_uuid()","is_nullable":false},"meta":{"interface":"input","readonly":true,"hidden":true,"special":["uuid"]}},
      {"field":"event","type":"uuid","schema":{"is_nullable":false,"is_unique":true},"meta":{"interface":"select-dropdown-m2o","width":"half","required":true,"display":"related-values","display_options":{"template":"{{title}}"}}},
      {"field":"registrations_count","type":"integer","schema":{"is_nullable":false,"default_value":0},"meta":{"interface":"input","width":"half","readonly":true}},
      {"field":"attended_count","type":"integer","schema":{"is_nullable":false,"default_value":0},"meta":{"interface":"input","width":"half","readonly":true}},
      {"field":"csat_avg","type":"decimal","schema":{"is_nullable":true,"numeric_precision":3,"numeric_scale":2},"meta":{"interface":"input","width":"half","readonly":true,"note":"0–5 scale; null if N<3 responses (anonymity floor)"}},
      {"field":"nps","type":"integer","schema":{"is_nullable":true},"meta":{"interface":"input","width":"half","readonly":true,"note":"-100..+100; null if N<3 responses"}},
      {"field":"content_artifacts_count","type":"integer","schema":{"is_nullable":false,"default_value":0},"meta":{"interface":"input","width":"half","readonly":true,"note":"Recordings + slides + recaps published"}},
      {"field":"follow_up_completed","type":"boolean","schema":{"is_nullable":false,"default_value":false},"meta":{"interface":"boolean","special":["cast-boolean"],"width":"half","note":"All event_followups for this event marked complete"}},
      {"field":"date_created","type":"timestamp","schema":{"default_value":"now()"},"meta":{"interface":"datetime","readonly":true,"hidden":true,"special":["date-created"]}},
      {"field":"date_updated","type":"timestamp","schema":{"is_nullable":true},"meta":{"interface":"datetime","readonly":true,"hidden":true,"special":["date-updated"]}}
    ]
  }'

ensure "relation event_outcomes.event -> events.id" \
  "${DIRECTUS_URL}/relations/event_outcomes/event" \
  "${DIRECTUS_URL}/relations" \
  '{"collection":"event_outcomes","field":"event","related_collection":"events","schema":{"on_delete":"CASCADE"}}'

# ──────────── event_followups ───────────────────────────────────────────

echo "[event_followups]"
ensure "collection event_followups" \
  "${DIRECTUS_URL}/collections/event_followups" \
  "${DIRECTUS_URL}/collections" \
  '{
    "collection":"event_followups",
    "schema":{"name":"event_followups"},
    "meta":{
      "icon":"task_alt",
      "note":"Per-event followup checklist. F-S3.4 cabinet drives completion; F-S3.5 partner cabinet reads sponsor_report_delivered.",
      "sort_field":"due_at"
    },
    "fields":[
      {"field":"id","type":"uuid","schema":{"is_primary_key":true,"default_value":"gen_random_uuid()","is_nullable":false},"meta":{"interface":"input","readonly":true,"hidden":true,"special":["uuid"]}},
      {"field":"event","type":"uuid","schema":{"is_nullable":false},"meta":{"interface":"select-dropdown-m2o","width":"half","required":true,"display":"related-values","display_options":{"template":"{{title}}"}}},
      {"field":"kind","type":"string","schema":{"is_nullable":false,"max_length":40},"meta":{
        "interface":"select-dropdown",
        "width":"half",
        "required":true,
        "options":{"choices":[
          {"text":"Retrospective","value":"retrospective"},
          {"text":"Thank-you sent","value":"thank_you_sent"},
          {"text":"Recap posted","value":"recap_posted"},
          {"text":"Sponsor report delivered","value":"sponsor_report_delivered"}
        ]}
      }},
      {"field":"body_md","type":"text","schema":{"is_nullable":true},"meta":{"interface":"input-rich-text-md","width":"full","note":"Retrospective notes or recap copy (markdown). Optional for other kinds."}},
      {"field":"due_at","type":"timestamp","schema":{"is_nullable":true},"meta":{"interface":"datetime","width":"half"}},
      {"field":"completed_at","type":"timestamp","schema":{"is_nullable":true},"meta":{"interface":"datetime","width":"half","note":"Null = pending"}},
      {"field":"date_created","type":"timestamp","schema":{"default_value":"now()"},"meta":{"interface":"datetime","readonly":true,"hidden":true,"special":["date-created"]}}
    ]
  }'

ensure "relation event_followups.event -> events.id" \
  "${DIRECTUS_URL}/relations/event_followups/event" \
  "${DIRECTUS_URL}/relations" \
  '{"collection":"event_followups","field":"event","related_collection":"events","schema":{"on_delete":"CASCADE"}}'

# ──────────── F-S3.0 — extend S0.1 demo-tenant isolation ────────────────
#
# Only collections with their own country field need a new permission
# row; member-scoped collections cascade via the existing
# directus_users/read filter (is_test_user). cohorts + partner_audiences
# are member-graph-scoped not country-scoped, so a country filter
# doesn't apply.

echo "[S0.1 — permissions: extend for member graph collections]"
ensure_perm "perm companies/read" companies read "$COUNTRY_FILTER"

# ════════════════════════════════════════════════════════════════════════
# F-S0.9b — Brand-asset library (Tier 2 per ADR-0025)
# ════════════════════════════════════════════════════════════════════════
#
# Tier 2 produced brand assets live here. Tier 1 (logos / favicons /
# brand mark) stays in apps/web/public/brand/ per ADR-0025 Decision §1
# — engineer-PR'd via the normal git flow; that scope is unchanged.
#
# Schema captures: category (the asset class from ADR-0025 §Tier 2),
# optional bindings (event / sponsor / speaker / subject_user /
# country) so a single asset row can be filtered for the right
# surface, the draft→pending_review→approved→archived status machine
# that enforces Viktor as approval gate, the actual file + a
# thumbnail, and the ai_prompt transparency field for AI-generated
# assets.
#
# Read shape (F-S0.9b):
#   /press queries category IN (press-headshot, fact-sheet,
#     quarterly-digest, press-coverage) WHERE visibility=public AND
#     status=approved
#   /events/[id] recap queries event=<id> WHERE visibility=public AND
#     status=approved (once F-S3.4 cabinet exposes the upload UX)
#   F-S3.5 partner cabinet queries sponsor=<id> WHERE visibility IN
#     (public, sponsors)
#   Operator-only assets use visibility=operators_only and never
#     surface to members.

echo "[marketing_assets]"
ensure "collection marketing_assets" \
  "${DIRECTUS_URL}/collections/marketing_assets" \
  "${DIRECTUS_URL}/collections" \
  '{
    "collection":"marketing_assets",
    "schema":{"name":"marketing_assets"},
    "meta":{
      "icon":"photo_library",
      "note":"Tier 2 brand assets per ADR-0025. status enforces Viktor approval gate; visibility scopes who can read.",
      "sort_field":"date_updated",
      "archive_field":"status",
      "archive_value":"archived",
      "unarchive_value":"draft"
    },
    "fields":[
      {"field":"id","type":"uuid","schema":{"is_primary_key":true,"default_value":"gen_random_uuid()","is_nullable":false},"meta":{"interface":"input","readonly":true,"hidden":true,"special":["uuid"]}},
      {"field":"title","type":"string","schema":{"is_nullable":false,"max_length":200},"meta":{"interface":"input","width":"full","required":true,"note":"e.g. \"Binali Rustamov — founder headshot v2\""}},
      {"field":"description","type":"text","schema":{"is_nullable":true},"meta":{"interface":"input-multiline","width":"full","note":"Context for downstream consumers + future Viktor"}},
      {"field":"category","type":"string","schema":{"is_nullable":false,"max_length":40},"meta":{
        "interface":"select-dropdown",
        "width":"half",
        "required":true,
        "options":{"choices":[
          {"text":"Press headshot","value":"press-headshot"},
          {"text":"Fact sheet","value":"fact-sheet"},
          {"text":"Press pack (zip)","value":"press-pack"},
          {"text":"Press coverage","value":"press-coverage"},
          {"text":"Quarterly digest","value":"quarterly-digest"},
          {"text":"Social card (event)","value":"social-card-event"},
          {"text":"Social card (speaker)","value":"social-card-speaker"},
          {"text":"Social card (quote)","value":"social-card-quote"},
          {"text":"Social card (recap)","value":"social-card-recap"},
          {"text":"Event photo","value":"event-photo"},
          {"text":"Speaker spotlight","value":"speaker-spotlight"},
          {"text":"Sponsor logo variant","value":"sponsor-logo-variant"},
          {"text":"Video","value":"video"},
          {"text":"Other","value":"other"}
        ]}
      }},
      {"field":"visibility","type":"string","schema":{"is_nullable":false,"default_value":"operators_only","max_length":20},"meta":{
        "interface":"select-dropdown",
        "width":"half",
        "options":{"choices":[
          {"text":"Public","value":"public"},
          {"text":"Sponsors (per partner_audiences)","value":"sponsors"},
          {"text":"Operators only","value":"operators_only"},
          {"text":"Engineers only","value":"engineers_only"}
        ]},
        "note":"public = surfaces like /press; operators_only = workspace cabinets only; engineers_only = ad-hoc engineer use"
      }},
      {"field":"status","type":"string","schema":{"is_nullable":false,"default_value":"draft","max_length":20},"meta":{
        "interface":"select-dropdown",
        "width":"half",
        "options":{"choices":[
          {"text":"Draft","value":"draft"},
          {"text":"Pending review","value":"pending_review"},
          {"text":"Approved","value":"approved"},
          {"text":"Archived","value":"archived"}
        ]},
        "note":"Public surfaces filter to status=approved per ADR-0025 approval workflow"
      }},
      {"field":"event","type":"uuid","schema":{"is_nullable":true},"meta":{"interface":"select-dropdown-m2o","width":"half","display":"related-values","display_options":{"template":"{{title}}"},"note":"Bind to an event when the asset is event-specific"}},
      {"field":"sponsor","type":"uuid","schema":{"is_nullable":true},"meta":{"interface":"select-dropdown-m2o","width":"half","display":"related-values","display_options":{"template":"{{name}}"},"note":"Bind to a sponsor (companies) for sponsor-recap deliverables"}},
      {"field":"speaker","type":"uuid","schema":{"is_nullable":true},"meta":{"interface":"select-dropdown-m2o","width":"half","display":"related-values","display_options":{"template":"{{user.email}}"},"note":"Bind to a speaker for spotlight assets"}},
      {"field":"subject_user","type":"uuid","schema":{"is_nullable":true},"meta":{"interface":"select-dropdown-m2o","width":"half","display":"related-values","display_options":{"template":"{{email}}"},"note":"For person-portrait assets (founders, COO, member spotlights)"}},
      {"field":"country","type":"string","schema":{"is_nullable":true,"max_length":2},"meta":{"interface":"select-dropdown-m2o","width":"half","display":"related-values","display_options":{"template":"{{name}}"},"note":"Country scope; null = global"}},
      {"field":"file","type":"uuid","schema":{"is_nullable":false},"meta":{"interface":"file","width":"full","required":true,"note":"The actual binary"}},
      {"field":"thumbnail","type":"uuid","schema":{"is_nullable":true},"meta":{"interface":"file-image","width":"full","note":"Optional small-render for index pages"}},
      {"field":"ai_prompt","type":"text","schema":{"is_nullable":true},"meta":{"interface":"input-multiline","width":"full","note":"Per ADR-0025 transparency: when AI-generated, the prompt used. Null = not AI-generated."}},
      {"field":"uploaded_by","type":"uuid","schema":{"is_nullable":true},"meta":{"interface":"select-dropdown-m2o","width":"half","display":"related-values","display_options":{"template":"{{email}}"},"special":["user-created"],"readonly":true}},
      {"field":"approved_by","type":"uuid","schema":{"is_nullable":true},"meta":{"interface":"select-dropdown-m2o","width":"half","display":"related-values","display_options":{"template":"{{email}}"},"note":"Auto-set when status flips to approved (app-enforced)"}},
      {"field":"approved_at","type":"timestamp","schema":{"is_nullable":true},"meta":{"interface":"datetime","width":"half","note":"Auto-set when status flips to approved (app-enforced)"}},
      {"field":"date_created","type":"timestamp","schema":{"default_value":"now()"},"meta":{"interface":"datetime","readonly":true,"hidden":true,"special":["date-created"]}},
      {"field":"date_updated","type":"timestamp","schema":{"is_nullable":true},"meta":{"interface":"datetime","readonly":true,"hidden":true,"special":["date-updated"]}}
    ]
  }'

ensure "relation marketing_assets.event -> events.id" \
  "${DIRECTUS_URL}/relations/marketing_assets/event" \
  "${DIRECTUS_URL}/relations" \
  '{"collection":"marketing_assets","field":"event","related_collection":"events","schema":{"on_delete":"SET NULL"}}'

ensure "relation marketing_assets.sponsor -> companies.id" \
  "${DIRECTUS_URL}/relations/marketing_assets/sponsor" \
  "${DIRECTUS_URL}/relations" \
  '{"collection":"marketing_assets","field":"sponsor","related_collection":"companies","schema":{"on_delete":"SET NULL"}}'

ensure "relation marketing_assets.speaker -> speakers.id" \
  "${DIRECTUS_URL}/relations/marketing_assets/speaker" \
  "${DIRECTUS_URL}/relations" \
  '{"collection":"marketing_assets","field":"speaker","related_collection":"speakers","schema":{"on_delete":"SET NULL"}}'

ensure "relation marketing_assets.subject_user -> directus_users.id" \
  "${DIRECTUS_URL}/relations/marketing_assets/subject_user" \
  "${DIRECTUS_URL}/relations" \
  '{"collection":"marketing_assets","field":"subject_user","related_collection":"directus_users","schema":{"on_delete":"SET NULL"}}'

ensure "relation marketing_assets.country -> countries.code" \
  "${DIRECTUS_URL}/relations/marketing_assets/country" \
  "${DIRECTUS_URL}/relations" \
  '{"collection":"marketing_assets","field":"country","related_collection":"countries","schema":{"on_delete":"SET NULL"}}'

ensure "relation marketing_assets.file -> directus_files.id" \
  "${DIRECTUS_URL}/relations/marketing_assets/file" \
  "${DIRECTUS_URL}/relations" \
  '{"collection":"marketing_assets","field":"file","related_collection":"directus_files","schema":{"on_delete":"RESTRICT"}}'

ensure "relation marketing_assets.thumbnail -> directus_files.id" \
  "${DIRECTUS_URL}/relations/marketing_assets/thumbnail" \
  "${DIRECTUS_URL}/relations" \
  '{"collection":"marketing_assets","field":"thumbnail","related_collection":"directus_files","schema":{"on_delete":"SET NULL"}}'

ensure "relation marketing_assets.uploaded_by -> directus_users.id" \
  "${DIRECTUS_URL}/relations/marketing_assets/uploaded_by" \
  "${DIRECTUS_URL}/relations" \
  '{"collection":"marketing_assets","field":"uploaded_by","related_collection":"directus_users","schema":{"on_delete":"SET NULL"}}'

ensure "relation marketing_assets.approved_by -> directus_users.id" \
  "${DIRECTUS_URL}/relations/marketing_assets/approved_by" \
  "${DIRECTUS_URL}/relations" \
  '{"collection":"marketing_assets","field":"approved_by","related_collection":"directus_users","schema":{"on_delete":"SET NULL"}}'

# ════════════════════════════════════════════════════════════════════════
# F-S2.2-pre — RBAC role policies (per ADR-0021 §4.1, Accepted 2026-05-21)
# ════════════════════════════════════════════════════════════════════════
#
# Seeds the seven named policy containers from ADR-0021 §4.1. Each is an
# empty container today — per-collection permission rows (the "Effect"
# column in §4.1) land with F-S2.2 RBAC sync service.
#
# super_admin uses the Directus built-in Admin policy — no row to create.
#
# Per-country variants (organizer.uz / country_lead.kz / etc.) are NOT
# seeded here. F-S2.2 either templates them at sync time or attaches the
# base policy + a per-user country filter via $CURRENT_USER claims.
# Bootstrap stays single-source-of-truth at the role-template level.
#
# Deterministic UUIDs (`400e0021-...`) so re-runs are idempotent.

POLICY_RBAC_MEMBER="400e0021-0000-4000-8000-000000000001"
POLICY_RBAC_SPEAKER="400e0021-0000-4000-8000-000000000002"
POLICY_RBAC_SPONSOR_REP="400e0021-0000-4000-8000-000000000003"
POLICY_RBAC_ORGANIZER="400e0021-0000-4000-8000-000000000004"
POLICY_RBAC_COUNTRY_LEAD="400e0021-0000-4000-8000-000000000005"
POLICY_RBAC_SVC_BOT="400e0021-0000-4000-8000-000000000006"
POLICY_RBAC_SVC_WORKER="400e0021-0000-4000-8000-000000000007"

echo "[ADR-0021 — RBAC role policies]"

ensure "policy.member" \
  "${DIRECTUS_URL}/policies/${POLICY_RBAC_MEMBER}" \
  "${DIRECTUS_URL}/policies" \
  "$(jq -nc --arg id "$POLICY_RBAC_MEMBER" '{
    id:$id,
    name:"policy.member",
    icon:"badge",
    description:"ADR-0021 §4.1: read public collections; CRUD on own directus_users row; create registrations + feedback_responses keyed to self. Per-collection permission rows land with F-S2.2 sync.",
    admin_access:false,
    app_access:true,
    enforce_tfa:false
  }')"

ensure "policy.speaker" \
  "${DIRECTUS_URL}/policies/${POLICY_RBAC_SPEAKER}" \
  "${DIRECTUS_URL}/policies" \
  "$(jq -nc --arg id "$POLICY_RBAC_SPEAKER" '{
    id:$id,
    name:"policy.speaker",
    icon:"campaign",
    description:"ADR-0021 §4.1: + update own speakers row, read own event_speakers rows. Additive on top of policy.member.",
    admin_access:false,
    app_access:true,
    enforce_tfa:false
  }')"

ensure "policy.sponsor_rep" \
  "${DIRECTUS_URL}/policies/${POLICY_RBAC_SPONSOR_REP}" \
  "${DIRECTUS_URL}/policies" \
  "$(jq -nc --arg id "$POLICY_RBAC_SPONSOR_REP" '{
    id:$id,
    name:"policy.sponsor_rep",
    icon:"verified",
    description:"ADR-0021 §4.1: read own org events + opt-in leads only, scoped via partner_audiences entitlement (per ADR-0033 sponsor PII boundary). Per-row filter $CURRENT_USER.companies linking via companies.rep_user — wired by F-S2.2 sync.",
    admin_access:false,
    app_access:true,
    enforce_tfa:false
  }')"

ensure "policy.organizer" \
  "${DIRECTUS_URL}/policies/${POLICY_RBAC_ORGANIZER}" \
  "${DIRECTUS_URL}/policies" \
  "$(jq -nc --arg id "$POLICY_RBAC_ORGANIZER" '{
    id:$id,
    name:"policy.organizer",
    icon:"engineering",
    description:"ADR-0021 §4.1: CRUD events, registrations, event_speakers in country. Country scope applied at sync time via $CURRENT_USER.country_codes (Authentik group claim) — F-S2.2 wires this.",
    admin_access:false,
    app_access:true,
    enforce_tfa:false
  }')"

ensure "policy.country_lead" \
  "${DIRECTUS_URL}/policies/${POLICY_RBAC_COUNTRY_LEAD}" \
  "${DIRECTUS_URL}/policies" \
  "$(jq -nc --arg id "$POLICY_RBAC_COUNTRY_LEAD" '{
    id:$id,
    name:"policy.country_lead",
    icon:"shield_person",
    description:"ADR-0021 §4.1: organizer permissions + roster management + sponsor pipeline + see PII (per consent). Country scope per Authentik group claim — wired by F-S2.2 sync.",
    admin_access:false,
    app_access:true,
    enforce_tfa:false
  }')"

ensure "policy.svc_bot" \
  "${DIRECTUS_URL}/policies/${POLICY_RBAC_SVC_BOT}" \
  "${DIRECTUS_URL}/policies" \
  "$(jq -nc --arg id "$POLICY_RBAC_SVC_BOT" '{
    id:$id,
    name:"policy.svc_bot",
    icon:"smart_toy",
    description:"ADR-0021 §4.1 + §8: machine principal (Telegram bot). Read all events, write registrations.checked_in_at, read point_awards. No PII except telegram_user_id. JWT carries aud:aiqadam-internal so the web AuthGuard rejects these tokens.",
    admin_access:false,
    app_access:true,
    enforce_tfa:false
  }')"

ensure "policy.svc_worker" \
  "${DIRECTUS_URL}/policies/${POLICY_RBAC_SVC_WORKER}" \
  "${DIRECTUS_URL}/policies" \
  "$(jq -nc --arg id "$POLICY_RBAC_SVC_WORKER" '{
    id:$id,
    name:"policy.svc_worker",
    icon:"settings_suggest",
    description:"ADR-0021 §4.1 + §8: machine principal (BullMQ workers). CRUD interactions, deliveries, responses. No registration writes. JWT carries aud:aiqadam-internal.",
    admin_access:false,
    app_access:true,
    enforce_tfa:false
  }')"

# ════════════════════════════════════════════════════════════════════════
# F-S1.6 — Lead capture + nurture
# ════════════════════════════════════════════════════════════════════════
#
# Members enter the funnel two ways: registering for an event (existing)
# or giving "tell me about events in {city}" via POST /v1/leads (new).
# All fields append-only on directus_users; existing rows default safely
# (state='member' since they got in via Authentik signup).

echo "[F-S1.6 — directus_users.state]"
ensure "field directus_users.state" \
  "${DIRECTUS_URL}/fields/directus_users/state" \
  "${DIRECTUS_URL}/fields/directus_users" \
  '{
    "field":"state",
    "type":"string",
    "schema":{"is_nullable":false,"default_value":"member","max_length":20},
    "meta":{
      "interface":"select-dropdown",
      "width":"half",
      "options":{"choices":[
        {"text":"Lead (no Authentik account yet)","value":"lead"},
        {"text":"Member (Authentik signed up)","value":"member"},
        {"text":"Active (attended >=1 event)","value":"active"},
        {"text":"Inactive (no events in 90d)","value":"inactive"},
        {"text":"Churned (no events in 365d)","value":"churned"}
      ]},
      "note":"Lead capture (F-S1.6) inserts state=lead. Authentik signup upgrades lead->member. Active/inactive/churned derived later by cron."
    }
  }'

echo "[F-S1.6 — directus_users.email_verified]"
ensure "field directus_users.email_verified" \
  "${DIRECTUS_URL}/fields/directus_users/email_verified" \
  "${DIRECTUS_URL}/fields/directus_users" \
  '{
    "field":"email_verified",
    "type":"boolean",
    "schema":{"is_nullable":false,"default_value":false},
    "meta":{
      "interface":"boolean",
      "special":["cast-boolean"],
      "width":"half",
      "note":"Leads start false; verified by HMAC link click. Authentik-signup users auto-verified. Gates T+3/T+7 nurture sends."
    }
  }'

echo "[F-S1.6 — directus_users.email_verified_at]"
ensure "field directus_users.email_verified_at" \
  "${DIRECTUS_URL}/fields/directus_users/email_verified_at" \
  "${DIRECTUS_URL}/fields/directus_users" \
  '{
    "field":"email_verified_at",
    "type":"timestamp",
    "schema":{"is_nullable":true},
    "meta":{"interface":"datetime","width":"half","readonly":true}
  }'

echo "[F-S1.6 — directus_users.city]"
ensure "field directus_users.city" \
  "${DIRECTUS_URL}/fields/directus_users/city" \
  "${DIRECTUS_URL}/fields/directus_users" \
  '{
    "field":"city",
    "type":"string",
    "schema":{"is_nullable":true,"max_length":80},
    "meta":{"interface":"input","width":"half","note":"Self-reported. Datalist on lead form covers UZ/KZ/TJ majors; free text otherwise."}
  }'

echo "[F-S1.6 — directus_users.interest_topics]"
ensure "field directus_users.interest_topics" \
  "${DIRECTUS_URL}/fields/directus_users/interest_topics" \
  "${DIRECTUS_URL}/fields/directus_users" \
  '{
    "field":"interest_topics",
    "type":"json",
    "schema":{"is_nullable":true},
    "meta":{
      "interface":"tags",
      "special":["cast-json"],
      "width":"full",
      "options":{"presets":["AI/ML","LLMs","fintech","robotics","devtools","infra","data","computer-vision","nlp","mlops","hands-on-builder"]},
      "note":"Captured at lead form OR /me/profile edit. Feeds cohort builder + T+7 event personalisation."
    }
  }'

echo "[F-S1.6 — directus_users.source_url]"
ensure "field directus_users.source_url" \
  "${DIRECTUS_URL}/fields/directus_users/source_url" \
  "${DIRECTUS_URL}/fields/directus_users" \
  '{
    "field":"source_url",
    "type":"string",
    "schema":{"is_nullable":true,"max_length":500},
    "meta":{"interface":"input","width":"full","note":"First-touch landing URL where the lead form was submitted. Audit trail."}
  }'

echo "[F-S1.6 — directus_users.acquisition_source]"
ensure "field directus_users.acquisition_source" \
  "${DIRECTUS_URL}/fields/directus_users/acquisition_source" \
  "${DIRECTUS_URL}/fields/directus_users" \
  '{
    "field":"acquisition_source",
    "type":"json",
    "schema":{"is_nullable":true},
    "meta":{
      "interface":"input-code",
      "options":{"language":"json"},
      "special":["cast-json"],
      "width":"full",
      "note":"UTM first-touch + last-touch (F-S3.9 referral codes compatible). Shape: { first_touch: { utm_source, utm_medium, utm_campaign, ts }, last_touch: {...} }"
    }
  }'

# ──────────── F-S2.7 — operator_invites ─────────────────────────────────
#
# Invite-link onboarding per ADR-0035. One row per invite. Plaintext
# token shown ONCE at creation; only SHA256 hash + 8-char prefix
# persist. Single-use, 7-day default expiry, revocable. Consumption
# stamps consumed_at + AUP version. See docs/adr/0035-admin-cabinet-
# and-invite-link-onboarding.md §3 for the security posture.

echo "[F-S2.7 — operator_invites]"
ensure "collection operator_invites" \
  "${DIRECTUS_URL}/collections/operator_invites" \
  "${DIRECTUS_URL}/collections" \
  '{
    "collection":"operator_invites",
    "schema":{"name":"operator_invites"},
    "meta":{
      "icon":"mail",
      "note":"Invite-link onboarding per ADR-0035. token_hash = SHA256(plaintext). Status machine: pending -> consumed | revoked | expired.",
      "sort_field":"created_at",
      "archive_field":"status",
      "archive_value":"consumed",
      "unarchive_value":"pending"
    },
    "fields":[
      {"field":"id","type":"uuid","schema":{"is_primary_key":true,"default_value":"gen_random_uuid()","is_nullable":false},"meta":{"interface":"input","readonly":true,"hidden":true,"special":["uuid"]}},
      {"field":"email","type":"string","schema":{"is_nullable":false,"max_length":254},"meta":{"interface":"input","width":"half","required":true,"note":"Invitee email. Convention first.last@aiqadam.org for staff."}},
      {"field":"display_name","type":"string","schema":{"is_nullable":true,"max_length":120},"meta":{"interface":"input","width":"half"}},
      {"field":"role_groups","type":"json","schema":{"is_nullable":false,"default_value":"[]"},"meta":{"interface":"tags","special":["cast-json"],"width":"full","required":true,"note":"Authentik group slugs to assign on consume (e.g. aiqadam-staff, country_lead_kz)."}},
      {"field":"country","type":"string","schema":{"is_nullable":true,"max_length":4},"meta":{"interface":"select-dropdown","width":"half","options":{"choices":[{"text":"Uzbekistan","value":"uz"},{"text":"Kazakhstan","value":"kz"},{"text":"Tajikistan","value":"tj"},{"text":"Demo / cross-country","value":"xx"}]},"note":"Required for country-lead roles when ENABLE_COUNTRY_LEAD_INVITES=true."}},
      {"field":"token_hash","type":"string","schema":{"is_nullable":false,"max_length":64},"meta":{"interface":"input","readonly":true,"width":"full","note":"SHA256 hex of plaintext token. Plaintext is shown ONCE at creation, never stored."}},
      {"field":"token_prefix","type":"string","schema":{"is_nullable":false,"max_length":8},"meta":{"interface":"input","readonly":true,"width":"half","note":"First 8 chars of plaintext token for support lookup."}},
      {"field":"status","type":"string","schema":{"is_nullable":false,"default_value":"pending","max_length":20},"meta":{
        "interface":"select-dropdown",
        "width":"half",
        "options":{"choices":[
          {"text":"Pending","value":"pending"},
          {"text":"Consumed","value":"consumed"},
          {"text":"Revoked","value":"revoked"},
          {"text":"Expired","value":"expired"}
        ]},
        "display":"labels",
        "display_options":{"choices":[
          {"text":"Pending","value":"pending","foreground":"#ffffff","background":"#3b82f6"},
          {"text":"Consumed","value":"consumed","foreground":"#ffffff","background":"#10b981"},
          {"text":"Revoked","value":"revoked","foreground":"#ffffff","background":"#6b7280"},
          {"text":"Expired","value":"expired","foreground":"#ffffff","background":"#f59e0b"}
        ]}
      }},
      {"field":"created_at","type":"timestamp","schema":{"is_nullable":false,"default_value":"now()"},"meta":{"interface":"datetime","readonly":true,"width":"half"}},
      {"field":"created_by","type":"uuid","schema":{"is_nullable":true},"meta":{"interface":"select-dropdown-m2o","width":"half","display":"related-values","display_options":{"template":"{{email}}"},"note":"Super-admin who minted the invite."}},
      {"field":"expires_at","type":"timestamp","schema":{"is_nullable":false},"meta":{"interface":"datetime","width":"half","note":"Default created_at + 7 days; enforced server-side at /api/onboard/accept."}},
      {"field":"consumed_at","type":"timestamp","schema":{"is_nullable":true},"meta":{"interface":"datetime","width":"half","readonly":true}},
      {"field":"revoked_at","type":"timestamp","schema":{"is_nullable":true},"meta":{"interface":"datetime","width":"half","readonly":true}},
      {"field":"revoked_by","type":"uuid","schema":{"is_nullable":true},"meta":{"interface":"select-dropdown-m2o","width":"half","display":"related-values","display_options":{"template":"{{email}}"}}},
      {"field":"target_user","type":"uuid","schema":{"is_nullable":true},"meta":{"interface":"select-dropdown-m2o","width":"half","display":"related-values","display_options":{"template":"{{email}}"},"note":"directus_users row created when invite was minted; populated immediately so the placeholder exists before consume."}},
      {"field":"authentik_user_id","type":"integer","schema":{"is_nullable":true},"meta":{"interface":"input","width":"half","note":"Authentik internal user pk (returned by POST /api/v3/core/users/)."}},
      {"field":"aup_accepted_at","type":"timestamp","schema":{"is_nullable":true},"meta":{"interface":"datetime","width":"half","readonly":true}},
      {"field":"aup_version","type":"string","schema":{"is_nullable":true,"max_length":60},"meta":{"interface":"input","width":"half","readonly":true,"note":"Version string of the AUP text accepted (e.g. v0.1-placeholder-2026-05-22)."}},
      {"field":"delivery_channel","type":"string","schema":{"is_nullable":true,"max_length":20},"meta":{
        "interface":"select-dropdown",
        "width":"half",
        "options":{"choices":[
          {"text":"Email","value":"email"},
          {"text":"Telegram","value":"telegram"},
          {"text":"Copy-paste (admin handles)","value":"copy_paste"}
        ]},
        "note":"Channel admin chose at creation. copy_paste = admin returns link to invitee out-of-band."
      }},
      {"field":"notes","type":"text","schema":{"is_nullable":true},"meta":{"interface":"input-multiline","width":"full","note":"Free-text admin note, e.g. role expectations or context. Not shown to invitee."}}
    ]
  }'

ensure "relation operator_invites.created_by -> directus_users.id" \
  "${DIRECTUS_URL}/relations/operator_invites/created_by" \
  "${DIRECTUS_URL}/relations" \
  '{"collection":"operator_invites","field":"created_by","related_collection":"directus_users","schema":{"on_delete":"SET NULL"}}'

ensure "relation operator_invites.revoked_by -> directus_users.id" \
  "${DIRECTUS_URL}/relations/operator_invites/revoked_by" \
  "${DIRECTUS_URL}/relations" \
  '{"collection":"operator_invites","field":"revoked_by","related_collection":"directus_users","schema":{"on_delete":"SET NULL"}}'

ensure "relation operator_invites.target_user -> directus_users.id" \
  "${DIRECTUS_URL}/relations/operator_invites/target_user" \
  "${DIRECTUS_URL}/relations" \
  '{"collection":"operator_invites","field":"target_user","related_collection":"directus_users","schema":{"on_delete":"SET NULL"}}'

# ════════════════════════════════════════════════════════════════════════
# F-S3.9 — Referral codes + attribution (per marketing playbook §16.3)
# ════════════════════════════════════════════════════════════════════════
#
# Every member can issue a short code. Visitors landing via ?ref=CODE
# resolve the code to owner_user via POST /v1/referrals/redeem; the
# resolved owner_user is stamped onto registrations.referred_by at
# registration time. UTM first-touch + last-touch are persisted on
# registrations.acquisition_source alongside referred_by. K-factor +
# top-referrer analytics read both fields (Sprint 2.6).

echo "[referral_codes]"
ensure "collection referral_codes" \
  "${DIRECTUS_URL}/collections/referral_codes" \
  "${DIRECTUS_URL}/collections" \
  '{
    "collection":"referral_codes",
    "schema":{"name":"referral_codes"},
    "meta":{
      "icon":"share",
      "note":"Member-issued referral codes. owner_user mints + receives credit on registrations.referred_by.",
      "sort_field":"date_created"
    },
    "fields":[
      {"field":"id","type":"uuid","schema":{"is_primary_key":true,"default_value":"gen_random_uuid()","is_nullable":false},"meta":{"interface":"input","readonly":true,"hidden":true,"special":["uuid"]}},
      {"field":"code","type":"string","schema":{"is_nullable":false,"is_unique":true,"max_length":24},"meta":{"interface":"input","width":"half","required":true,"note":"Short, lowercase, hyphen-safe; used as ?ref=<code> URL parameter"}},
      {"field":"owner_user","type":"uuid","schema":{"is_nullable":false},"meta":{"interface":"select-dropdown-m2o","width":"half","required":true,"display":"related-values","display_options":{"template":"{{email}}"}}},
      {"field":"valid_until","type":"timestamp","schema":{"is_nullable":true},"meta":{"interface":"datetime","width":"half","note":"Optional expiry. Null = perpetual."}},
      {"field":"date_created","type":"timestamp","schema":{"default_value":"now()"},"meta":{"interface":"datetime","readonly":true,"hidden":true,"special":["date-created"]}},
      {"field":"date_updated","type":"timestamp","schema":{"is_nullable":true},"meta":{"interface":"datetime","readonly":true,"hidden":true,"special":["date-updated"]}}
    ]
  }'

ensure "relation referral_codes.owner_user -> directus_users.id" \
  "${DIRECTUS_URL}/relations/referral_codes/owner_user" \
  "${DIRECTUS_URL}/relations" \
  '{"collection":"referral_codes","field":"owner_user","related_collection":"directus_users","schema":{"on_delete":"CASCADE"}}'

echo "[F-S3.9 — registrations.referred_by]"
ensure "field registrations.referred_by" \
  "${DIRECTUS_URL}/fields/registrations/referred_by" \
  "${DIRECTUS_URL}/fields/registrations" \
  '{
    "field":"referred_by",
    "type":"uuid",
    "schema":{"is_nullable":true},
    "meta":{
      "interface":"select-dropdown-m2o",
      "width":"half",
      "display":"related-values",
      "display_options":{"template":"{{email}}"},
      "note":"Resolved owner_user from the referral code the visitor arrived with. Null = no referral."
    }
  }'

ensure "relation registrations.referred_by -> directus_users.id" \
  "${DIRECTUS_URL}/relations/registrations/referred_by" \
  "${DIRECTUS_URL}/relations" \
  '{"collection":"registrations","field":"referred_by","related_collection":"directus_users","schema":{"on_delete":"SET NULL"}}'

echo "[F-S3.9 — registrations.acquisition_source]"
ensure "field registrations.acquisition_source" \
  "${DIRECTUS_URL}/fields/registrations/acquisition_source" \
  "${DIRECTUS_URL}/fields/registrations" \
  '{
    "field":"acquisition_source",
    "type":"json",
    "schema":{"is_nullable":true},
    "meta":{
      "interface":"input-code",
      "options":{"language":"json"},
      "special":["cast-json"],
      "width":"full",
      "note":"UTM first-touch + last-touch per playbook §16.3. Shape: { first_touch: {utm_source, utm_medium, utm_campaign, ts}, last_touch: {...} }"
    }
  }'

# ════════════════════════════════════════════════════════════════════════
# F-S1.1a — Event lifecycle automation: publication-broadcast tracker
# ════════════════════════════════════════════════════════════════════════
#
# Idempotency ledger for state-driven dispatches on events. One row per
# (event, kind). Today `kind='published'` is the only writer (operator
# flips events.status=draft→published in /workspace/events → API fires
# the event_announce dispatch). Future kinds: 'speaker_added' (F-S1.1b),
# 'post_event_followup' (F-S1.1c).
#
# Read-side: the workspace cabinet shows the dispatch state (sent /
# pending / failed) per event so an operator knows whether the cohort
# was notified without grepping logs.

echo "[event_announcements]"
ensure "collection event_announcements" \
  "${DIRECTUS_URL}/collections/event_announcements" \
  "${DIRECTUS_URL}/collections" \
  '{
    "collection":"event_announcements",
    "schema":{"name":"event_announcements"},
    "meta":{
      "icon":"campaign",
      "note":"State-driven dispatch ledger for event lifecycle (F-S1.1a/b/c). One row per (event, kind) — uniqueness enforced in the service.",
      "sort_field":"sent_at"
    },
    "fields":[
      {"field":"id","type":"uuid","schema":{"is_primary_key":true,"default_value":"gen_random_uuid()","is_nullable":false},"meta":{"interface":"input","readonly":true,"hidden":true,"special":["uuid"]}},
      {"field":"event","type":"uuid","schema":{"is_nullable":false},"meta":{"interface":"select-dropdown-m2o","width":"half","required":true,"display":"related-values","display_options":{"template":"{{title}}"}}},
      {"field":"kind","type":"string","schema":{"is_nullable":false,"max_length":40},"meta":{
        "interface":"select-dropdown",
        "width":"half",
        "required":true,
        "options":{"choices":[
          {"text":"Published (event_announce)","value":"published"},
          {"text":"Speaker added","value":"speaker_added"},
          {"text":"Post-event followup","value":"post_event_followup"},
          {"text":"Reminder T-2 days","value":"reminder_t_minus_2"},
          {"text":"Reminder T-3 hours","value":"reminder_t_minus_3h"},
          {"text":"Member match T-7 days","value":"member_match_t_minus_7"},
          {"text":"Speaker brief T-7 days","value":"reminder_t_minus_7_speaker"}
        ]}
      }},
      {"field":"speaker","type":"uuid","schema":{"is_nullable":true},"meta":{"interface":"select-dropdown-m2o","width":"half","display":"related-values","display_options":{"template":"{{user.email}}"},"note":"F-S1.1b: per-speaker scoping for kind=speaker_added — idempotency is (event, kind, speaker). Null for non-speaker kinds."}},
      {"field":"sent_at","type":"timestamp","schema":{"is_nullable":false,"default_value":"now()"},"meta":{"interface":"datetime","width":"half","readonly":true}},
      {"field":"dispatched_interaction_id","type":"uuid","schema":{"is_nullable":true},"meta":{"interface":"input","width":"half","note":"FK to interactions row (loose; interactions is sometimes archived)"}},
      {"field":"recipient_count","type":"integer","schema":{"is_nullable":false,"default_value":0},"meta":{"interface":"input","width":"half","note":"Audience size at dispatch time (pre-consent filtering)"}},
      {"field":"date_created","type":"timestamp","schema":{"default_value":"now()"},"meta":{"interface":"datetime","readonly":true,"hidden":true,"special":["date-created"]}}
    ]
  }'

# F-S1.1b — relation on the new speaker scoping column
ensure "relation event_announcements.speaker -> speakers.id" \
  "${DIRECTUS_URL}/relations/event_announcements/speaker" \
  "${DIRECTUS_URL}/relations" \
  '{"collection":"event_announcements","field":"speaker","related_collection":"speakers","schema":{"on_delete":"CASCADE"}}'

# F-S1.1c — events.post_event_processed marks the post-event cron as done
ensure "field events.post_event_processed" \
  "${DIRECTUS_URL}/fields/events/post_event_processed" \
  "${DIRECTUS_URL}/fields/events" \
  '{
    "field":"post_event_processed",
    "type":"boolean",
    "schema":{"is_nullable":false,"default_value":false},
    "meta":{
      "interface":"boolean",
      "special":["cast-boolean"],
      "width":"half",
      "note":"F-S1.1c — set TRUE by PostEventCronService after dispatching speaker_thanks + next_event_teaser (+ csat once dispatcher gets template-renderer). Idempotency guard for the cron."
    }
  }'

# ════════════════════════════════════════════════════════════════════════
# F-S1.5b — Member match dispatch ledger (per-(user, event) idempotency)
# ════════════════════════════════════════════════════════════════════════
#
# F-S1.5 (T-7) only writes one row per event in event_announcements; it
# can't tell after the fact which users were in the audience. F-S1.5b's
# T+3 trigger is per-registration, so it needs per-(user, event) dedup.
#
# Both services write to this collection. Lookup is "any row for (user, event)"
# regardless of kind — T+3 and T-7 are mutually exclusive per recipient
# (whichever fires first wins).
#
# kind enum:
#   member_match_t_minus_7      — T-7 broadcast (F-S1.5)
#   member_match_t_plus_3       — T+3 per-registration (F-S1.5b)

echo "[F-S1.5b — member_match_dispatches]"
ensure "collection member_match_dispatches" \
  "${DIRECTUS_URL}/collections/member_match_dispatches" \
  "${DIRECTUS_URL}/collections" \
  '{
    "collection":"member_match_dispatches",
    "schema":{"name":"member_match_dispatches"},
    "meta":{
      "icon":"people_alt",
      "note":"F-S1.5 / F-S1.5b per-recipient match ledger. One row per (user, event). Either match cron writes it; both check it before dispatching.",
      "sort_field":"sent_at"
    },
    "fields":[
      {"field":"id","type":"uuid","schema":{"is_primary_key":true,"default_value":"gen_random_uuid()","is_nullable":false},"meta":{"interface":"input","readonly":true,"hidden":true,"special":["uuid"]}},
      {"field":"user","type":"uuid","schema":{"is_nullable":false},"meta":{"interface":"select-dropdown-m2o","width":"half","required":true,"display":"related-values","display_options":{"template":"{{email}}"}}},
      {"field":"event","type":"uuid","schema":{"is_nullable":false},"meta":{"interface":"select-dropdown-m2o","width":"half","required":true,"display":"related-values","display_options":{"template":"{{title}}"}}},
      {"field":"kind","type":"string","schema":{"is_nullable":false,"max_length":40},"meta":{
        "interface":"select-dropdown",
        "width":"half",
        "required":true,
        "options":{"choices":[
          {"text":"T-7 broadcast","value":"member_match_t_minus_7"},
          {"text":"T+3 post-registration","value":"member_match_t_plus_3"}
        ]}
      }},
      {"field":"sent_at","type":"timestamp","schema":{"is_nullable":false,"default_value":"now()"},"meta":{"interface":"datetime","width":"half","readonly":true}},
      {"field":"dispatched_interaction_id","type":"uuid","schema":{"is_nullable":true},"meta":{"interface":"input","width":"full","note":"FK to interactions row (loose)"}},
      {"field":"date_created","type":"timestamp","schema":{"default_value":"now()"},"meta":{"interface":"datetime","readonly":true,"hidden":true,"special":["date-created"]}}
    ]
  }'

ensure "relation member_match_dispatches.user -> directus_users.id" \
  "${DIRECTUS_URL}/relations/member_match_dispatches/user" \
  "${DIRECTUS_URL}/relations" \
  '{"collection":"member_match_dispatches","field":"user","related_collection":"directus_users","schema":{"on_delete":"CASCADE"}}'

ensure "relation member_match_dispatches.event -> events.id" \
  "${DIRECTUS_URL}/relations/member_match_dispatches/event" \
  "${DIRECTUS_URL}/relations" \
  '{"collection":"member_match_dispatches","field":"event","related_collection":"events","schema":{"on_delete":"CASCADE"}}'

# ════════════════════════════════════════════════════════════════════════
# F-S1.1b — event_speakers junction (speakers committed to specific events)
# ════════════════════════════════════════════════════════════════════════
#
# One row per (event, speaker) pair. status walks
#   invited → accepted → confirmed → (declined / cancelled)
# Transition INTO confirmed fires the speaker_added dispatch to registered
# attendees (one announcement per (event, speaker) tracked in
# event_announcements via the new speaker FK).

echo "[event_speakers]"
ensure "collection event_speakers" \
  "${DIRECTUS_URL}/collections/event_speakers" \
  "${DIRECTUS_URL}/collections" \
  '{
    "collection":"event_speakers",
    "schema":{"name":"event_speakers"},
    "meta":{
      "icon":"record_voice_over",
      "note":"M:N junction between events and speakers. Operator-managed via /workspace/events/[id]. status enum: invited|accepted|confirmed|declined|cancelled.",
      "sort_field":"order_index"
    },
    "fields":[
      {"field":"id","type":"uuid","schema":{"is_primary_key":true,"default_value":"gen_random_uuid()","is_nullable":false},"meta":{"interface":"input","readonly":true,"hidden":true,"special":["uuid"]}},
      {"field":"event","type":"uuid","schema":{"is_nullable":false},"meta":{"interface":"select-dropdown-m2o","width":"half","required":true,"display":"related-values","display_options":{"template":"{{title}}"}}},
      {"field":"speaker","type":"uuid","schema":{"is_nullable":false},"meta":{"interface":"select-dropdown-m2o","width":"half","required":true,"display":"related-values","display_options":{"template":"{{user.email}}"}}},
      {"field":"talk_title","type":"string","schema":{"is_nullable":true,"max_length":200},"meta":{"interface":"input","width":"full"}},
      {"field":"talk_topic","type":"text","schema":{"is_nullable":true},"meta":{"interface":"input-multiline","width":"full","note":"1-3 sentence pitch shown in event_announce / speaker_added emails"}},
      {"field":"status","type":"string","schema":{"is_nullable":false,"default_value":"invited","max_length":20},"meta":{
        "interface":"select-dropdown",
        "width":"half",
        "options":{"choices":[
          {"text":"Invited","value":"invited"},
          {"text":"Accepted","value":"accepted"},
          {"text":"Confirmed","value":"confirmed"},
          {"text":"Declined","value":"declined"},
          {"text":"Cancelled","value":"cancelled"}
        ]}
      }},
      {"field":"confirmed_at","type":"timestamp","schema":{"is_nullable":true},"meta":{"interface":"datetime","width":"half","readonly":true,"note":"Set by API on status flip to confirmed"}},
      {"field":"order_index","type":"integer","schema":{"is_nullable":false,"default_value":100},"meta":{"interface":"input","width":"half"}},
      {"field":"date_created","type":"timestamp","schema":{"default_value":"now()"},"meta":{"interface":"datetime","readonly":true,"hidden":true,"special":["date-created"]}},
      {"field":"date_updated","type":"timestamp","schema":{"is_nullable":true},"meta":{"interface":"datetime","readonly":true,"hidden":true,"special":["date-updated"]}}
    ]
  }'

ensure "relation event_speakers.event -> events.id" \
  "${DIRECTUS_URL}/relations/event_speakers/event" \
  "${DIRECTUS_URL}/relations" \
  '{"collection":"event_speakers","field":"event","related_collection":"events","schema":{"on_delete":"CASCADE"}}'

ensure "relation event_speakers.speaker -> speakers.id" \
  "${DIRECTUS_URL}/relations/event_speakers/speaker" \
  "${DIRECTUS_URL}/relations" \
  '{"collection":"event_speakers","field":"speaker","related_collection":"speakers","schema":{"on_delete":"RESTRICT"}}'

ensure "relation event_announcements.event -> events.id" \
  "${DIRECTUS_URL}/relations/event_announcements/event" \
  "${DIRECTUS_URL}/relations" \
  '{"collection":"event_announcements","field":"event","related_collection":"events","schema":{"on_delete":"CASCADE"}}'

# ════════════════════════════════════════════════════════════════════════
# F-S1.6b — Lead nurture dispatch ledger
# ════════════════════════════════════════════════════════════════════════
#
# Idempotency ledger for the T+3 / T+7 lead-nurture cron. One row per
# (lead, kind) — second tick is a no-op once the row exists. Lead
# converting to member (state='member') drops them out of the candidate
# filter at the service level, so we don't need to clean rows up.

echo "[F-S1.6b — lead_nurture_dispatches]"
ensure "collection lead_nurture_dispatches" \
  "${DIRECTUS_URL}/collections/lead_nurture_dispatches" \
  "${DIRECTUS_URL}/collections" \
  '{
    "collection":"lead_nurture_dispatches",
    "schema":{"name":"lead_nurture_dispatches"},
    "meta":{
      "icon":"forward_to_inbox",
      "note":"F-S1.6b dispatch ledger. One row per (lead, kind). Cron filters out leads with an existing row before dispatching.",
      "sort_field":"sent_at"
    },
    "fields":[
      {"field":"id","type":"uuid","schema":{"is_primary_key":true,"default_value":"gen_random_uuid()","is_nullable":false},"meta":{"interface":"input","readonly":true,"hidden":true,"special":["uuid"]}},
      {"field":"lead","type":"uuid","schema":{"is_nullable":false},"meta":{"interface":"select-dropdown-m2o","width":"half","required":true,"display":"related-values","display_options":{"template":"{{email}}"}}},
      {"field":"kind","type":"string","schema":{"is_nullable":false,"max_length":40},"meta":{
        "interface":"select-dropdown",
        "width":"half",
        "required":true,
        "options":{"choices":[
          {"text":"T+3 community value","value":"lead_nurture_value"},
          {"text":"T+7 next event teaser","value":"lead_nurture_next_event"}
        ]}
      }},
      {"field":"sent_at","type":"timestamp","schema":{"is_nullable":false,"default_value":"now()"},"meta":{"interface":"datetime","width":"half","readonly":true}},
      {"field":"dispatched_interaction_id","type":"uuid","schema":{"is_nullable":true},"meta":{"interface":"input","width":"half","note":"FK to interactions row (loose)"}},
      {"field":"event_referenced","type":"uuid","schema":{"is_nullable":true},"meta":{"interface":"select-dropdown-m2o","width":"half","note":"Set only for kind=lead_nurture_next_event — the event the teaser linked to. Audit / re-targeting."}},
      {"field":"date_created","type":"timestamp","schema":{"default_value":"now()"},"meta":{"interface":"datetime","readonly":true,"hidden":true,"special":["date-created"]}}
    ]
  }'

ensure "relation lead_nurture_dispatches.lead -> directus_users.id" \
  "${DIRECTUS_URL}/relations/lead_nurture_dispatches/lead" \
  "${DIRECTUS_URL}/relations" \
  '{"collection":"lead_nurture_dispatches","field":"lead","related_collection":"directus_users","schema":{"on_delete":"CASCADE"}}'

ensure "relation lead_nurture_dispatches.event_referenced -> events.id" \
  "${DIRECTUS_URL}/relations/lead_nurture_dispatches/event_referenced" \
  "${DIRECTUS_URL}/relations" \
  '{"collection":"lead_nurture_dispatches","field":"event_referenced","related_collection":"events","schema":{"on_delete":"SET NULL"}}'

# ════════════════════════════════════════════════════════════════════════
# F-S2.5 — Audit events collection
# ════════════════════════════════════════════════════════════════════════
#
# Cross-feature audit log: every admin / sync / consent / state-change
# event that needs an indelible record beyond Loki retention.
#
# Initial writers (Sprint 2 + 3):
#   - F-S2.7 invite.* events (currently in Loki only; PR F-S2.5-b
#     dual-emits to this collection then deprecates the Loki-only path)
#   - F-S2.2 rbac.sync.{computed,applied,failed,skipped} per-engine
#     diffs (ADR-0021 §7)
#   - F-S2.5-c /me/access-log "who looked at my record" (read-side
#     emissions, added incrementally as each PII consumer lands)
#
# Schema is event-agnostic — payload_json holds the per-event shape.
# Severity follows the audit/security-incident scale: info (routine),
# high (privilege grants, partial sync failures), critical (security
# violation, mass-deletion, broken invariant).
#
# 1-year retention is enforced by a future cron (Sprint 2.5 follow-up);
# this PR ships the collection only.

echo "[F-S2.5 — audit_events]"
ensure "collection audit_events" \
  "${DIRECTUS_URL}/collections/audit_events" \
  "${DIRECTUS_URL}/collections" \
  '{
    "collection":"audit_events",
    "schema":{"name":"audit_events"},
    "meta":{
      "icon":"history",
      "note":"Append-only audit log. event = dot-namespaced action (e.g. invite.created, rbac.sync.applied). Severity drives alerting + retention exceptions.",
      "sort_field":"ts",
      "archive_field":null
    },
    "fields":[
      {"field":"id","type":"uuid","schema":{"is_primary_key":true,"default_value":"gen_random_uuid()","is_nullable":false},"meta":{"interface":"input","readonly":true,"hidden":true,"special":["uuid"]}},
      {"field":"event","type":"string","schema":{"is_nullable":false,"max_length":120},"meta":{"interface":"input","width":"half","required":true,"note":"Dot-namespaced action, e.g. invite.created · rbac.sync.applied · access.read"}},
      {"field":"severity","type":"string","schema":{"is_nullable":false,"default_value":"info","max_length":12},"meta":{
        "interface":"select-dropdown",
        "width":"half",
        "options":{"choices":[
          {"text":"Info","value":"info"},
          {"text":"High","value":"high"},
          {"text":"Critical","value":"critical"}
        ]},
        "display":"labels",
        "display_options":{"choices":[
          {"text":"Info","value":"info","foreground":"#ffffff","background":"#6b7280"},
          {"text":"High","value":"high","foreground":"#ffffff","background":"#f59e0b"},
          {"text":"Critical","value":"critical","foreground":"#ffffff","background":"#dc2626"}
        ]}
      }},
      {"field":"actor_id","type":"uuid","schema":{"is_nullable":true},"meta":{"interface":"select-dropdown-m2o","width":"half","display":"related-values","display_options":{"template":"{{email}}"},"note":"Null for system / cron / unauthenticated events."}},
      {"field":"target_kind","type":"string","schema":{"is_nullable":true,"max_length":40},"meta":{"interface":"input","width":"half","note":"e.g. invite · member · event · rbac_job · directus_policy"}},
      {"field":"target_id","type":"string","schema":{"is_nullable":true,"max_length":120},"meta":{"interface":"input","width":"half","note":"UUID or external id. String, not FK, so audit survives target deletion."}},
      {"field":"country","type":"string","schema":{"is_nullable":true,"max_length":4},"meta":{"interface":"select-dropdown","width":"half","options":{"choices":[{"text":"uz","value":"uz"},{"text":"kz","value":"kz"},{"text":"tj","value":"tj"},{"text":"xx","value":"xx"}]},"note":"Tenant scope of the event when applicable."}},
      {"field":"payload_json","type":"json","schema":{"is_nullable":true},"meta":{"interface":"input-code","options":{"language":"json"},"special":["cast-json"],"width":"full","note":"Event-specific shape. Keep small; full payload belongs in Loki."}},
      {"field":"ts","type":"timestamp","schema":{"is_nullable":false,"default_value":"now()"},"meta":{"interface":"datetime","readonly":true,"width":"half"}}
    ]
  }'

ensure "relation audit_events.actor_id -> directus_users.id" \
  "${DIRECTUS_URL}/relations/audit_events/actor_id" \
  "${DIRECTUS_URL}/relations" \
  '{"collection":"audit_events","field":"actor_id","related_collection":"directus_users","schema":{"on_delete":"SET NULL"}}'

# ════════════════════════════════════════════════════════════════════════
# F-S2.2-a — RBAC sync jobs (ADR-0021 §7 state machine)
# ════════════════════════════════════════════════════════════════════════
#
# One row per sync attempt. Authentik webhook (F-S2.2-b) enqueues a row
# in pending state; BullMQ worker (F-S2.2-c) drives per-engine state
# (Directus + Plausible — Twenty was dropped per ADR-0033). Workspace UI
# (F-S2.2-g) surfaces rows with any *_status='failed' for operator retry.
#
# Status semantics per engine (ADR-0021 §7):
#   pending  — work scheduled, not yet attempted
#   applied  — engine acknowledges desired state
#   failed   — engine returned 4xx/5xx or timed out 3 times
#   skipped  — manifest does not require this engine for this user
#   dry_run  — RBAC_SYNC_WRITE_ENABLED=false, diff computed but not written

echo "[F-S2.2-a — rbac_sync_jobs]"
ensure "collection rbac_sync_jobs" \
  "${DIRECTUS_URL}/collections/rbac_sync_jobs" \
  "${DIRECTUS_URL}/collections" \
  '{
    "collection":"rbac_sync_jobs",
    "schema":{"name":"rbac_sync_jobs"},
    "meta":{
      "icon":"sync",
      "note":"Per ADR-0021 §7. One row per sync attempt. Failed rows surface as a banner in the workspace dashboard with a retry button.",
      "sort_field":"started_at"
    },
    "fields":[
      {"field":"id","type":"uuid","schema":{"is_primary_key":true,"default_value":"gen_random_uuid()","is_nullable":false},"meta":{"interface":"input","readonly":true,"hidden":true,"special":["uuid"]}},
      {"field":"user","type":"uuid","schema":{"is_nullable":false},"meta":{"interface":"select-dropdown-m2o","width":"half","required":true,"display":"related-values","display_options":{"template":"{{email}}"}}},
      {"field":"triggered_by","type":"string","schema":{"is_nullable":false,"max_length":40},"meta":{
        "interface":"select-dropdown",
        "width":"half",
        "required":true,
        "options":{"choices":[
          {"text":"Webhook","value":"webhook"},
          {"text":"Nightly poll","value":"poll"},
          {"text":"Manual retry","value":"manual_retry"},
          {"text":"Activate country","value":"activate_country"}
        ]}
      }},
      {"field":"expected_state","type":"json","schema":{"is_nullable":false,"default_value":"{}"},"meta":{"interface":"input-code","options":{"language":"json"},"special":["cast-json"],"width":"full","note":"{ directus: {...}, plausible: {...} } derived from Authentik group membership."}},
      {"field":"directus_status","type":"string","schema":{"is_nullable":false,"default_value":"pending","max_length":20},"meta":{
        "interface":"select-dropdown",
        "width":"half",
        "options":{"choices":[
          {"text":"Pending","value":"pending"},
          {"text":"Applied","value":"applied"},
          {"text":"Failed","value":"failed"},
          {"text":"Skipped","value":"skipped"},
          {"text":"Dry-run","value":"dry_run"}
        ]},
        "display":"labels",
        "display_options":{"choices":[
          {"text":"Pending","value":"pending","foreground":"#ffffff","background":"#3b82f6"},
          {"text":"Applied","value":"applied","foreground":"#ffffff","background":"#10b981"},
          {"text":"Failed","value":"failed","foreground":"#ffffff","background":"#dc2626"},
          {"text":"Skipped","value":"skipped","foreground":"#ffffff","background":"#6b7280"},
          {"text":"Dry-run","value":"dry_run","foreground":"#ffffff","background":"#a78bfa"}
        ]}
      }},
      {"field":"directus_error","type":"text","schema":{"is_nullable":true},"meta":{"interface":"input-multiline","width":"full"}},
      {"field":"plausible_status","type":"string","schema":{"is_nullable":false,"default_value":"pending","max_length":20},"meta":{
        "interface":"select-dropdown",
        "width":"half",
        "options":{"choices":[
          {"text":"Pending","value":"pending"},
          {"text":"Applied","value":"applied"},
          {"text":"Failed","value":"failed"},
          {"text":"Skipped","value":"skipped"},
          {"text":"Dry-run","value":"dry_run"}
        ]},
        "display":"labels",
        "display_options":{"choices":[
          {"text":"Pending","value":"pending","foreground":"#ffffff","background":"#3b82f6"},
          {"text":"Applied","value":"applied","foreground":"#ffffff","background":"#10b981"},
          {"text":"Failed","value":"failed","foreground":"#ffffff","background":"#dc2626"},
          {"text":"Skipped","value":"skipped","foreground":"#ffffff","background":"#6b7280"},
          {"text":"Dry-run","value":"dry_run","foreground":"#ffffff","background":"#a78bfa"}
        ]}
      }},
      {"field":"plausible_error","type":"text","schema":{"is_nullable":true},"meta":{"interface":"input-multiline","width":"full"}},
      {"field":"attempt","type":"integer","schema":{"is_nullable":false,"default_value":1},"meta":{"interface":"input","width":"half","note":"1..3 — third failure flips status to failed; operator retry enqueues a fresh job."}},
      {"field":"started_at","type":"timestamp","schema":{"is_nullable":false,"default_value":"now()"},"meta":{"interface":"datetime","width":"half","readonly":true}},
      {"field":"finished_at","type":"timestamp","schema":{"is_nullable":true},"meta":{"interface":"datetime","width":"half","readonly":true}}
    ]
  }'

ensure "relation rbac_sync_jobs.user -> directus_users.id" \
  "${DIRECTUS_URL}/relations/rbac_sync_jobs/user" \
  "${DIRECTUS_URL}/relations" \
  '{"collection":"rbac_sync_jobs","field":"user","related_collection":"directus_users","schema":{"on_delete":"CASCADE"}}'

# ════════════════════════════════════════════════════════════════════════
# F-S3.10-a — events page enrichment fields
# ════════════════════════════════════════════════════════════════════════
#
# Adds the fields the UX spec (§9.7 create-event form, §16.1 event
# descriptions) already calls for but that weren't on the original
# Sprint 0.1 events schema. Field-by-field appends — collection
# exists, so we cannot recreate it; each field is added independently
# via the /fields/<collection> endpoint.
#
# Pattern fix from F-S1.2: when the collection already exists, ensure()
# of a `collection` payload won't apply new fields. Each field needs
# its own ensure() call.

echo "[F-S3.10-a — events.short_description]"
ensure "field events.short_description" \
  "${DIRECTUS_URL}/fields/events/short_description" \
  "${DIRECTUS_URL}/fields/events" \
  '{
    "field":"short_description",
    "type":"string",
    "schema":{"is_nullable":true,"max_length":300},
    "meta":{"interface":"input","width":"full","note":"≤300 char — used in event cards + OG/social cards + email previews."}
  }'

echo "[F-S3.10-a — events.slug]"
ensure "field events.slug" \
  "${DIRECTUS_URL}/fields/events/slug" \
  "${DIRECTUS_URL}/fields/events" \
  '{
    "field":"slug",
    "type":"string",
    "schema":{"is_nullable":true,"max_length":120,"is_unique":true},
    "meta":{"interface":"input","width":"half","note":"URL-friendly title (auto-suggested from title; editable). Public URL future-rewrites /events/<id> → /events/<slug>."}
  }'

echo "[F-S3.10-a — events.venue]"
ensure "field events.venue" \
  "${DIRECTUS_URL}/fields/events/venue" \
  "${DIRECTUS_URL}/fields/events" \
  '{
    "field":"venue",
    "type":"string",
    "schema":{"is_nullable":true,"max_length":160},
    "meta":{"interface":"input","width":"half","note":"Venue name (e.g. \"IT Park Tashkent\"). Split from address per UX §9.7."}
  }'

echo "[F-S3.10-a — events.address]"
ensure "field events.address" \
  "${DIRECTUS_URL}/fields/events/address" \
  "${DIRECTUS_URL}/fields/events" \
  '{
    "field":"address",
    "type":"string",
    "schema":{"is_nullable":true,"max_length":255},
    "meta":{"interface":"input","width":"half","note":"Street address. Combined with venue for the public event page + email templates. Existing `location` field stays as the legacy single-string field; operators dual-write during transition."}
  }'

echo "[F-S3.10-a — events.map_url]"
ensure "field events.map_url" \
  "${DIRECTUS_URL}/fields/events/map_url" \
  "${DIRECTUS_URL}/fields/events" \
  '{
    "field":"map_url",
    "type":"string",
    "schema":{"is_nullable":true,"max_length":500},
    "meta":{"interface":"input","width":"full","note":"Optional Google Maps / Yandex Maps link. Click-through from the public event page."}
  }'

echo "[F-S3.10-a — events.hero_image]"
ensure "field events.hero_image" \
  "${DIRECTUS_URL}/fields/events/hero_image" \
  "${DIRECTUS_URL}/fields/events" \
  '{
    "field":"hero_image",
    "type":"uuid",
    "schema":{"is_nullable":true},
    "meta":{"interface":"file-image","width":"full","note":"16:9 minimum 1200×675 per UX §11.6. Feeds OG cards (F-S5.4) + public event page hero."}
  }'

ensure "relation events.hero_image -> directus_files.id" \
  "${DIRECTUS_URL}/relations/events/hero_image" \
  "${DIRECTUS_URL}/relations" \
  '{"collection":"events","field":"hero_image","related_collection":"directus_files","schema":{"on_delete":"SET NULL"}}'

echo "[F-S3.10-a — events.agenda_md]"
ensure "field events.agenda_md" \
  "${DIRECTUS_URL}/fields/events/agenda_md" \
  "${DIRECTUS_URL}/fields/events" \
  '{
    "field":"agenda_md",
    "type":"text",
    "schema":{"is_nullable":true},
    "meta":{"interface":"input-multiline","width":"full","note":"Markdown agenda. Separate from `description` (which is the narrative) — agenda is the structured schedule. Optional."}
  }'

echo "[F-S3.10-a — events.visibility_scope]"
ensure "field events.visibility_scope" \
  "${DIRECTUS_URL}/fields/events/visibility_scope" \
  "${DIRECTUS_URL}/fields/events" \
  '{
    "field":"visibility_scope",
    "type":"string",
    "schema":{"is_nullable":false,"default_value":"public","max_length":20},
    "meta":{
      "interface":"select-dropdown",
      "width":"half",
      "options":{"choices":[
        {"text":"Public","value":"public"},
        {"text":"Members only","value":"members_only"},
        {"text":"Invite only","value":"invite_only"}
      ]},
      "note":"Who can see the public event page. Independent of publication_status — published+invite_only events are accessible only via direct link share."
    }
  }'

echo "[F-S3.10-a — events.event_retrospective]"
ensure "field events.event_retrospective" \
  "${DIRECTUS_URL}/fields/events/event_retrospective" \
  "${DIRECTUS_URL}/fields/events" \
  '{
    "field":"event_retrospective",
    "type":"text",
    "schema":{"is_nullable":true},
    "meta":{"interface":"input-multiline","width":"full","note":"Operator notes captured during post-event close-out (Sprint 1.1c flow). Surfaces in cross-country comparison (Sprint 2.6) as `tags` on top experiments to replicate."}
  }'

echo
echo "✅ Directus schema bootstrapped."
echo "Next: run infrastructure/directus/migrate-from-platform.sh to copy"
echo "the existing platform.events / .registrations / .point_awards rows."
