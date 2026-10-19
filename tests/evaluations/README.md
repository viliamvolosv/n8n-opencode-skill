# Archived explanation scenarios

These 62 upstream and one local scenario are reference material, not executable tests. Upstream files remain unchanged and their hashes are checked by `scripts/validate_skills.py` for provenance.

The executable catalog is `tests/docker/live-cases.mjs`: OpenCode performs the task, then code verifies real n8n state, HTTP outputs and correlated execution records. There is no LLM evaluator. Historical explanation scenarios are not counted as passing tests or runtime coverage. See `tests/docker/SUITE.md`.
