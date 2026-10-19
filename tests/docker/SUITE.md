# Executable skill suite (OpenCode V2)

The only LLM is the model driving OpenCode. OpenCode loads the installed skills and performs a task through real n8n MCP. JavaScript then reads the saved workflow, sends hidden HTTP requests, and checks the corresponding persisted n8n executions. No model grades answers, no rubric or keyword scoring is used, and final prose/JSON formatting cannot decide a workflow test's result.

## Run

Requires Docker Compose 2.24.4+, access to the pinned images, and enough memory for two disposable n8n instances and Python task runners. Configure `LLM_BASE_URL`, `LLM_MODEL_ID`, and optionally `LLM_API_KEY`; the default model is `local/configured`.

```sh
sh scripts/test-integration.sh                         # expression smoke, same verifier
sh scripts/test-suite.sh                               # 14 execution + 1 configuration cases
sh scripts/test-suite.sh --mode live                   # only real workflow execution
sh scripts/test-suite.sh --group agents
sh scripts/test-suite.sh --case live-subworkflows
sh scripts/test-suite.sh --group code-tool,error-handling
sh scripts/test-suite.sh --shard 1/4
sh scripts/test-suite.sh --mode configuration          # self-hosting Compose artifact
sh scripts/test-suite.sh --list
sh scripts/test-suite.sh --self-test                   # unit/fixture tests, no LLM
sh scripts/test-suite.sh --verify-runtime              # real n8n positive/negative controls, no LLM
```

## What determines PASS

Workflow identity is resolved from successful native MCP create IDs and the requested webhook path; a changed display label cannot by itself hide a working workflow. Expected task identity is saved in `task.json`, and owned IDs are tracked for cleanup even after renames.

Each workflow task requires an observed load of the relevant skill, a saved active workflow with the requested contract, correct HTTP status and typed output for **every** hidden input, and a separate successful persisted execution for each input. The verifier tags requests with unique IDs and matches those IDs in the executed Webhook's data. Pre-existing executions, including OpenCode's own debugging attempts, cannot satisfy the checks. Required nodes must actually run in each relevant branch. A missing record fails; an execution error is included in the report and CI log even if HTTP returned 200. If OpenCode is interrupted or reaches its deadline after creating the workflow, the process is stopped and the verifier still tests the saved workflow with fresh inputs. `subjectRun` retains the interruption/error independently; a runtime PASS requires every original assertion to pass, and incomplete or broken tasks remain ERROR. No fresh model run is started.

Node-specific assertions check native Python/JavaScript, binary download, child input configuration, error output wiring, and AI model/tool connection types. Binary workflows may respond through the last node; other tasks retain their explicitly requested Respond node. Child workflows are resolved by their saved workflow ID, not a display-name convention. Compose JSON fences may have explanatory prose before or after them; malformed final JSON blocks are still rejected. MCP validation is saved as diagnostic evidence, but is not the authority for success: it can accept workflows that fail inside n8n. The agent may test and debug before finishing. Its final answer is retained only as diagnostic data.

The default catalog covers all 15 skill groups with 14 real workflow tasks and one explicitly separate self-hosting configuration task. Each workflow task has at least three inputs, including edge cases and random values. These are representative contracts, not exhaustive coverage of every skill instruction.

The 62 imported explanation scenarios and one local routing explanation scenario in `tests/evaluations/` are preserved as reference material and for upstream provenance. They are **not executed**, do not enter coverage counts, and are not silently marked passing. `--mode upstream` is rejected. The previous claim of 78 executed scenarios no longer applies.

## Test the tester

`--self-test` checks selectors, execution correlation, runtime/branch assertions, and protocol fixtures. `--verify-runtime` creates known working expression, binary (last-node response), subworkflow (different child label), Agent/HTTP Tool and Custom Code Tool workflows in a fresh real n8n stack and requires the verifier to accept them. It also creates a workflow with the incorrect AI connection type seen in run 158 and requires the verifier to reject it with the real execution error. Additional controls verify changed display names, persisted outcomes after a stopped subject, current HTTP Tool versions and unavailable advisory MCP validation. These scripted controls never count as OpenCode/skill coverage. Gitea runs these runtime controls before the provider smoke and skill matrix.

## Explicit boundaries

- Agent and Code Tool nodes execute in real n8n. Their OpenAI endpoint is a deterministic local protocol fixture that requests a tool call and returns its actual result. This removes external AI reasoning from the oracle. It is neither an LLM judge nor a test of a commercial model's reasoning.
- Multi-instance routing uses two real n8n/MCP instances and a local `n8n_instances` contract router. It checks staging state and absence on prod, not a proprietary hosted service.
- Self-hosting is a generated Compose artifact checked with `docker compose config` and configuration assertions. It is reported separately and does not claim a deployment, DNS or TLS test.

## Evidence and failures

`test-results/integration/` contains JSON/JUnit reports, OpenCode events, saved workflows, per-input observations, matched execution records, protocol-fixture calls and service logs. `PASS` means every required assertion passed; `FAIL` is a task/output/runtime failure; `ERROR` is a provider/harness failure; `NOT_RUN` is unexecuted work. Exit codes are 0/1/2. Valid task failures are not retried into passes. If OpenCode exits immediately after tool results without a final answer, the harness permits one continuation in the same native session, using only the time remaining from the original deadline. It never starts a fresh subject session or repeats a completed failure. Incomplete Compose sessions are infrastructure errors, not artifact verdicts.

Read-only startup checks retry transient connection/timeouts at most three times, saving each attempt in `preflight.json`; subject tasks are never rerun by this readiness check.

The subject timeout defaults to 600 seconds in the suite and can be set with `SKILL_TEST_TIMEOUT_SECONDS` (maximum 600). The circuit breaker defaults to two infrastructure errors; CI uses 15 so all groups can be attempted. There is no judge model setting or evaluator session. Credentials are ephemeral or passed at runtime, and are redacted from artifacts.

Each run uses a unique Compose project with no published ports and cleans up its containers, volumes and project images. Concurrent runs need separate checkout directories. See [runner setup and cleanup](../ci/README.md). GitHub workflow templates remain disabled.
