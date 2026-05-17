#!/usr/bin/env bash
# Idempotently bootstrap AI Qadam Directus flows. Run after
# bootstrap.sh has created the collections.
#
# Usage:
#   DIRECTUS_URL=https://cms.aiqadam.org \
#   DIRECTUS_TOKEN=$(cat /tmp/aiqadam-secrets-DIRECTUS_TOKEN) \
#   bash infrastructure/directus/flows-bootstrap.sh
#
# Flows installed:
#   reg-capacity-decision  — action hook on registrations.items.create
#                            runs AFTER insert; counts registered for
#                            the event; if over capacity, PATCHes the
#                            new registration's status to waitlisted.
#                            (Filter-hook payload mutation was attempted
#                            first but Directus 11 doesn't apply exec
#                            return values to filter-event payloads —
#                            see C3.1 PR for proof.)
#
#   reg-waitlist-promotion — action hook on registrations.items.update
#                            when status flips to 'cancelled', finds the
#                            oldest 'waitlisted' for that event and
#                            promotes it to 'registered'. No-op if there
#                            is no waitlist.
#
#   reg-checkin-points     — action hook on registrations.items.update
#                            when status flips to 'attended', creates a
#                            point_awards row (user + event country + 10
#                            points). Dedupes against existing award for
#                            the same (user, event) pair.
#
# Email side-effects (added in C3.5):
#   - reg-capacity-decision  branches on decide_status: reject (within
#                            capacity → user stays registered) → POST
#                            /v1/internal/email with template=registration-
#                            confirmed. Resolve branch (overflow → patched
#                            to waitlisted) sends no email yet — no
#                            waitlist template exists.
#   - reg-waitlist-promotion after `promote`, looks up the promoted user's
#                            email + event details → POST /v1/internal/email
#                            with template=registration-promoted.

set -euo pipefail

: "${DIRECTUS_URL:?DIRECTUS_URL is required}"
: "${DIRECTUS_TOKEN:?DIRECTUS_TOKEN is required}"

H_AUTH="Authorization: Bearer ${DIRECTUS_TOKEN}"
H_JSON="content-type: application/json"

# ──────────── helpers ───────────────────────────────────────────────────

# Deterministic UUIDs so re-runs are idempotent without name lookups.
FLOW_REG_CAPACITY="11111111-c3c1-4001-8001-000000000001"
OP_EVENT_LOOKUP="11111111-c3c1-4001-8001-000000000010"
OP_COUNT_REG="11111111-c3c1-4001-8001-000000000011"
OP_DECIDE_STATUS="11111111-c3c1-4001-8001-000000000012"
OP_PATCH_STATUS="11111111-c3c1-4001-8001-000000000013"
OP_CAPACITY_USER_LOOKUP="11111111-c3c1-4001-8001-000000000014"
OP_CAPACITY_EMAIL_CONFIRMED="11111111-c3c1-4001-8001-000000000015"

FLOW_REG_PROMOTION="11111111-c3c2-4002-8002-000000000001"
OP_PROMO_GATE="11111111-c3c2-4002-8002-000000000010"
OP_LOAD_REG="11111111-c3c2-4002-8002-000000000011"
OP_FIND_WAITLIST="11111111-c3c2-4002-8002-000000000012"
OP_PICK_TARGET="11111111-c3c2-4002-8002-000000000013"
OP_PROMOTE="11111111-c3c2-4002-8002-000000000014"
OP_PROMO_LOAD_EVENT="11111111-c3c2-4002-8002-000000000015"
OP_PROMO_USER_LOOKUP="11111111-c3c2-4002-8002-000000000016"
OP_PROMO_EMAIL_PROMOTED="11111111-c3c2-4002-8002-000000000017"

FLOW_REG_CHECKIN="11111111-c3c3-4003-8003-000000000001"
OP_CHECKIN_GATE="11111111-c3c3-4003-8003-000000000010"
OP_CHECKIN_LOAD_REG="11111111-c3c3-4003-8003-000000000011"
OP_CHECKIN_LOAD_EVENT="11111111-c3c3-4003-8003-000000000012"
OP_CHECKIN_DEDUPE="11111111-c3c3-4003-8003-000000000013"
OP_CHECKIN_GUARD="11111111-c3c3-4003-8003-000000000014"
OP_CHECKIN_AWARD="11111111-c3c3-4003-8003-000000000015"

api() {
  local method="$1"
  local path="$2"
  local body="${3:-}"
  if [ -n "${body}" ]; then
    curl -s -o /tmp/directus-resp -w "%{http_code}" \
      -H "${H_AUTH}" -H "${H_JSON}" \
      -X "${method}" "${DIRECTUS_URL}${path}" --data "${body}"
  else
    curl -s -o /tmp/directus-resp -w "%{http_code}" \
      -H "${H_AUTH}" -X "${method}" "${DIRECTUS_URL}${path}"
  fi
}

# Upsert by deterministic ID. GET first; if 200, PATCH the meta-ful
# fields. If 404, POST to create. Either way the resulting object has
# the requested ID + body.
upsert() {
  local kind="$1"        # human label
  local resource="$2"    # e.g. flows, operations
  local id="$3"          # deterministic UUID
  local body="$4"
  local code
  code=$(api GET "/${resource}/${id}")
  if [ "${code}" = "200" ]; then
    code=$(api PATCH "/${resource}/${id}" "${body}")
    if [ "${code}" = "200" ] || [ "${code}" = "204" ]; then
      echo "  ~ ${kind} (updated)"
      return 0
    fi
    echo "  ✗ ${kind} PATCH HTTP ${code}"
    head -c 300 /tmp/directus-resp; echo
    return 1
  fi
  # add id to body — flatten with jq for safety
  local with_id
  with_id=$(python3 -c "
import json, sys
b = json.loads(sys.argv[1])
b['id'] = sys.argv[2]
print(json.dumps(b))
" "${body}" "${id}")
  code=$(api POST "/${resource}" "${with_id}")
  if [ "${code}" = "200" ] || [ "${code}" = "204" ]; then
    echo "  + ${kind} (created)"
  else
    echo "  ✗ ${kind} POST HTTP ${code}"
    head -c 300 /tmp/directus-resp; echo
    return 1
  fi
}

# ──────────── reg-capacity-decision flow ────────────────────────────────
#
# Chain (action hook — runs AFTER insert, count includes the new row):
#   trigger (action on registrations.items.create)
#     → event_lookup    (read events[trigger.keys[0]'s event] for capacity)
#     → count_registered (aggregate count of registrations.status=registered)
#     → decide_status   (exec: emit 'waitlisted' iff count > capacity)
#     → patch_status    (item-update only when decide_status said so)
#
# Action-hook trigger payload shape:
#   $trigger.payload = original create payload ({event, user})
#   $trigger.key     = the newly-created item id
#
# Why action (not filter): Directus 11 doesn't propagate exec output
# back into filter-event payloads — verified empirically. Action hook
# trades a microsecond window where the row briefly sits at default
# 'registered' for a reliable, well-supported path.

echo "[flow: reg-capacity-decision]"

# Flow itself (operation chain head is the first op id).
upsert "flow reg-capacity-decision" "flows" "${FLOW_REG_CAPACITY}" "$(cat <<JSON
{
  "name": "Registration capacity decision",
  "icon": "event_seat",
  "color": "#2dd4bf",
  "description": "On registrations.items.create (action): demote status from registered to waitlisted when the event is at capacity.",
  "status": "active",
  "trigger": "event",
  "accountability": "all",
  "options": {
    "type": "action",
    "scope": ["items.create"],
    "collections": ["registrations"]
  },
  "operation": "${OP_EVENT_LOOKUP}"
}
JSON
)"

# Operations must be created bottom-up: each op's `resolve` FK has to
# point at an op that already exists. So patch_status (terminal) first,
# then decide_status → patch_status, then count_registered → decide_status,
# then event_lookup → count_registered.

# Op 4 (terminal): patch the new row to waitlisted IF decide_status said
# so. When decide_status returned null, this op short-circuits (the
# update payload has no fields → Directus rejects with empty body,
# which is fine: the row stays at default 'registered').
upsert "op patch_status" "operations" "${OP_PATCH_STATUS}" "$(cat <<JSON
{
  "name": "Patch status if needed",
  "key": "patch_status",
  "type": "item-update",
  "position_x": 73,
  "position_y": 1,
  "options": {
    "collection": "registrations",
    "key": "{{ \$trigger.key }}",
    "payload": {
      "status": "waitlisted"
    },
    "emitEvents": false
  },
  "flow": "${FLOW_REG_CAPACITY}",
  "resolve": null,
  "reject": null
}
JSON
)"

# Op 3: exec script. Receives ALL prior op results in `data`. Returns a
# truthy object → next op runs (patch_status). Returns null → resolve
# chain still progresses but item-update gets called anyway, so we use
# `reject` instead to short-circuit when no demotion is needed.
# Op 5 (terminal of reject/email branch): POST /v1/internal/email.
upsert "op capacity_email_confirmed" "operations" "${OP_CAPACITY_EMAIL_CONFIRMED}" "$(cat <<JSON
{
  "name": "Email registration-confirmed",
  "key": "capacity_email_confirmed",
  "type": "request",
  "position_x": 73,
  "position_y": 17,
  "options": {
    "method": "POST",
    "url": "https://uz.aiqadam.org/api/v1/internal/email",
    "headers": [
      { "header": "x-internal-auth", "value": "{{ \$env.INTERNAL_API_TOKEN }}" },
      { "header": "content-type", "value": "application/json" }
    ],
    "body": "{ \"template\": \"registration-confirmed\", \"to\": \"{{ capacity_user_lookup.email }}\", \"data\": { \"recipientName\": \"{{ capacity_user_lookup.first_name }}\", \"eventTitle\": \"{{ event_lookup.title }}\", \"eventStartsAt\": \"{{ event_lookup.starts_at }}\", \"eventLocation\": \"{{ event_lookup.location }}\" } }"
  },
  "flow": "${FLOW_REG_CAPACITY}",
  "resolve": null,
  "reject": null
}
JSON
)"

# Op 4: look up the registering user's email (used by capacity_email_confirmed).
upsert "op capacity_user_lookup" "operations" "${OP_CAPACITY_USER_LOOKUP}" "$(cat <<JSON
{
  "name": "Lookup registering user",
  "key": "capacity_user_lookup",
  "type": "item-read",
  "position_x": 55,
  "position_y": 17,
  "options": {
    "collection": "directus_users",
    "key": "{{ \$trigger.payload.user }}",
    "query": {
      "fields": ["email", "first_name"]
    }
  },
  "flow": "${FLOW_REG_CAPACITY}",
  "resolve": "${OP_CAPACITY_EMAIL_CONFIRMED}",
  "reject": null
}
JSON
)"

upsert "op decide_status" "operations" "${OP_DECIDE_STATUS}" "$(cat <<JSON
{
  "name": "Decide status",
  "key": "decide_status",
  "type": "exec",
  "position_x": 55,
  "position_y": 1,
  "options": {
    "code": "module.exports = async function(data) {\n  const event = data.event_lookup || {};\n  const capacity = Number(event.capacity ?? 0);\n  if (!capacity) {\n    throw new Error('no-capacity-limit');\n  }\n  const countRow = Array.isArray(data.count_registered)\n    ? data.count_registered[0]\n    : data.count_registered;\n  const current = Number((countRow && countRow.count && countRow.count.id) ?? (countRow && countRow.count) ?? 0);\n  if (current <= capacity) {\n    throw new Error('within-capacity');\n  }\n  return { demote: true };\n}"
  },
  "flow": "${FLOW_REG_CAPACITY}",
  "resolve": "${OP_PATCH_STATUS}",
  "reject": "${OP_CAPACITY_USER_LOOKUP}"
}
JSON
)"

# Op 2: count the registered (action hook fires AFTER create, so this
# count INCLUDES the newly-inserted row, which sits at default
# 'registered' until the patch op runs). Aggregate returns
# data: [{ count: { id: "<n>" } }].
upsert "op count_registered" "operations" "${OP_COUNT_REG}" "$(cat <<JSON
{
  "name": "Count registered",
  "key": "count_registered",
  "type": "item-read",
  "position_x": 37,
  "position_y": 1,
  "options": {
    "collection": "registrations",
    "query": {
      "filter": {
        "event": { "_eq": "{{ \$trigger.payload.event }}" },
        "status": { "_eq": "registered" }
      },
      "aggregate": { "count": ["id"] }
    }
  },
  "flow": "${FLOW_REG_CAPACITY}",
  "resolve": "${OP_DECIDE_STATUS}",
  "reject": null
}
JSON
)"

# Op 1: read the target event for capacity + email fields.
upsert "op event_lookup" "operations" "${OP_EVENT_LOOKUP}" "$(cat <<JSON
{
  "name": "Lookup event",
  "key": "event_lookup",
  "type": "item-read",
  "position_x": 19,
  "position_y": 1,
  "options": {
    "collection": "events",
    "key": "{{ \$trigger.payload.event }}",
    "query": {
      "fields": ["id", "capacity", "title", "starts_at", "location"]
    }
  },
  "flow": "${FLOW_REG_CAPACITY}",
  "resolve": "${OP_COUNT_REG}",
  "reject": null
}
JSON
)"


# ──────────── reg-waitlist-promotion flow ───────────────────────────────
#
# Chain (action hook on registrations.items.update):
#   trigger
#     → promo_gate   (exec: short-circuit unless payload.status === 'cancelled')
#     → load_reg     (read the just-updated reg to get its event)
#     → find_waitlist (read 1 oldest waitlisted for that event)
#     → pick_target  (exec: emit target id or throw if list is empty)
#     → promote      (item-update: status='registered' on the target)
#
# Why an exec gate (not Directus' built-in condition op): the condition
# op only supports filter rules, not relational checks against the
# trigger payload's literal shape — easier to express in 3 lines of JS.

echo
echo "[flow: reg-waitlist-promotion]"

upsert "flow reg-waitlist-promotion" "flows" "${FLOW_REG_PROMOTION}" "$(cat <<JSON
{
  "name": "Waitlist promotion on cancel",
  "icon": "swap_vert",
  "color": "#2dd4bf",
  "description": "On registrations.items.update (action) where status=cancelled, promote oldest waitlisted for the same event to registered.",
  "status": "active",
  "trigger": "event",
  "accountability": "all",
  "options": {
    "type": "action",
    "scope": ["items.update"],
    "collections": ["registrations"]
  },
  "operation": "${OP_PROMO_GATE}"
}
JSON
)"

# Op 8 (terminal of promotion email path): POST /v1/internal/email.
upsert "op promo_email_promoted" "operations" "${OP_PROMO_EMAIL_PROMOTED}" "$(cat <<JSON
{
  "name": "Email registration-promoted",
  "key": "promo_email_promoted",
  "type": "request",
  "position_x": 163,
  "position_y": 1,
  "options": {
    "method": "POST",
    "url": "https://uz.aiqadam.org/api/v1/internal/email",
    "headers": [
      { "header": "x-internal-auth", "value": "{{ \$env.INTERNAL_API_TOKEN }}" },
      { "header": "content-type", "value": "application/json" }
    ],
    "body": "{ \"template\": \"registration-promoted\", \"to\": \"{{ promo_user_lookup.email }}\", \"data\": { \"recipientName\": \"{{ promo_user_lookup.first_name }}\", \"eventTitle\": \"{{ promo_load_event.title }}\", \"eventStartsAt\": \"{{ promo_load_event.starts_at }}\", \"eventLocation\": \"{{ promo_load_event.location }}\" } }"
  },
  "flow": "${FLOW_REG_PROMOTION}",
  "resolve": null,
  "reject": null
}
JSON
)"

# Op 7: look up the promoted user's email + name.
# pick_target's output is { id: <reg uuid> }; find_waitlist row 0 carries
# the user uuid — reach for it directly.
upsert "op promo_user_lookup" "operations" "${OP_PROMO_USER_LOOKUP}" "$(cat <<JSON
{
  "name": "Lookup promoted user",
  "key": "promo_user_lookup",
  "type": "item-read",
  "position_x": 145,
  "position_y": 1,
  "options": {
    "collection": "directus_users",
    "key": "{{ find_waitlist[0].user }}",
    "query": {
      "fields": ["email", "first_name"]
    }
  },
  "flow": "${FLOW_REG_PROMOTION}",
  "resolve": "${OP_PROMO_EMAIL_PROMOTED}",
  "reject": null
}
JSON
)"

# Op 6: load the event for the email template (title, starts_at, location).
upsert "op promo_load_event" "operations" "${OP_PROMO_LOAD_EVENT}" "$(cat <<JSON
{
  "name": "Load event for email",
  "key": "promo_load_event",
  "type": "item-read",
  "position_x": 127,
  "position_y": 1,
  "options": {
    "collection": "events",
    "key": "{{ load_reg.event }}",
    "query": {
      "fields": ["id", "title", "starts_at", "location"]
    }
  },
  "flow": "${FLOW_REG_PROMOTION}",
  "resolve": "${OP_PROMO_USER_LOOKUP}",
  "reject": null
}
JSON
)"

# Op 5: promote the target to registered. emitEvents:false so we don't
# recursively retrigger anything. Resolve → load event → user → email.
upsert "op promote" "operations" "${OP_PROMOTE}" "$(cat <<JSON
{
  "name": "Promote target",
  "key": "promote",
  "type": "item-update",
  "position_x": 91,
  "position_y": 1,
  "options": {
    "collection": "registrations",
    "key": "{{ \$last.id }}",
    "payload": {
      "status": "registered"
    },
    "emitEvents": false
  },
  "flow": "${FLOW_REG_PROMOTION}",
  "resolve": "${OP_PROMO_LOAD_EVENT}",
  "reject": null
}
JSON
)"

# Op 4: pick the target. find_waitlist returns [] or [{id, ...}]. Emit
# {id: ...} when non-empty; throw to short-circuit when empty.
upsert "op pick_target" "operations" "${OP_PICK_TARGET}" "$(cat <<JSON
{
  "name": "Pick promotion target",
  "key": "pick_target",
  "type": "exec",
  "position_x": 73,
  "position_y": 1,
  "options": {
    "code": "module.exports = async function(data) {\n  const list = data.find_waitlist;\n  if (!Array.isArray(list) || list.length === 0) {\n    throw new Error('no-waitlist');\n  }\n  return { id: list[0].id };\n}"
  },
  "flow": "${FLOW_REG_PROMOTION}",
  "resolve": "${OP_PROMOTE}",
  "reject": null
}
JSON
)"

# Op 3: find oldest waitlisted for the event. load_reg gave us event.
upsert "op find_waitlist" "operations" "${OP_FIND_WAITLIST}" "$(cat <<JSON
{
  "name": "Find oldest waitlisted",
  "key": "find_waitlist",
  "type": "item-read",
  "position_x": 55,
  "position_y": 1,
  "options": {
    "collection": "registrations",
    "query": {
      "filter": {
        "event": { "_eq": "{{ \$last.event }}" },
        "status": { "_eq": "waitlisted" }
      },
      "sort": ["date_created"],
      "limit": 1,
      "fields": ["id", "user", "event"]
    }
  },
  "flow": "${FLOW_REG_PROMOTION}",
  "resolve": "${OP_PICK_TARGET}",
  "reject": null
}
JSON
)"

# Op 2: load the just-updated registration to learn its event. Update
# payload may not include event field, so we read by trigger.keys[0].
# Directus update action triggers DO use `keys` (plural) for updates —
# verified by reading a flow run revision.
upsert "op load_reg" "operations" "${OP_LOAD_REG}" "$(cat <<JSON
{
  "name": "Load updated reg",
  "key": "load_reg",
  "type": "item-read",
  "position_x": 37,
  "position_y": 1,
  "options": {
    "collection": "registrations",
    "key": "{{ \$trigger.keys[0] }}",
    "query": {
      "fields": ["id", "event", "status"]
    }
  },
  "flow": "${FLOW_REG_PROMOTION}",
  "resolve": "${OP_FIND_WAITLIST}",
  "reject": null
}
JSON
)"

# Op 1: gate. Short-circuit unless the update flipped status to
# 'cancelled'. Throws otherwise → reject path → no-op (reject:null).
upsert "op promo_gate" "operations" "${OP_PROMO_GATE}" "$(cat <<JSON
{
  "name": "Cancelled gate",
  "key": "promo_gate",
  "type": "exec",
  "position_x": 19,
  "position_y": 1,
  "options": {
    "code": "module.exports = async function(data) {\n  const payload = (data['\$trigger'] && data['\$trigger'].payload) || {};\n  if (payload.status !== 'cancelled') {\n    throw new Error('not-a-cancel');\n  }\n  return { ok: true };\n}"
  },
  "flow": "${FLOW_REG_PROMOTION}",
  "resolve": "${OP_LOAD_REG}",
  "reject": null
}
JSON
)"

# ──────────── reg-checkin-points flow ───────────────────────────────────
#
# Chain (action hook on registrations.items.update):
#   trigger
#     → checkin_gate    (exec: short-circuit unless payload.status === 'attended')
#     → checkin_load_reg (read the just-updated reg → get user + event)
#     → checkin_load_event (read event → get country)
#     → checkin_dedupe  (count existing point_awards for this user+event)
#     → checkin_guard   (exec: throw if count > 0; emit award fields otherwise)
#     → checkin_award   (item-create on point_awards)
#
# Dedupe matters because action hooks fire on every PATCH; calling
# /items/registrations/<id> with {status:'attended'} more than once
# would otherwise create duplicate point_awards.

echo
echo "[flow: reg-checkin-points]"

upsert "flow reg-checkin-points" "flows" "${FLOW_REG_CHECKIN}" "$(cat <<JSON
{
  "name": "Check-in awards points",
  "icon": "stars",
  "color": "#2dd4bf",
  "description": "On registrations.items.update (action) where status=attended, create one point_awards row (idempotent on user+event).",
  "status": "active",
  "trigger": "event",
  "accountability": "all",
  "options": {
    "type": "action",
    "scope": ["items.update"],
    "collections": ["registrations"]
  },
  "operation": "${OP_CHECKIN_GATE}"
}
JSON
)"

# Op 6 (terminal): create the point_award. Fields come from checkin_guard.
upsert "op checkin_award" "operations" "${OP_CHECKIN_AWARD}" "$(cat <<JSON
{
  "name": "Award points",
  "key": "checkin_award",
  "type": "item-create",
  "position_x": 109,
  "position_y": 1,
  "options": {
    "collection": "point_awards",
    "payload": {
      "user": "{{ \$last.user }}",
      "country": "{{ \$last.country }}",
      "source": "event_attended",
      "source_ref": "{{ \$last.source_ref }}",
      "points": 10
    },
    "emitEvents": false
  },
  "flow": "${FLOW_REG_CHECKIN}",
  "resolve": null,
  "reject": null
}
JSON
)"

# Op 5: guard. If a previous point_award exists for this (user, event)
# pair, throw to short-circuit. Otherwise emit the award fields.
upsert "op checkin_guard" "operations" "${OP_CHECKIN_GUARD}" "$(cat <<JSON
{
  "name": "Idempotency guard",
  "key": "checkin_guard",
  "type": "exec",
  "position_x": 91,
  "position_y": 1,
  "options": {
    "code": "module.exports = async function(data) {\n  const dedupe = data.checkin_dedupe;\n  const row = Array.isArray(dedupe) ? dedupe[0] : dedupe;\n  const existing = Number((row && row.count && row.count.id) ?? (row && row.count) ?? 0);\n  if (existing > 0) {\n    throw new Error('already-awarded');\n  }\n  const reg = data.checkin_load_reg || {};\n  const event = data.checkin_load_event || {};\n  if (!reg.user || !reg.event) {\n    throw new Error('missing-reg-fields');\n  }\n  return {\n    user: reg.user,\n    source_ref: reg.event,\n    country: event.country || 'uz'\n  };\n}"
  },
  "flow": "${FLOW_REG_CHECKIN}",
  "resolve": "${OP_CHECKIN_AWARD}",
  "reject": null
}
JSON
)"

# Op 4: count existing point_awards for (user, event) — idempotency.
upsert "op checkin_dedupe" "operations" "${OP_CHECKIN_DEDUPE}" "$(cat <<JSON
{
  "name": "Dedupe count",
  "key": "checkin_dedupe",
  "type": "item-read",
  "position_x": 73,
  "position_y": 1,
  "options": {
    "collection": "point_awards",
    "query": {
      "filter": {
        "user": { "_eq": "{{ checkin_load_reg.user }}" },
        "source_ref": { "_eq": "{{ checkin_load_reg.event }}" },
        "source": { "_eq": "event_attended" }
      },
      "aggregate": { "count": ["id"] }
    }
  },
  "flow": "${FLOW_REG_CHECKIN}",
  "resolve": "${OP_CHECKIN_GUARD}",
  "reject": null
}
JSON
)"

# Op 3: load the event for its country (used as point_awards.country).
upsert "op checkin_load_event" "operations" "${OP_CHECKIN_LOAD_EVENT}" "$(cat <<JSON
{
  "name": "Load event",
  "key": "checkin_load_event",
  "type": "item-read",
  "position_x": 55,
  "position_y": 1,
  "options": {
    "collection": "events",
    "key": "{{ \$last.event }}",
    "query": {
      "fields": ["id", "country"]
    }
  },
  "flow": "${FLOW_REG_CHECKIN}",
  "resolve": "${OP_CHECKIN_DEDUPE}",
  "reject": null
}
JSON
)"

# Op 2: load the registration to get user + event ids.
upsert "op checkin_load_reg" "operations" "${OP_CHECKIN_LOAD_REG}" "$(cat <<JSON
{
  "name": "Load updated reg",
  "key": "checkin_load_reg",
  "type": "item-read",
  "position_x": 37,
  "position_y": 1,
  "options": {
    "collection": "registrations",
    "key": "{{ \$trigger.keys[0] }}",
    "query": {
      "fields": ["id", "event", "user", "status"]
    }
  },
  "flow": "${FLOW_REG_CHECKIN}",
  "resolve": "${OP_CHECKIN_LOAD_EVENT}",
  "reject": null
}
JSON
)"

# Op 1: gate. Short-circuit unless the update flipped status to 'attended'.
upsert "op checkin_gate" "operations" "${OP_CHECKIN_GATE}" "$(cat <<JSON
{
  "name": "Attended gate",
  "key": "checkin_gate",
  "type": "exec",
  "position_x": 19,
  "position_y": 1,
  "options": {
    "code": "module.exports = async function(data) {\n  const payload = (data['\$trigger'] && data['\$trigger'].payload) || {};\n  if (payload.status !== 'attended') {\n    throw new Error('not-a-checkin');\n  }\n  return { ok: true };\n}"
  },
  "flow": "${FLOW_REG_CHECKIN}",
  "resolve": "${OP_CHECKIN_LOAD_REG}",
  "reject": null
}
JSON
)"

echo
echo "Done."
echo "  capacity flow:   ${DIRECTUS_URL}/admin/settings/flows/${FLOW_REG_CAPACITY}"
echo "  promotion flow:  ${DIRECTUS_URL}/admin/settings/flows/${FLOW_REG_PROMOTION}"
echo "  check-in flow:   ${DIRECTUS_URL}/admin/settings/flows/${FLOW_REG_CHECKIN}"
