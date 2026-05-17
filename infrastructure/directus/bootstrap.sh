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

echo
echo "✅ Directus schema bootstrapped."
echo "Next: run infrastructure/directus/migrate-from-platform.sh to copy"
echo "the existing platform.events / .registrations / .point_awards rows."
