# Using n8n-mcp Skills (OpenCode Router)

Load this entry-point skill before building, editing, validating, testing, or debugging
an n8n workflow. It routes to the relevant specialists, summarizes n8n-mcp tools, and
explains validation, connection verification, and credential handling.

OpenCode V2 discovers this skill by its description and loads it on demand with
`skill({ id: "using-n8n-mcp-skills" })`. OpenCode V1 is not supported.
This adaptation does not install Claude's
SessionStart, PreToolUse, or PostToolUse hooks and does not promise automatic injection.
For a persistent project reminder, merge the optional instruction from
[`examples/n8n-skills-instructions.md`](https://github.com/viliamvolosv/n8n-opencode-skill/blob/main/examples/n8n-skills-instructions.md)
into your project instructions as described in the repository README.

All specialist references remain in their own skill directories. Install the full pack
for the router's cross-skill guidance. Self-hosting has its own trigger and is separate
from workflow building.
