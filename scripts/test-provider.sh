#!/bin/sh
# Exercise the real agent context, not only a trivial model reply.
set -u
cd "$(dirname "$0")/.."
status=0
sh scripts/test-integration.sh || status=$?
case "$status" in
  0) echo 'Provider and real n8n smoke scenario are available' ;;
  1) echo 'Provider available; smoke behavior FAIL is recorded, full suite continues' ;;
  *) echo 'Provider/infrastructure preflight failed; full suite cannot run' >&2; exit "$status" ;;
esac
