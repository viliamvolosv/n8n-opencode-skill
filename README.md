# n8n OpenCode V2 Skills

**Requires OpenCode V2 (2.x). OpenCode V1 is not supported.**

An OpenCode V2 adaptation of [czlonkowski/n8n-skills](https://github.com/czlonkowski/n8n-skills), by Romuald Członkowski. The pack contains **14 specialist skills and one router** for building n8n workflows with [n8n-mcp](https://github.com/czlonkowski/n8n-mcp) and deploying self-hosted n8n.

Synced from upstream **v1.35.0**, commit [`cb6caa7`](https://github.com/czlonkowski/n8n-skills/commit/cb6caa7b3ae8d4206c768d7f69f598438ef25595), dated 2026-10-09. Exact provenance and source-file SHA-256 hashes are recorded in [upstream.json](upstream.json).

These are instruction files and supporting references, not Python wrappers around MCP tools. OpenCode loads the relevant skill on demand; n8n-mcp supplies the actual tools. No Python packages are required to use the skills.

## Installation instructions for agents

When asked to install this pack, follow these steps:

1. Require **OpenCode V2 (2.x)**. V1 is unsupported. If V2 is missing, report
   the prerequisite; install OpenCode itself only when the user requests it.
2. Use project installation by default: copy the **contents** of this repository's
   `skills/` into `<target-project>/.opencode/skills/`. Use
   `~/.config/opencode/skills/` only when the user requests global installation.
   Copy all 15 skill directories, including their references and assets; do not
   create an extra nested `skills/skills/` directory.
3. Preserve unrelated installed skills. For an update, replace only this pack's
   skill directories so removed references do not remain. Preserve any local
   modifications before replacing them, and avoid duplicate installations.
4. Configure the community **n8n-mcp** server separately in the target project's
   `opencode.json`, using one of the [MCP examples below](#connect-n8n-mcp).
   Merge into existing `mcp.servers`; preserve other settings and reuse a suitable
   existing connection. Ask for missing connection details rather than inventing
   them. Keep credentials in environment variables or a secret manager.
5. If requested, merge [the router reminder](examples/n8n-skills-instructions.md)
   into the target project's `AGENTS.md`, preserving its existing instructions.
6. Check that each installed directory contains `SKILL.md` and its supporting
   files. If OpenCode V2 is available in the user's chosen runtime, use
   `opencode mcp list` to inspect the MCP configuration. Report the installation
   path, changes made and any unverified connection requirements. Do not create
   workflows, run deployment assets or start the repository's CI suite merely
   to install the skills.

The LLM connection settings used by this repository's CI are **not required
for installing or using the skills** with the user's own configured model.

## Install

Install OpenCode V2 using the [official V2 installation instructions](https://dev.opencode.ai/v2/docs/):

```bash
npm install -g @opencode/cli
```

This repository targets **OpenCode V2 only**. OpenCode V1 is not supported, tested, or maintained. Upgrade to V2 before using this pack; the previous V1 configuration format and skill invocation examples are no longer provided.

### Project skills

Run from the project where you want to use the skills:

```bash
git clone https://github.com/viliamvolosv/n8n-opencode-skill.git /tmp/n8n-opencode-skill
mkdir -p .opencode/skills
cp -R /tmp/n8n-opencode-skill/skills/. .opencode/skills/
```

To install globally instead:

```bash
mkdir -p ~/.config/opencode/skills
cp -R /tmp/n8n-opencode-skill/skills/. ~/.config/opencode/skills/
```

To install one skill, copy its entire directory, including references and assets. The router references the full pack, so installing all skills is recommended.

**Migration from this repository's previous version:** source folders moved from `skill/` to `skills/`. The current documented project installation path is `.opencode/skills/`. Install into the plural `skills/` directory and keep only one installed copy of each skill. Remove the three obsolete Python references (`DATA_ACCESS.md`, `ERROR_PATTERNS.md`, `STANDARD_LIBRARY.md`) from an old `n8n-code-python` installation when updating it; their Pyodide guidance no longer applies. Other upstream removals are tracked by the source snapshot.

### Connect n8n-mcp

Configure MCP once at the project root, not inside each skill. Both examples use V2's `mcp.servers` format. Merge the chosen example into an existing config instead of overwriting your settings:

| Runtime | Example |
|---|---|
| Local npx server | [opencode.json.example](opencode.json.example) |
| Docker server over stdio | [opencode.json.mcp-in-docker.example](opencode.json.mcp-in-docker.example) |

For a new project without an existing config:

```bash
cp /tmp/n8n-opencode-skill/opencode.json.example ./opencode.json
```

The local example starts `npx -y n8n-mcp`, so it requires Node.js/npm. Export `N8N_API_URL` and `N8N_API_KEY` before starting OpenCode if you want live workflow management. Create the API key in n8n's Settings → API. Config examples use OpenCode's `{env:VARIABLE}` substitution and contain no credentials.

```bash
export N8N_API_URL=http://localhost:5678
# Set N8N_API_KEY in your shell or secret manager, then:
opencode mcp list
opencode
```

Documentation, node search, templates, and offline validation work without an n8n API connection. To use just those tools, omit `N8N_API_URL` and `N8N_API_KEY` from the example's `environment`. Live management tools depend on the connected server version, n8n version, permissions, and enabled features. Use the live tool schemas when they differ from the references.

The community **n8n-mcp** server is separate from n8n's built-in instance-level MCP endpoint (`/mcp-server/http`). Connecting only the built-in endpoint does not provide this pack's community tools, such as `search_nodes` and `validate_workflow`.

### Router reminder (optional)

This adaptation does not ship Claude Code's SessionStart, PreToolUse, or PostToolUse hooks. OpenCode discovers skill descriptions and loads bodies on demand. To remind the agent to consult the router for n8n tasks, merge [examples/n8n-skills-instructions.md](examples/n8n-skills-instructions.md) into your project's `AGENTS.md`. For a new project without an existing `AGENTS.md`:

```bash
cp /tmp/n8n-opencode-skill/examples/n8n-skills-instructions.md ./AGENTS.md
```

Use `AGENTS.md` for V2 guidance: the `instructions` config field is currently accepted by the schema but does not resolve or load files. V2 also does not use `CLAUDE.md` as a fallback. See the [V2 instruction documentation](https://dev.opencode.ai/v2/docs/instructions/).

This is a persistent instruction, not a tool-call enforcement hook. Specialist content remains loaded on demand. Self-hosting routes directly to `n8n-self-hosting`.

## Available skills

| Skill | Purpose |
|---|---|
| [using-n8n-mcp-skills](skills/using-n8n-mcp-skills/SKILL.md) | Entry point: choose specialists and understand the tool surface |
| [n8n-mcp-tools-expert](skills/n8n-mcp-tools-expert/SKILL.md) | Discovery, validation, workflow edits, credentials, operations |
| [n8n-expression-syntax](skills/n8n-expression-syntax/SKILL.md) | Expressions, item access, mapping and transform decisions |
| [n8n-workflow-patterns](skills/n8n-workflow-patterns/SKILL.md) | Workflow architecture, connections and performance |
| [n8n-validation-expert](skills/n8n-validation-expert/SKILL.md) | Validation errors, warnings, false positives and review |
| [n8n-node-configuration](skills/n8n-node-configuration/SKILL.md) | Operation-specific fields, dependencies and node pitfalls |
| [n8n-code-javascript](skills/n8n-code-javascript/SKILL.md) | JavaScript Code nodes, helpers and return shapes |
| [n8n-code-python](skills/n8n-code-python/SKILL.md) | Native Python in n8n 2.x, migration from Pyodide, sandbox limits |
| [n8n-code-tool](skills/n8n-code-tool/SKILL.md) | AI-agent Custom Code Tool: query input and string output |
| [n8n-error-handling](skills/n8n-error-handling/SKILL.md) | Error outputs, retries, Error Trigger and API responses |
| [n8n-binary-and-data](skills/n8n-binary-and-data/SKILL.md) | Files, binary data, Merge and agent-tool boundaries |
| [n8n-subworkflows](skills/n8n-subworkflows/SKILL.md) | Reusable workflows, typed inputs and execution modes |
| [n8n-agents](skills/n8n-agents/SKILL.md) | AI agents, tools, memory, structured output, RAG and review |
| [n8n-multi-instance](skills/n8n-multi-instance/SKILL.md) | Choose and verify the target n8n instance |
| [n8n-self-hosting](skills/n8n-self-hosting/SKILL.md) | Docker/Caddy deployment, queue mode, task runners and backups |

The updated Python skill uses `_items` / `_item` for native Python, replacing legacy `_input`, `_json`, and `_node`. Code Tool is distinct from a Code node and returns a string. JavaScript guidance uses `this.helpers` rather than assuming a bare `$helpers` global exists in the task-runner sandbox.

## OpenCode V2 support

**OpenCode V1 is not supported.** All installation instructions, invocation examples and MCP configurations target V2.

- Install directory-based skills into `.opencode/skills/` or `~/.config/opencode/skills/`.
- Load with `skill({"id":"n8n-mcp-tools-expert"})`, or mention `@n8n-mcp-tools-expert` in a prompt.
- V2 derives the skill ID from the path; frontmatter `name` is a display label. This pack keeps them aligned with unique lowercase hyphenated IDs.
- MCP servers live under `mcp.servers`, use `disabled` to disable a server, and use a timeout object with `startup`, `catalog`, and/or `execution`.
- Skill permission rules use `permissions` with action `skill` and the skill ID as `resource`.
- Supporting references are relative to each skill's directory and are read on demand.

Examples in the n8n guides use logical server tool names. V2 exposes MCP tools through Code Mode by default; a hyphenated server name uses bracket access, for example `tools["n8n-mcp"].get_node(...)`. Use the actual namespace and live schemas exposed by your session; Claude's `mcp__server__tool` spelling is not an OpenCode invocation contract. Automatic skill discovery remains enabled.

Sources checked 2026-10-13: [V2 skills](https://dev.opencode.ai/v2/docs/skills/), [V2 MCP](https://dev.opencode.ai/v2/docs/mcp-servers/), [V2 instructions](https://dev.opencode.ai/v2/docs/instructions/), [V2 installation](https://dev.opencode.ai/v2/docs/).

## Local Docker development

```bash
docker compose up -d n8n
```

[docker-compose.yml](docker-compose.yml) starts n8n at `http://localhost:5678` with persistent storage. It is a local development example. For production deployment or native Python runner setup, use the self-hosting skill's assets and guidance.

OpenCode starts n8n-mcp separately over stdio, either using the npx example or the Docker example. A standalone stdio container with a published port is not an HTTP MCP server. The Docker example uses `docker run --rm -i` without a pseudo-TTY and accesses local n8n via `host.docker.internal`; its API key comes from the client environment. Pull the image before the first connection if startup takes longer than the configured timeout:

```bash
docker pull ghcr.io/czlonkowski/n8n-mcp:latest
```

## Maintaining the adaptation

The runtime tests run **OpenCode V2, real n8n and n8n-mcp inside Docker**.
They require Docker with Compose; OpenCode does not need to be installed on the
host. Run commands from this repository's root.

CI uses a configured OpenAI-compatible LLM through Gitea repository Actions
secrets: `LLM_BASE_URL`, `LLM_MODEL_ID`, and optional `LLM_API_KEY`. URL and model
are required; an unset API-key secret means no authentication. For shell runs,
set the same environment variables. See [local LLM setup](docs/ci/local-llm-setup.md).
GitHub Actions tests are disabled.

For one end-to-end scenario:

```bash
# LLM_BASE_URL and LLM_MODEL_ID must already be set; LLM_API_KEY is optional.
sh scripts/test-integration.sh
```

The disposable stack asks the model to load a skill and create, validate and
activate a webhook workflow through MCP. The grader checks the saved workflow,
three real HTTP responses and their successful n8n execution records. Temporary n8n/MCP
credentials are generated automatically; the provider key is supplied separately.
Containers, networks and volumes for the test project are removed afterward.
Reports and traces are saved under `test-results/integration/`.
See [the integration guide](tests/docker/INTEGRATION.md).

The [full suite](tests/docker/SUITE.md) contains **14 real n8n execution tasks and
one separate Compose configuration task**. The LLM drives OpenCode; ordinary code
checks saved workflows and each hidden input’s execution. There is no LLM evaluator.
The 63 former text scenarios are archived reference material, not runtime coverage.

```bash
sh scripts/test-suite.sh
# Or run one skill group:
sh scripts/test-suite.sh --group expression-syntax
```

Gitea runs the integration, harness and full-suite checks for pull requests.
The full suite also supports manual dispatch and runs all 15 groups. Model-free positive and negative runtime controls first verify the test harness.
A real n8n smoke scenario then checks provider availability. Infrastructure errors block the
suite; a model behavior failure is recorded and allows the remaining groups to
run. See [CI configuration and cleanup](tests/ci/README.md).

Free-model availability and quotas can change. A provider or quota error is
reported as `ERROR`; an unmet scenario requirement is `FAIL`. These tests measure
the selected model using the installed skills, so a run is not a guarantee that
every model will produce the same result. Inspect JSON/JUnit artifacts for actual
results.

For model-free regression and catalog checks, also inside Docker:

```bash
sh scripts/test-suite.sh --self-test
```

The synchronization script imports `skills/`, supporting references/assets, upstream evaluation JSON, and attribution files. It does not import Claude plugin manifests, hooks, or `.mcp.json`. It preserves executable asset permissions and applies a small set of explicit adaptations for OpenCode. The old `skill/` source tree and obsolete Python references have been removed.

The files under `tests/evaluations/upstream/` are retained as a reference for
future upstream updates. Compare changes to these scenarios to identify new
guidance and gaps worth covering in our executable tests. Their hashes in
`upstream.json` verify that the imported copies are unchanged; they do not prove
skill behavior. These scenarios are not executed or graded by an LLM.

To update from another revision, use a clean upstream checkout:

```bash
git clone https://github.com/czlonkowski/n8n-skills.git /tmp/n8n-skills-upstream
# Review and check out the desired upstream commit first.
python3 scripts/sync_upstream.py /tmp/n8n-skills-upstream
python3 -m venv /tmp/n8n-skills-check
/tmp/n8n-skills-check/bin/pip install -r scripts/requirements-dev.txt
/tmp/n8n-skills-check/bin/python scripts/validate_skills.py
```

The importer **replaces the maintained `skills/` tree**; keep local adaptations in the script, and review the diff before committing. It fails when a targeted upstream passage changes, so an update cannot silently skip those adaptations. The manifest records the original file hashes before transformation. Skill assets include executable deployment helpers; copying or synchronizing them does not run them.

After importing, review changes to skills and upstream scenarios, update the
OpenCode adaptations and executable cases in `tests/docker/live-cases.mjs` where
needed, then run the static validator and these checks:

```bash
sh scripts/test-suite.sh --self-test
sh scripts/test-suite.sh --verify-runtime
# Requires the configured LLM environment described above:
sh scripts/test-suite.sh
```

Keep the synchronization script, provenance manifest, validator, licenses and
runtime tests alongside the skills so future updates remain reviewable and
testable.

Validation checks YAML frontmatter, OpenCode names and description limits, relative documentation links, cross-skill references, configuration examples and snapshot file coverage. Docker runtime results are reported per run; see the JSON/JUnit artifacts for actual pass/fail status. See [docs/TESTING.md](docs/TESTING.md) for the prepared V2 verification procedure.

## License and credits

MIT; see [LICENSE](LICENSE). Upstream content is © 2025 Romuald Członkowski; its license is preserved in [UPSTREAM-LICENSE](UPSTREAM-LICENSE). [NOTICES](NOTICES) records attribution for the included skill materials and the upstream statement about the router's borrowed structure. [NOTICES-APACHE-2.0.txt](NOTICES-APACHE-2.0.txt) preserves the accompanying license text; it does not change this project's MIT license. Claude plugin hooks are not included. OpenCode-specific changes are maintained in this repository.
