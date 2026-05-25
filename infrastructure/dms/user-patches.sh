#!/bin/bash
# Canonical DMS (docker-mailserver) user-patches.sh.
#
# Source of truth: this file. The runtime copy lives in the DMS config volume
# at /tmp/docker-mailserver/user-patches.sh inside the dms-* container and is
# executed automatically by DMS on every container start. Pushed into the
# volume by infrastructure/dms/apply.sh (see README.md for the deploy flow).
#
# Why this script exists at all: DMS ships LDAP configs hard-coded against
# the OpenLDAP `mail` attribute, but our Authentik LDAP outpost uses
# `mail` for the user's *recovery* email (e.g. *@gmail.com). The internal
# @aiqadam.org address is carried as the Authentik User.attribute
# `mailboxEmail`. Every Postfix and Dovecot filter must therefore probe
# `mailboxEmail`, not `mail` — otherwise external domains whose name
# happens to match any internal user's recovery email get incorrectly
# treated as locally hosted, and mail to those domains bounces.
set -e

# ─────────────────────────────────────────────────────────────────────
# Dovecot LDAP attr mapping for Authentik
# ─────────────────────────────────────────────────────────────────────
# Authentik exposes standard inetOrgPerson attrs (uidNumber/gidNumber/
# homeDirectory), not the OpenLDAP `mail*` variants DMS expects. Force
# static vmail uid/gid (5000) and email-based mail path so Dovecot can
# drop privileges + auto-create maildirs. pass_filter / user_filter
# match the Authentik `mailboxEmail` attribute (not `mail`) so the
# personal recovery email never participates in mailbox auth.
sed -i \
  -e 's|^user_attrs.*|user_attrs = =uid=5000,=gid=5000,=home=/var/mail/%d/%n,=mail=maildir:/var/mail/%d/%n/Maildir|' \
  -e 's|^pass_attrs.*|pass_attrs = mailboxEmail=user|' \
  -e 's|^pass_filter.*|pass_filter = (\&(objectClass=inetOrgPerson)(mailboxEmail=%u))|' \
  -e 's|^user_filter.*|user_filter = (\&(objectClass=inetOrgPerson)(mailboxEmail=%u))|' \
  /etc/dovecot/dovecot-ldap.conf.ext

# ─────────────────────────────────────────────────────────────────────
# Postfix LDAP filter parity (matches the Dovecot patch above)
# ─────────────────────────────────────────────────────────────────────
# Three Postfix LDAP configs filter against inetOrgPerson and must use
# mailboxEmail, not mail. (`ldap-groups.cf` filters against
# groupOfNames, which has no recovery-email attribute, so it stays on
# `mail` and is left untouched.) See README.md §"Why all 3 filters,
# not just domains" for the full bug class explanation.
#
# Reproduce the bug class before vs after with infrastructure/dms/smoke.sh.

#   virtual_mailbox_domains — "is %s a domain we host?"
sed -i -E \
  -e "s|^query_filter = .*|query_filter = (mailboxEmail=*@%s)|" \
  -e "s|^result_attribute = .*|result_attribute = mailboxEmail|" \
  /etc/postfix/ldap-domains.cf

#   virtual_alias_maps (LDAP-backed) — "is <addr> a known recipient?"
sed -i -E \
  -e "s|^query_filter = .*|query_filter = (\&(objectClass=inetOrgPerson)(mailboxEmail=%s))|" \
  -e "s|^result_attribute = .*|result_attribute = mailboxEmail|" \
  /etc/postfix/ldap-aliases.cf

#   virtual_mailbox_maps — "does <addr> resolve to a real mailbox?"
sed -i -E \
  -e "s|^query_filter = .*|query_filter = (\&(objectClass=inetOrgPerson)(mailboxEmail=%s))|" \
  -e "s|^result_attribute = .*|result_attribute = mailboxEmail|" \
  /etc/postfix/ldap-users.cf

# ─────────────────────────────────────────────────────────────────────
# Catch-all alias (Postfix virtual map alongside LDAP)
# ─────────────────────────────────────────────────────────────────────
# DMS doesn't auto-wire /tmp/docker-mailserver/postfix-virtual.cf when
# LDAP is the primary backend. Copy it into /etc/postfix/virtual,
# postmap it, and append its hash to virtual_alias_maps so LDAP
# queries still run first (real user > catch-all).
if [ -f /tmp/docker-mailserver/postfix-virtual.cf ]; then
  cp /tmp/docker-mailserver/postfix-virtual.cf /etc/postfix/virtual
  postmap /etc/postfix/virtual
  CURRENT=$(postconf -h virtual_alias_maps)
  if ! echo "$CURRENT" | grep -q 'hash:/etc/postfix/virtual'; then
    postconf -e "virtual_alias_maps = $CURRENT, hash:/etc/postfix/virtual"
  fi
fi
