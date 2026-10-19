# Configurable local LLM in Gitea

OpenCode V2 runs inside Docker and connects to an OpenAI-compatible endpoint.
Configure these repository Actions secrets in Gitea:

| Secret | Meaning |
|---|---|
| `LLM_BASE_URL` | Server root or API base ending in `/v1`; `/v1` is appended to a root URL |
| `LLM_MODEL_ID` | Exact model ID exposed by the server's `/v1/models` |
| `LLM_API_KEY` | Optional key; leave the secret absent when authentication is disabled |

Gitea's UI rejects empty secret values. An absent `LLM_API_KEY` resolves to an empty
string; the provider omits its API-key setting. Do not store a fake key. If the
server later requires authentication, add the real key as this secret.

Subject and evaluator both select the stable OpenCode alias `local/configured`.
The real URL, model ID and key come from the secrets, not committed workflow values.
The configured model must support tool calls. Before live tests, the runner reads the loaded context from LM Studio
`/api/v1/models` and records it in the report. It uses the loaded instance limit,
not the architecture maximum. Output is capped at 16384 tokens and at one third
of that context; the server must already have the model loaded. No fallback to a hosted model occurs.

The Gitea runner and test containers must be able to reach the LLM server. The
small integration and full 78-scenario suite run automatically for PRs in Gitea.
GitHub test workflows are retained as `.yml.disabled` files and are not executed
by GitHub Actions. Changing secrets does not require editing source files.

For shell runs, export the same variables and run `sh scripts/test-integration.sh`.
OpenCode, MCP and n8n are installed only in Docker. Existing cleanup traps,
CI cleanup steps and the janitor remain in place.

The initial live check reached the server without an API key but was rejected
because its active context was only 8192 tokens (the initial prompt needed 11773).
A larger model loading context must be configured on the inference server; the
OpenCode context declaration alone does not resize the server context.

After loading a larger context, the real Docker scenario completed without
provider errors or timeout. Skill loading, MCP calls and the strict final JSON
contract passed. The overall behavior result remained FAIL because the generated
workflow returned HTTP 500 for all three hidden inputs. The workflow and Docker
resources were cleaned up. This verifies connectivity, not a passing skill suite.

## Verified small scenario on 2026-10-15

An isolated Docker run of commit `a77d7ff` with the configured Qwen 3.8 model
passed all eleven checks, including native skill loading, real MCP operations,
saved workflow validation, activation, strict final JSON and all three hidden
HTTP inputs. The first final answer was valid JSON; format repair was not used.
The workflow and Docker project `n8n-skill-ci-1792083226-2957995` were cleaned up.
This is a standalone Docker result, not a claim that all 78 scenarios passed
or that queued Gitea jobs have completed. After successful small integration runs, full-suite PR checks were re-enabled at the user’s request.

The endpoint must expose `/api/v1/models` with a matching loaded instance and
its `config.context_length`. Missing metadata or an unloaded model is a clear
infrastructure error; the runner does not reload models or silently guess a larger
context. See [run 154 analysis](run-154-diagnosis.md) for the discovery, compaction
and evaluator changes and their targeted verification.
