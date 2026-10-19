# OpenCode V2 verification plan

**Only OpenCode V2 (2.x) is supported. OpenCode V1 is not supported.**

This document describes verification procedures, not a passing test report for
the full pack. The [full Docker suite](../tests/docker/SUITE.md) runs 14 actual n8n workflow tasks and one separate Compose configuration check, with no LLM evaluator. Run `sh scripts/test-suite.sh`; use `--group code-python` for a smaller selection. Gitea runs the full suite, integration and harness checks for pull requests; manual dispatch is also available. GitHub tests are disabled.

## Minimal automatic Docker test

For a real n8n and MCP test, use:

```bash
sh scripts/test-integration.sh
```

It creates a workflow through MCP and grades three actual webhook responses.
See [the integration guide](../tests/docker/INTEGRATION.md) for the CI setup,
automatic bootstrap, cleanup and report artifacts.

The former answer-only smoke has been removed. Test the assertions themselves with
`sh scripts/test-suite.sh --self-test` and verify them against known working and
broken real n8n workflows with `sh scripts/test-suite.sh --verify-runtime`. Neither
command calls an LLM. Runtime controls do not count as OpenCode skill coverage.

## 1. Static checks

Use Python 3.9+ for the maintenance scripts. Python is not a runtime dependency
for the installed OpenCode skills.

```bash
python3 -m venv /tmp/n8n-skills-check
/tmp/n8n-skills-check/bin/pip install -r scripts/requirements-dev.txt
/tmp/n8n-skills-check/bin/python scripts/validate_skills.py
git diff --check
```

The checker covers skill IDs and names, YAML descriptions, V2-only compatibility
declarations, reference links, router targets, upstream file coverage, and both
V2 MCP examples. It does not prove model behavior, MCP connectivity, or the
correctness of deployed n8n workflows.

To review synchronization against the recorded revision, use a clean checkout of
`czlonkowski/n8n-skills` at the `commit` in `upstream.json`. The importer replaces
`skills/`; run it in a disposable copy of this repository when reviewing whether
the generated files match. Compare that output with the prepared working tree.
Confirm the removed legacy Python references do not reappear and executable
self-hosting assets retain their permissions. Do not execute deployment assets
as part of static validation.

## 2. Discovery and skill loading in OpenCode V2

Confirm `opencode --version` reports **2.x**. The npm package is `@opencode/cli`.
Do not use the older `opencode-ai` package for these checks.

Create a disposable project, install the complete `skills/` tree into
`.opencode/skills/`, and merge the optional router reminder into `AGENTS.md`.
Start OpenCode V2 there with `opencode --standalone` for a private server. This
pack requires no Claude plugins or hooks.

Use these prompts with MCP disconnected first:

| Prompt | Expected observation |
|---|---|
| `@using-n8n-mcp-skills Explain which skills handle webhook validation.` | Loads the router by ID; routes to workflow, expression, error handling and validation specialists as needed |
| `@n8n-code-python Migrate _input.all() to native Python in an n8n 2.x Code node.` | Uses `_items`, dictionary access, and import-free code; does not read removed Pyodide references |
| `@n8n-code-tool Explain the return value for a JavaScript AI Code Tool.` | Distinguishes the Code Tool from the Code node; returns a string rather than an item array |
| `@n8n-self-hosting List the available deployment templates without deploying anything.` | Reads supporting assets relative to the skill directory; makes no deployment changes |

Inspect tool calls: the native skill tool must receive `id`, not `name`.
References should resolve from each skill's base directory. Recheck after
compaction that needed guidance can be reloaded. The router reminder is an
instruction, not a guaranteed hook or automatic context injection.

## 3. MCP connection and read-only smoke checks

Merge either `opencode.json.example` (npx) or
`opencode.json.mcp-in-docker.example` into the disposable project's config.
Both put the server under `mcp.servers`, use V2 timeout objects, and read the API
key from the environment. Ensure there is no V1 `enabled` field or numeric
timeout. Keep the existing project's config and secrets out of this test copy.

Use the documentation-only setup first: omit `N8N_API_URL` and `N8N_API_KEY`
from the example's `environment`. Check `opencode mcp list`, then ask the agent
to call `tools_documentation`, `search_nodes`, and `get_node` through the actual
connected tool namespace. In default V2 Code Mode, a server named `n8n-mcp`
needs bracket access, for example `tools["n8n-mcp"].get_node(...)`.

Confirm the server advertises the expected schemas and returns node information.
An unavailable live-management tool should produce an explanation of the missing
API connection or server capability, rather than a guessed call.

For live read checks, connect a dedicated development n8n instance with a
read-only API key, then use `n8n_health_check` and `n8n_list_workflows` if those
tools are available. Do not run create/update/delete, credential writes,
workflow tests, evaluations, activation, or deployment during this smoke check.

For Docker, pull the image before connecting. Verify stdin/stdout transport with
`docker run --rm -i` and no pseudo-TTY. The development Compose file starts only
n8n; OpenCode owns the separate MCP process. A published port does not turn a
stdio server into an HTTP endpoint.

## Record the result

Record the exact OpenCode V2, n8n-mcp and n8n versions, chosen installation path,
static-check output, discovery/loading observations, and read-only MCP results.
Report untested capabilities separately. Live workflow behavior requires its own
authorized tests with representative data and output inspection.

