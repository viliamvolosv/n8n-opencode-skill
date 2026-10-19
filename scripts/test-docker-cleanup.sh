#!/bin/sh
# Real Docker resource checks; no model, n8n or API credentials required.
set -eu
cd "$(dirname "$0")/.."
fixture_image=${SKILL_CLEANUP_TEST_IMAGE:-node:24-bookworm}
docker image inspect "$fixture_image" >/dev/null 2>&1 || docker pull "$fixture_image"
cleanup_source="$PWD/scripts/cleanup-integration.sh"
fixture_dir=$(mktemp -d)
trap 'sh "$fixture_dir/scripts/cleanup-integration.sh"; rm -rf "$fixture_dir"' EXIT
mkdir -p "$fixture_dir/scripts" "$fixture_dir/test-results/integration"
cp "$cleanup_source" "$fixture_dir/scripts/cleanup-integration.sh"
for scenario in success failure termination forced-kill; do
  project="n8n-skill-ci-$(date +%s)-$$"
  printf '%s\n' "$project" > "$fixture_dir/test-results/integration/docker-project"
  docker network create --label "com.docker.compose.project=$project" "$project" >/dev/null
  docker volume create --label "com.docker.compose.project=$project" "$project" >/dev/null
  docker create --name "$project" --label "com.docker.compose.project=$project" --network "$project" --mount "type=volume,src=$project,dst=/fixture" --entrypoint sleep "$fixture_image" 300 >/dev/null
  docker start "$project" >/dev/null
  if [ "$scenario" = forced-kill ]; then
    # No EXIT trap survives SIGKILL: exercise the separate CI fallback instead.
    sleep 300 & fixture_pid=$!
    kill -KILL "$fixture_pid"
    wait "$fixture_pid" 2>/dev/null || true
    sh "$fixture_dir/scripts/cleanup-integration.sh"
  else
    sh -c '
      trap '\''sh "$1/scripts/cleanup-integration.sh"'\'' EXIT
      trap '\''exit 130'\'' TERM INT
      case "$2" in
        success) exit 0;;
        failure) exit 42;;
        termination) kill -TERM $$;;
      esac
    ' fixture "$fixture_dir" "$scenario" & fixture_pid=$!
    status=0
    wait "$fixture_pid" || status=$?
    case "$scenario:$status" in success:0|failure:42|termination:130) ;; *) exit 1;; esac
  fi
  # Idempotency + leak verification after every scenario.
  sh "$fixture_dir/scripts/cleanup-integration.sh"
  echo "PASS cleanup: $scenario"
done
