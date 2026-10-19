# Integration smoke

Run `sh scripts/test-integration.sh` with `LLM_BASE_URL`, `LLM_MODEL_ID` and optional `LLM_API_KEY` configured. This runs `live-expression-syntax` through the same deterministic verifier as the full suite: OpenCode loads the skill and builds the workflow; code checks saved n8n state, three hidden HTTP inputs and their correlated successful execution records. Answer formatting is not graded and there is no evaluator LLM or format-repair model call.

The smoke uses the disposable suite stack and the same artifact paths, cleanup, provider validation and exit codes. See [SUITE.md](SUITE.md). `scripts/test-provider.sh` allows a completed behavioral failure to continue to the matrix, but blocks on infrastructure/provider errors.
