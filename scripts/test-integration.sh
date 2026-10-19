#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
# A unique Compose project prevents collisions with local n8n or parallel CI jobs.
test_project="n8n-skill-ci-$(date +%s)-$$"
test_container="$test_project-runner"
mkdir -p test-results/integration
printf '%s\n' "$test_project" > test-results/integration/docker-project
# Remove only generated per-case evidence from an earlier run.
rm -rf test-results/integration/cases test-results/integration/controls
rm -f test-results/integration/report.json test-results/integration/junit.xml \
  test-results/integration/workflow.json test-results/integration/events.ndjson \
  test-results/integration/stderr.log test-results/integration/mcp-health.json \
  test-results/integration/validation.json
compose() {
  docker compose -p "$test_project" -f docker-compose.integration.yml -f docker-compose.suite.yml "$@"
}

cleanup() {
  test_status=$?
  trap - EXIT HUP INT TERM
  if ! docker cp "$test_container:/results/." test-results/integration/ > test-results/integration/artifact-copy.log 2>&1; then
    if [ "$test_status" -eq 0 ]; then test_status=2; fi
  fi
  if [ ! -f test-results/integration/report.json ]; then
    printf '{"status":"ERROR","error":"Docker build or service startup failed","exitCode":%s}\n' "$test_status" > test-results/integration/report.json
    printf '<testsuite name="n8n-skills-live" tests="1" errors="1"><testcase name="startup"><error message="Docker build or service startup failed"/></testcase></testsuite>\n' > test-results/integration/junit.xml
  fi
  compose logs --no-color > test-results/integration/services.log 2>&1 || true
  docker rm -f "$test_container" > /dev/null 2>&1 || true
  if ! compose down --volumes --remove-orphans --rmi local > test-results/integration/cleanup.log 2>&1; then
    printf '%s\n' 'Docker cleanup failed; inspect test-results/integration/cleanup.log' >&2
    if [ "$test_status" -eq 0 ]; then test_status=2; fi
  fi
  if ! sh scripts/cleanup-integration.sh >> test-results/integration/cleanup.log 2>&1; then
    test_status=2
  fi
  exit "$test_status"
}
trap cleanup EXIT
trap 'exit 130' HUP INT TERM
compose build
compose run --rm --no-deps --entrypoint node integration --test /opt/skill-test/agent-session.test.mjs /opt/skill-test/model-output.test.mjs /opt/skill-test/harness.test.mjs /opt/skill-test/execution-checks.test.mjs /opt/skill-test/fixture.test.mjs /opt/skill-test/deployment.test.mjs
compose run --rm --no-deps --entrypoint node integration /opt/skill-test/suite.mjs --validate-catalog
compose up -d --wait --wait-timeout 300 suite-proxy
if [ "${SKILL_TEST_RUNTIME_CHECK:-false}" = true ]; then
  compose run --name "$test_container" --no-deps --entrypoint node integration /opt/skill-test/runtime-contract.mjs
elif [ "${SKILL_TEST_SUITE:-false}" = true ]; then
  compose run --name "$test_container" --no-deps integration "$@"
else
  compose run --name "$test_container" --no-deps integration --case live-expression-syntax "$@"
fi
