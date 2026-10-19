#!/bin/sh
# Fallback for CI cancellation: remove only resources belonging to this job.
set -eu
cd "$(dirname "$0")/.."
marker=test-results/integration/docker-project
[ -f "$marker" ] || exit 0
project=$(cat "$marker")
case "$project" in n8n-skill-ci-*) suffix=${project#n8n-skill-ci-};; *) exit 2;; esac
timestamp=${suffix%-*}
process_id=${suffix#*-}
case "$timestamp:$process_id" in
  *[!0-9:]*|:*|*:) echo 'Invalid test project marker' >&2; exit 2 ;;
esac
[ "$suffix" = "$timestamp-$process_id" ] || exit 2
for kind in container network volume image; do
  case "$kind" in
    container) ids=$(docker ps -aq --filter "label=com.docker.compose.project=$project");;
    network) ids=$(docker network ls -q --filter "label=com.docker.compose.project=$project");;
    volume) ids=$(docker volume ls -q --filter "label=com.docker.compose.project=$project");;
    image) ids=$(docker image ls -q --filter "label=com.docker.compose.project=$project");;
  esac
  if [ -n "$ids" ]; then
    case "$kind" in
      container) docker container rm -f $ids ;;
      *) docker "$kind" rm $ids ;;
    esac
  fi
done
# A successful command must leave no containers, networks or volumes behind.
for kind in container network volume; do
  case "$kind" in
    container) remaining=$(docker ps -aq --filter "label=com.docker.compose.project=$project");;
    *) remaining=$(docker "$kind" ls -q --filter "label=com.docker.compose.project=$project");;
  esac
  [ -z "$remaining" ] || { echo "Leaked $kind for $project" >&2; exit 2; }
done
printf 'Docker cleanup verified: %s\n' "$project"
