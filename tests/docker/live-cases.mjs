import { groups } from './groups.mjs';

const echoCases = () => [0, 7, -2.5].map(amount => ({ input: { email: `ci+${crypto.randomUUID()}@example.invalid`, amount },
  expected: { doubled: amount * 2 }, preserve: ['email'] }));
const sums = () => [[1, 3, 8], [], [-3.5, 2]].map(amounts => ({ input: { amounts }, expected: { total: amounts.reduce((a, b) => a + b, 0) } }));
const textCases = () => ['café', 'MiXeD 42', `test-${crypto.randomUUID()}`].map(text => ({ input: { text }, expected: { echo: text.toUpperCase() } }));
export function liveCases() {
  return Object.entries(groups).map(([group, skill]) => {
    const value = { id: `live-${group}`, group, skills: [skill], layer: 'live-workflow', kind: 'expression',
      query: 'Build POST Webhook → Respond to Webhook. Read email and amount from the JSON body, return JSON {email, doubled}, where doubled is amount times 2. Use native expressions, no Code or Set nodes.',
      fixtures: echoCases(), target: 'prod' };
    if (group === 'router') value.skills = ['using-n8n-mcp-skills', 'n8n-expression-syntax'];
    if (group === 'code-javascript' || group === 'code-python') Object.assign(value, {
      kind: group === 'code-python' ? 'python' : 'javascript',
      query: `Build POST Webhook → Code → Respond to Webhook. Explicitly use ${group === 'code-python' ? 'native Python (pythonNative)' : 'JavaScript'} in the Code node to sum all numbers in request body amounts. Return JSON {total}. Handle empty and negative/fractional inputs. Native Python runner is available; no imports are allowlisted.`, fixtures: sums(),
    });
    if (['node-configuration', 'mcp-tools', 'validation-expert'].includes(group)) Object.assign(value, {
      kind: group === 'validation-expert' ? 'repair' : 'http',
      query: 'Build POST Webhook → HTTP Request → Respond to Webhook. The HTTP Request must POST the incoming JSON body to http://fixture-api:8080/echo. Respond with the fixture JSON {email, amount, method}. Use the live node schema, set sendBody and JSON body handling correctly.',
      fixtures: echoCases().map(f => ({ input: f.input, expected: { ...f.input, method: 'POST' } })),
    });
    if (group === 'binary-and-data') Object.assign(value, { kind: 'binary',
      query: 'Build a POST Webhook workflow. POST {text: incoming text} to http://fixture-api:8080/file using HTTP Request with FILE/binary response mode. Read the actual binary buffer (not $json) and return JSON {text, bytes} to the caller. bytes is the UTF-8 byte length. A JavaScript Code node with the n8n binary helper may be used.',
      fixtures: ['café', 'hello', `file-${crypto.randomUUID()}`].map(text => ({ input: { text }, expected: { text, bytes: Buffer.byteLength(text) } })),
    });
    if (group === 'subworkflows') Object.assign(value, { kind: 'subworkflow',
      query: 'Create a reusable child workflow with an Execute Workflow Trigger using typed Define Below input amount:number. It returns {doubled: amount*2}. Create a parent POST Webhook → Execute Workflow → Respond to Webhook which passes incoming amount to that child, waits for it, runs mode each, and returns its result. Use a test-prefixed name for the child; reference its actual saved workflow ID in the parent. Do not duplicate the child calculation in the parent.',
      fixtures: [0, 7, -2.5].map(amount => ({ input: { amount }, expected: { doubled: amount * 2 } })),
    });
    if (['agents', 'code-tool'].includes(group)) Object.assign(value, { kind: group === 'agents' ? 'agent-http-tool' : 'code-tool',
      query: `Build POST Webhook → AI Agent → Respond to Webhook. Give the Agent an OpenAI Chat Model using the provided LOCAL fixture credential, model fixture-model, and use the chat-completions API (not Responses API). Set the agent's user prompt to the JSON request body so the fixture can read its text field. Attach ${group === 'agents' ? 'an HTTP Request Tool which POSTs {text} to http://fixture-api:8080/uppercase; expose text via $fromAI' : 'a Custom Code Tool with structured input schema {text:string}; the tool must uppercase query.text and return JSON with echo as a STRING'}. The fixture model calls the first attached tool once and returns its result unchanged. Respond with the parsed tool result as JSON {echo}. Do not bypass the Agent or its tool.`, fixtures: textCases(),
      layer: 'live-workflow-with-local-model-protocol-fixture',
    });
    if (['error-handling', 'workflow-patterns'].includes(group)) Object.assign(value, { kind: 'error-path',
      query: 'Build a webhook API with explicit success/error branches. If request body amount is missing, return HTTP 400 JSON {error:"bad_request"}. If amount is present, call http://fixture-api:8080/status/503 using HTTP Request. This fixture always fails with 503: configure continueErrorOutput and wire main[1] to a Respond node returning HTTP 503 JSON {error:"upstream_failed"}. Never return 200 for these errors.',
      fixtures: [{ input: {}, status: 400, expected: { error: 'bad_request' } },
        { input: { amount: 0 }, status: 503, expected: { error: 'upstream_failed' } },
        { input: { amount: 7 }, status: 503, expected: { error: 'upstream_failed' } }],
    });
    if (group === 'multi-instance') Object.assign(value, { kind: 'multi-instance', target: 'staging', layer: 'live-two-instance-contract',
      query: value.query + ' Create this ONLY on staging, never on prod. Use n8n_instances to list and switch before dependent calls. Both names refer to real disposable n8n instances behind a contract-fixture router, not a hosted production account.',
    });
    if (group === 'self-hosting') Object.assign(value, { kind: 'compose', layer: 'deployment-configuration', fixtures: [],
      query: 'Prepare a queue-mode Docker Compose configuration for n8n with Postgres, Redis and one worker, sharing the encryption key and all worker-relevant environment. Use image n8nio/n8n:2.38.5. Use only named volumes, no bind mounts, build contexts, external helper files, env_file or includes. For this minimal configuration, connect n8n directly as the configured Postgres user. Do not publish internal ports. No remote SSH or TLS provisioning is authorized. Return JSON with a compose field containing the Compose configuration as a JSON OBJECT, and an explanation. Use ${N8N_ENCRYPTION_KEY} and ${POSTGRES_PASSWORD} variable references, never inline secrets. The grader will normalize this with docker compose config and inspect the result. Inspect the installed self-hosting templates first.',
    });
    return value;
  });
}
