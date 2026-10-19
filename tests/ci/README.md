# Dedicated Gitea runner

OpenCode V2, n8n and MCP run in disposable Docker containers. OpenCode V1 is unsupported.
The runner image provides only the CI runtime (Node, Git, Docker CLI and Compose).
It has repository-scoped registration and the `n8n-skill-ci` label; capacity is one.
Docker socket access allows this trusted repository's workflows to control the server's Docker daemon.

PR open/update/reopen runs the harness, one real n8n/MCP integration scenario,
and the suite of 14 execution tasks and one configuration task across all 15 groups.
Pushes to main affecting skills or tests also run the harness and single integration check. The full suite also supports manual dispatch. It uses provider quotas and may take hours. All selected scenarios are attempted even if earlier scenarios report provider errors. A failed model scenario
fails CI; provider outages are reported as errors. The runner needs outbound access
to image registries, action repositories and the configured LLM API.

## Installation

Copy this directory to the runner server. Build with `docker compose build runner`.
Generate a **repository-scoped** registration token using Gitea's `gitea actions
generate-runner-token --scope OWNER/REPO`. Register using the built image with
`act_runner register --no-interactive --instance URL --token TOKEN --name n8n-skill-ci
--config /config.yaml`, mounting `./runner:/runner`, `./config.yaml:/config.yaml:ro`
and setting the working directory to `/runner`. Keep token values out of logs/history.
Then `docker compose up -d`. Registration credentials stay in `runner/.runner`;
restrict this directory to the administrator and never commit it.

## Cleanup

Each job saves its unique Compose project in the ignored
`test-results/integration/docker-project`. Shell EXIT/TERM/INT traps remove the
runner, Compose services, volumes, networks and project build images. An `always()`
CI step calls `scripts/cleanup-integration.sh` again and verifies no containers,
networks or volumes remain. Cleanup errors fail the job. Base images and Docker
build cache are retained; unrelated containers are untouched.

If the runner or server is killed before either cleanup can run, the separate
janitor checks every minute and removes resources with a Compose project label
matching exactly `n8n-skill-ci-TIMESTAMP-PID` once they are three hours old.
This exceeds the two-hour job timeout. It resumes after server restart. It does
not run global `docker prune`. Shell traps cannot catch SIGKILL; this recovery is
eventual, not immediate. Check `docker compose logs janitor` for recovery errors.

Evidence is in the workflow artifact (`report.json`, JUnit, traces and cleanup.log).
The final cleanup step also prints `Docker cleanup verified: PROJECT` in the job log.

## Configured LLM

Gitea uses `local/configured` for the OpenCode subject. Set repository Actions
secrets `LLM_BASE_URL` and `LLM_MODEL_ID`; `LLM_API_KEY` is optional. An absent
API-key secret means an empty key, without a placeholder credential. Connection
settings are passed only at runtime, never as Docker build arguments. See
[local LLM setup](../../docs/ci/local-llm-setup.md). GitHub Actions tests are disabled.

The full-suite workflow first verifies positive and negative real n8n controls without an LLM, then runs the real OpenCode + MCP + n8n smoke scenario,
including actual skill/tool context, against the selected provider. Authentication/quota/endpoint failure blocks the matrix with an explicit
provider error; it does not count as skill coverage or a pass. Once the provider
check succeeds, all 15 groups run, with `fail-fast: false` and the 15-error limit.

For configured LLMs, unrelated built-in tools are denied rather than merely awaiting approval,
which omits their schemas from the model request. Skill reads and MCP calls remain
allowed. Smoke and full-suite tasks use the same verifier and expose the MCP tools
needed for creation, debugging and instance switching. There are no judge sessions.
All verdicts come from code assertions. An unfinished tool turn may continue once
in the same session and within its original deadline; completed failures are not retried.
OpenCode's native free models keep the earlier ask policy for compatibility.

The smoke exit codes matter: 0 means success; 1 means the provider worked but the
subject behavior failed (the full matrix still runs); 2 or another infrastructure
failure blocks the matrix. Smoke reports and traces are uploaded even on failure.
A small plain-chat probe is insufficient to validate a multi-step agent's token budget.
