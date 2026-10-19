#!/usr/bin/env python3
"""Import skills from a local upstream checkout, with explicit OpenCode adaptations."""
import argparse
import hashlib
import json
import re
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

NOTICES = """NOTICES — n8n OpenCode V2 Skills

This OpenCode V2 adaptation includes skill text, references and assets from:

  czlonkowski/n8n-skills
  https://github.com/czlonkowski/n8n-skills
  Copyright (c) Romuald Członkowski (AiAdvisors)
  Licensed under the MIT License; see UPSTREAM-LICENSE.

OpenCode-specific modifications include skill invocation and routing guidance,
configuration examples, installation documentation and maintenance scripts.
The source revision is recorded in upstream.json. This project is licensed
under MIT; see LICENSE.

Upstream's attribution states that the document structure of
skills/using-n8n-mcp-skills borrows from the using-n8n-skills meta-skill in:

  n8n-io/skills
  https://github.com/n8n-io/skills
  Copyright n8n GmbH and contributors
  Licensed under the Apache License, Version 2.0.

Upstream describes the router's prose as original to czlonkowski/n8n-skills.
This notice retains that provenance statement. A copy of Apache License 2.0
is retained in NOTICES-APACHE-2.0.txt alongside it; this does not change this
project's MIT license or assert that every skill is Apache-licensed.

Claude Code plugin manifests and hook implementations are not included in
this distribution. Their upstream file listings and implementation notes
have therefore been omitted from this notice.
"""


def replace_once(text, old, new):
    if text.count(old) != 1:
        raise ValueError(f"Upstream changed; review adaptation: {old[:80]!r}")
    return text.replace(old, new, 1)


def adapt(path, text):
    if path.name == "SKILL.md":
        # These upstream headers use single-line YAML scalars. Quote descriptions
        # for portability (including colons and inline quotes in future releases).
        header, body = text[4:].split("\n---\n", 1)
        fields = dict(line.split(": ", 1) for line in header.splitlines())
        if set(fields) != {"name", "description"}:
            raise ValueError(f"Review new upstream frontmatter: {path}")
        description = fields["description"]
        if description.startswith('"'):
            description = json.loads(description)
        text = (f"---\nname: {fields['name']}\ndescription: "
                f"{json.dumps(description, ensure_ascii=False)}\nlicense: MIT\n"
                f"compatibility: OpenCode V2 (2.x); OpenCode V1 is not supported.\n---\n{body}")
    if str(path) == "using-n8n-mcp-skills/SKILL.md":
        text = replace_once(text, "Skill tool. When in doubt, load more skills rather than fewer.",
                            '`skill` tool: `skill({ id: "n8n-mcp-tools-expert" })`. This pack targets\nOpenCode V2 only; V1 is not supported. Load the skills relevant to the current\nstep; read supporting references relative to each skill directory.')
        text = replace_once(text,
            "   connection, or writing Code, invoke the matching skill. PreToolUse hooks remind you on\n"
            "   the highest-impact tool calls, but they exist **only in the Claude Code plugin\n"
            "   install**. Everywhere else — Claude.ai skill uploads, and any client that loads this\n"
            "   pack as an Agent Plugin (Codex, Cursor, Copilot and the rest) — nothing nudges you and\n"
            "   the responsibility is entirely yours. Assume you are un-hooked unless you have seen a\n"
            "   hook fire this session.",
            "   connection, or writing Code, load the matching skill through OpenCode's `skill` tool.\n"
            "   This distribution has no SessionStart, PreToolUse, or PostToolUse hooks. Skills load\n"
            "   on demand; do not assume the router or specialist guidance is already in context.\n"
            "   The optional project instruction in `examples/n8n-skills-instructions.md` reminds\n"
            "   OpenCode to consult this router before n8n workflow work.")
        text = replace_once(text, "This router (auto-loaded).", "This router (loaded on demand).")
        text = replace_once(text,
            "Qualified names look like `mcp__<server>__<tool>` (`<server>` is usually `n8n-mcp`). This\n"
            "closes the gap where a tool's full description isn't loaded until first use.",
            "Examples below use the server's logical tool names (such as `get_node`). OpenCode\n"
            "qualifies MCP tools with the configured server name. Use the actual exposed tool\n"
            "name and schema from your session; do not copy Claude's `mcp__<server>__<tool>` names.\n"
            "If a tool is absent, check the connection and server version before proceeding.")
    if str(path) == "using-n8n-mcp-skills/README.md":
        text = """# Using n8n-mcp Skills (OpenCode Router)

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
"""
    if str(path) == "n8n-expression-syntax/SKILL.md":
        text = replace_once(text, "## Expression Format", '## JSON response fields at runtime\n\nWorkflow-schema validation does not execute expressions or prove that a response\nbody is valid JSON. For Respond to Webhook with `respondWith: "json"`, construct\none complete object expression, or serialize the whole object with\n`JSON.stringify`. For example, an API `responseBody` value can be:\n\n```text\n={{ JSON.stringify({ label: $json.body.label, value: $json.body.value }) }}\n```\n\nDo not interpolate an unquoted string expression into JSON text such as\n`{"label": {{ $json.body.label }}}`: a string becomes invalid JSON, and manually\nadding quotes still breaks for embedded quotes or newlines. Whole-object\nserialization preserves escaping and numeric types. In saved workflow JSON,\nexpression fields require the leading `=`. Consult the live node schema for\nmachine parameter names rather than translating UI labels. Execute a real\nrequest and inspect execution errors before claiming the workflow works.\n\n## Expression Format')
    if str(path) == "n8n-binary-and-data/SKILL.md":
        text = replace_once(text, "## The three rules that prevent 90% of binary bugs", "## Preserve request data when downloading files\n\nA Webhook's JSON request fields live under `$json.body`. When an HTTP Request\nimmediately follows a Webhook, build its POST body from those nested fields;\n`$json.text` is not the caller's text unless an earlier node explicitly moved it.\nAfter the HTTP Request, read the downloaded bytes from `$binary` with the binary\nhelper. Do not assume the response still carries the original request fields in\n`$json`. Test with distinct caller inputs: a valid download of the server's\nfallback file does not prove that the request body was forwarded correctly.\n\n## The three rules that prevent 90% of binary bugs")
    if str(path) == "n8n-agents/SKILL.md":
        heading = text.index("\n## ") + 1
        text = text[:heading] + "## Prompts sourced from Webhook requests\n\nWhen an Agent follows a Webhook, caller JSON is under `$json.body`, not at the\nroot of `$json`. Set an explicit Agent prompt from the caller's body (for example\n`={{ JSON.stringify($json.body) }}` for a structured request). Serializing the\nentire Webhook item sends transport headers, params and an extra `body` envelope\ninstead of the requested user input. Read the actual incoming item before\nchoosing a field; use a Chat Trigger's input field only for Chat Trigger flows.\n\n" + text[heading:]
    if str(path) == 'n8n-node-configuration/SKILL.md':
        text = replace_once(text, '## Configuration Philosophy', '## Preserve data across Webhook and HTTP Request nodes\n\n`$json` refers to the current node\'s input, not one fixed request object throughout\nthe workflow. In a direct Webhook → HTTP Request → Respond to Webhook chain:\n\n1. At HTTP Request, the caller\'s JSON is `$json.body`. With the current HTTP\n   Request node, POST JSON uses `sendBody: true`, `contentType: "json"`,\n   `specifyBody: "json"`, and `jsonBody: "={{ $json.body }}"`. Sending `={{ $json }}`\n   forwards the entire Webhook transport envelope (headers, query and body).\n2. At Respond to Webhook, `$json` is now the upstream HTTP response JSON (when\n   full-response mode is disabled). To return that response unchanged, use\n   `respondWith: "json"` and `responseBody: "={{ $json }}"`.\n3. Do not rebuild an upstream response from `$(\'Webhook\').first().json.body`.\n   That discards fields produced by the server. A payload field named `method`\n   is user data, not proof of the HTTP method; preserve the upstream server\'s\n   response when that is the requested output.\n\nConsult the live schema for the selected node version, especially full-response\noptions. During testing, compare the complete required response with the real\nHTTP Request output, including zero values and server-added fields. An HTTP 200\nor schema validation alone does not establish the output contract.\n\n## Configuration Philosophy')
    if str(path) == 'n8n-mcp-tools-expert/SKILL.md':
        text = replace_once(text, '## Tool Categories', '## Finish the task without repeated read loops\n\nTool results are intermediate evidence. After loading a skill or reading a\nschema, continue with the requested creation, repair or artifact rather than\nending on a plan to do it. Retain actual workflow IDs from successful calls.\n\nWhen a filtered `n8n_get_workflow` read returns no matching nodes, first read\n`mode: "structure"` once to obtain the exact saved node names, then fetch the\nneeded configuration. Repeating the same unchanged read does not fix a workflow.\nAfter an execution failure, inspect the execution error, make a concrete change,\nthen test the changed workflow. Stop reading once the required saved state and\noutputs have been verified; provide the artifact or a clear account of failure.\n\nFor an HTTP Request followed by Respond to Webhook, the HTTP node\'s output is\nthe upstream response. Return that data rather than reconstructing it from the\noriginal Webhook request. See **n8n-node-configuration** for the stage-specific\nbody and response mapping.\n\n## Tool Categories')
    if str(path) == 'n8n-agents/SKILL.md':
        text = replace_once(text, '## Prompts sourced from Webhook requests', '## AI connection JSON: both port types must match\n\nAn AI sub-node connects **to** its Agent. In saved workflow JSON, both the\nconnection-map key and every nested edge\'s `type` must identify the AI socket:\n\n```json\n{\n  "Chat Model": {\n    "ai_languageModel": [[{"node": "AI Agent", "type": "ai_languageModel", "index": 0}]]\n  },\n  "Code Tool": {\n    "ai_tool": [[{"node": "AI Agent", "type": "ai_tool", "index": 0}]]\n  }\n}\n```\n\nReplace these example node names with the exact saved names. `main` belongs to\nordinary workflow-flow edges; it is **wrong inside either AI edge above**. A\ncorrect `ai_languageModel` map key with nested `type: "main"` still leaves the\nmodel disconnected at runtime. Likewise, an `ai_tool` key with `type: "main"`\ndoes not attach the tool. Schema validation may accept this malformed topology.\n\nIf n8n says **"A Chat Model sub-node must be connected and enabled"** while a\nmodel node exists, read the saved workflow\'s full `connections` and check these\nedge types plus the nodes\' `disabled` flags first. Fix the connection data,\nvalidate, publish/activate the changed workflow, and run a new execution. Repeated\nmodel-parameter schema reads cannot repair a connection-type mismatch. When\nusing MCP connection operations, inspect the exposed schema and explicitly set\nboth AI source and target ports; verify the resulting saved JSON afterward.\n\n## Prompts sourced from Webhook requests')
    if str(path) == 'n8n-code-tool/SKILL.md':
        text = replace_once(text, '## ⚠️ This is NOT the Code node', '## AI connection JSON: both port types must match\n\nAn AI sub-node connects **to** its Agent. In saved workflow JSON, both the\nconnection-map key and every nested edge\'s `type` must identify the AI socket:\n\n```json\n{\n  "Chat Model": {\n    "ai_languageModel": [[{"node": "AI Agent", "type": "ai_languageModel", "index": 0}]]\n  },\n  "Code Tool": {\n    "ai_tool": [[{"node": "AI Agent", "type": "ai_tool", "index": 0}]]\n  }\n}\n```\n\nReplace these example node names with the exact saved names. `main` belongs to\nordinary workflow-flow edges; it is **wrong inside either AI edge above**. A\ncorrect `ai_languageModel` map key with nested `type: "main"` still leaves the\nmodel disconnected at runtime. Likewise, an `ai_tool` key with `type: "main"`\ndoes not attach the tool. Schema validation may accept this malformed topology.\n\nIf n8n says **"A Chat Model sub-node must be connected and enabled"** while a\nmodel node exists, read the saved workflow\'s full `connections` and check these\nedge types plus the nodes\' `disabled` flags first. Fix the connection data,\nvalidate, publish/activate the changed workflow, and run a new execution. Repeated\nmodel-parameter schema reads cannot repair a connection-type mismatch. When\nusing MCP connection operations, inspect the exposed schema and explicitly set\nboth AI source and target ports; verify the resulting saved JSON afterward.\n\n## ⚠️ This is NOT the Code node')
    if str(path) == 'n8n-subworkflows/SKILL.md':
        text = replace_once(text, '## The two non-negotiables', '## Map caller values without an extra value/type wrapper\n\nFor a typed child input, the type belongs in the trigger\'s\n`workflowInputs.values` and the caller\'s schema metadata. The caller\'s\n`workflowInputs.value` contains the actual value or expression directly:\n\n```json\n{\n  "workflowInputs": {\n    "mappingMode": "defineBelow",\n    "value": {"amount": "={{ $json.body.amount }}"},\n    "schema": [{"id": "amount", "displayName": "amount", "type": "number"}]\n  },\n  "mode": "each",\n  "options": {"waitForSubWorkflow": true}\n}\n```\n\nThis example assumes the caller immediately follows a Webhook, whose request\nfields are under `$json.body`. For another upstream node, inspect its item and\nuse its actual field path. Do not map the input to\n`{"amount": {"value": "...", "type": "number"}}`: that passes an object where\nthe child expects a number and may prevent publication. No truthiness default\nis needed; zero is a valid number.\n\nTo repair mapping configuration, use `n8n_update_partial_workflow` with\n`{type: "updateNode", nodeId: "<saved caller node ID>", updates: {"parameters.workflowInputs": <correct mapping object>}}`.\nAn `updateNode` operation requires `updates`, not a nested replacement `node`.\n`patchNodeField` performs text find/replace patches; it is not JSON Patch with\n`op`, `fieldPath` and `value`. Read the live tool schema before using it.\n\n## The two non-negotiables')
    if str(path) == 'n8n-mcp-tools-expert/SKILL.md':
        text = replace_once(text, '## Finish the task without repeated read loops', "## Preserve workflow identity and labels during updates\n\nUse the ID returned by `n8n_create_workflow` for all subsequent reads, updates,\nactivation and execution inspection. A workflow name is a display label, not its\nID. Keep the caller's requested label when editing; avoid retyping or inventing\nIDs from names. Before `n8n_update_full_workflow`, fetch the saved workflow and\npreserve its name, existing node IDs, credentials, input mappings and execution\nsettings alongside the changed nodes/connections. For one node field, prefer\n`updateNode` with the required `updates` object. Fetch the result by its actual\nID and verify connections before testing the published version.\n\n## Finish the task without repeated read loops")
    if str(path).startswith("n8n-error-handling/"):
        text = text.replace("changes:", "updates:")
    if str(path) == "n8n-error-handling/SKILL.md":
        text = replace_once(text, "## When you actually need this", '## Save the complete error path before testing\n\nSet top-level `onError: "continueErrorOutput"` on the fallible node in the\ninitial create payload, together with its `main[1]` connection. If it was omitted,\nrepair with `updateNode` and `updates`, then publish/activate the saved workflow.\nDo not spend the task budget repeatedly validating an incomplete draft.\n\nFor an IF boolean condition, use a complete expression such as\n`={{ $json.body.amount !== undefined && $json.body.amount !== null }}`.\nDo not use `=({{ ... }})`, which adds literal parentheses around interpolation.\nZero is present, so a truthiness check is inappropriate. Test both the missing\nfield branch and the upstream failure branch; inspect saved execution data when\nthe requested HTTP 400/503 makes a test tool report `success: false`.\n\n## When you actually need this')
    if str(path) == "n8n-subworkflows/SKILL.md":
        text = replace_once(text, "## Map caller values", '## Select the child with a resource locator\n\nCurrent Execute Workflow nodes (including version 1.4) require `workflowId`\nas a resource locator, not a plain string:\n\n```json\n{"source":"database","workflowId":{"__rl":true,"mode":"id","value":"<actual child ID>"}}\n```\n\nA plain string can save and publish but fail at runtime with “No information\nabout the workflow to execute found. Please provide either the id or code”.\nInspect this field first for that error; changing input mappings cannot fix an\nunresolved child ID. Use the live schema for the selected node version, preserve\nthe child ID returned by creation, publish the repaired caller and test again.\n\n## Map caller values')
    if str(path) == "n8n-workflow-patterns/webhook_processing.md":
        text = replace_once(text, "../../n8n-expression-syntax/SKILL.md", "../n8n-expression-syntax/SKILL.md")
    for old, new in (("inspecting state from Claude", "inspecting state from OpenCode"),
                     ("tables and rows from Claude", "tables and rows from OpenCode")):
        text = text.replace(old, new)
    return text


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("checkout", type=Path)
    args = parser.parse_args()
    checkout = args.checkout.resolve()
    commit = subprocess.check_output(["git", "-C", str(checkout), "rev-parse", "HEAD"], text=True).strip()
    if subprocess.check_output(["git", "-C", str(checkout), "status", "--porcelain"], text=True).strip():
        raise ValueError("Use a clean upstream checkout so the recorded revision is reproducible")
    source = checkout / "skills"
    if not list(source.glob("*/SKILL.md")):
        raise ValueError("No upstream skills found")
    # Prepare everything before touching the maintained tree; drift fails here.
    imported = {}
    hashes = {}
    for path in sorted(source.rglob("*")):
        if path.is_file():
            relative = path.relative_to(source)
            data = path.read_bytes()
            hashes[str(relative)] = hashlib.sha256(data).hexdigest()
            imported[relative] = adapt(relative, data.decode()).encode() if path.suffix == ".md" else data
    evaluations = {str(p.relative_to(checkout / "evaluations")): p.read_bytes()
                   for p in sorted((checkout / "evaluations").glob("*/*.json"))}
    if not evaluations:
        raise ValueError("No upstream evaluation scenarios found")
    evaluation_target = ROOT / "tests/evaluations/upstream"
    if evaluation_target.exists():
        shutil.rmtree(evaluation_target)
    for relative, data in evaluations.items():
        destination = evaluation_target / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(data)
    target = ROOT / "skills"
    if target.exists():
        shutil.rmtree(target)
    for relative, data in imported.items():
        path = target / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        path.chmod((source / relative).stat().st_mode & 0o777)
    (ROOT / "NOTICES").write_text(NOTICES)
    shutil.copyfile(checkout / "NOTICES-APACHE-2.0.txt", ROOT / "NOTICES-APACHE-2.0.txt")
    (ROOT / "UPSTREAM-LICENSE").write_bytes((checkout / "LICENSE").read_bytes())
    version = json.loads((checkout / "plugin.json").read_text())["version"]
    (ROOT / "upstream.json").write_text(json.dumps({
        "repository": "https://github.com/czlonkowski/n8n-skills",
        "commit": commit, "version": version, "source_sha256": hashes,
        "evaluation_sha256": {p: hashlib.sha256(data).hexdigest() for p, data in evaluations.items()},
    }, indent=2) + "\n")
    print(f"Imported {len(list(target.glob('*/SKILL.md')))} skills from {commit} (v{version})")


if __name__ == "__main__":
    main()
