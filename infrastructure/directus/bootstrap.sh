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
      {"field":"received_at","type":"timestamp","schema":{"is_nullable":false,"default_value":"now()"},"meta":{"interface":"datetime","width":"half","readonly":true}}
    ]
  }'

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

echo
echo "✅ Directus schema bootstrapped."
echo "Next: run infrastructure/directus/migrate-from-platform.sh to copy"
echo "the existing platform.events / .registrations / .point_awards rows."
