# n8n skill tests

The LLM drives OpenCode to perform tasks using installed skills and real n8n MCP. Code determines success by inspecting saved workflows, hidden HTTP outputs and corresponding n8n execution records. No LLM evaluates the answer.

- `sh scripts/test-integration.sh`: one real expression workflow task.
- `sh scripts/test-suite.sh`: 14 real workflow tasks plus one separate Compose configuration task.
- `sh scripts/test-suite.sh --self-test`: model-free unit and local protocol tests.
- `sh scripts/test-suite.sh --verify-runtime`: model-free positive and negative controls against real n8n.

See [SUITE.md](SUITE.md) for contracts, configuration, evidence and limitations.

The former answer-only `docker-compose.test.yml`/`run.mjs` test has been removed. Use `--group code-tool` to verify a real Custom Code Tool in n8n.
