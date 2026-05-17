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

FLOW_REG_PROMOTION="11111111-c3c2-4002-8002-000000000001"
OP_PROMO_GATE="11111111-c3c2-4002-8002-000000000010"
OP_LOAD_REG="11111111-c3c2-4002-8002-000000000011"
OP_FIND_WAITLIST="11111111-c3c2-4002-8002-000000000012"
OP_PICK_TARGET="11111111-c3c2-4002-8002-000000000013"
OP_PROMOTE="11111111-c3c2-4002-8002-000000000014"

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
  "reject": null
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

# Op 1: read the target event for its capacity.
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
      "fields": ["id", "capacity", "title"]
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

# Op 5 (terminal): promote the target to registered. emitEvents:false so
# we don't recursively retrigger anything.
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
  "resolve": null,
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

echo
echo "Done."
echo "  capacity flow:   ${DIRECTUS_URL}/admin/settings/flows/${FLOW_REG_CAPACITY}"
echo "  promotion flow:  ${DIRECTUS_URL}/admin/settings/flows/${FLOW_REG_PROMOTION}"
