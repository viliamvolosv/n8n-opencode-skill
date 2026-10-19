# n8n skill routing (OpenCode V2 only)

For n8n workflow tasks, first load `using-n8n-mcp-skills` through the native
`skill` tool, then load the specialist skills relevant to the current step.
Use `skill({ id: "using-n8n-mcp-skills" })`; OpenCode V1 is not supported.
Self-hosting and deployment tasks use `n8n-self-hosting` directly.

Skills load on demand. This pack does not install Claude Code hooks or inject
every skill into the session. After compaction, reload any guidance needed for
the next n8n action if it is no longer in context.

Examples in the skills use logical n8n-mcp tool names. Use the actual tool names
and schemas exposed by the connected server. If a skill differs from the live
schema, follow the live schema and report the discrepancy.
