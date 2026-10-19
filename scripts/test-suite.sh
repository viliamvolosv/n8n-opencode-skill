#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
if [ "${1:-}" = --verify-runtime ]; then
  shift
  SKILL_TEST_SUITE=true SKILL_TEST_RUNTIME_CHECK=true exec sh scripts/test-integration.sh "$@"
fi
# Catalog inspection needs neither n8n nor model/network calls after image build.
for test_argument in "$@"; do
  case "$test_argument" in
    --list|--validate-catalog|--self-test)
      catalog_project="n8n-skill-ci-$(date +%s)-$$"
      catalog_image="$catalog_project-catalog"
      mkdir -p test-results/integration
      printf '%s\n' "$catalog_project" > test-results/integration/docker-project
      trap 'sh scripts/cleanup-integration.sh' EXIT
      trap 'exit 130' HUP INT TERM
      docker build --label "com.docker.compose.project=$catalog_project" -t "$catalog_image" -f tests/docker/Integration.Dockerfile .
      if [ "$test_argument" = --self-test ]; then
        docker run --rm --label "com.docker.compose.project=$catalog_project" --entrypoint node "$catalog_image" --test /opt/skill-test/agent-session.test.mjs /opt/skill-test/model-output.test.mjs /opt/skill-test/harness.test.mjs /opt/skill-test/execution-checks.test.mjs /opt/skill-test/fixture.test.mjs /opt/skill-test/deployment.test.mjs
        docker run --rm --label "com.docker.compose.project=$catalog_project" --entrypoint node "$catalog_image" /opt/skill-test/suite.mjs --validate-catalog
      else
        docker run --rm --label "com.docker.compose.project=$catalog_project" --entrypoint node "$catalog_image" /opt/skill-test/suite.mjs "$@"
      fi
      exit 0
      ;;
  esac
done
SKILL_TEST_SUITE=true exec sh scripts/test-integration.sh "$@"
