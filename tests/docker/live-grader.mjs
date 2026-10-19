import { writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { api, Mcp, primaryUrl, secondaryUrl, access, saveJson, completedTools, loadedSkills, scrub } from './runtime.mjs';
import { identifyWorkflow } from './workflow-identity.mjs';
import { connected, executionMatches, executionChecks, referencedChildId } from './execution-checks.mjs';
import { lastJsonAnswer, lastJsonArtifact } from './model-output.mjs';

export async function seedRepair(name, path) {
  const workflow = await api('/workflows', { method: 'POST', body: JSON.stringify({ name,
    nodes: [
      { id: 'webhook', name: 'Webhook', type: 'n8n-nodes-base.webhook', typeVersion: 2.1, position: [0, 0], webhookId: path,
        parameters: { httpMethod: 'POST', path, responseMode: 'responseNode', options: {} } },
      { id: 'http', name: 'HTTP Request', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [200, 0], parameters: { url: '' } },
      { id: 'respond', name: 'Respond', type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.4, position: [400, 0],
        parameters: { respondWith: 'json', responseBody: '={{ $json }}', options: {} } },
    ], connections: { Webhook: { main: [[{ node: 'HTTP Request', type: 'main', index: 0 }]] },
      'HTTP Request': { main: [[{ node: 'Respond', type: 'main', index: 0 }]] } }, settings: { executionOrder: 'v1' } }) });
  return workflow.id;
}
export async function gradeLive({ scenario, name, path, events, directory, seedId }) {
  const checks = { skills_loaded: scenario.skills.every(skill => loadedSkills(events).includes(skill)) };
  const answer = scenario.kind === 'compose' ? lastJsonArtifact(events, 'compose') : lastJsonAnswer(events);
  if (scenario.kind === 'compose') {
    const compose = answer?.compose;
    checks.compose_object = !!compose && typeof compose === 'object' && !Array.isArray(compose);
    if (checks.compose_object) {
      const safe = !compose.include && Object.values(compose.services || {}).every(service =>
        !service.extends && !service.env_file && !service.build && (service.volumes || []).every(volume =>
          typeof volume === 'string' ? /^[a-zA-Z0-9_-]+:/.test(volume) : volume.type === 'volume'))
        && Object.values(compose.volumes || {}).every(volume => !volume?.external)
        && Object.values(compose.networks || {}).every(network => !network?.external);
      checks.self_contained_manifest = safe;
      if (safe) {
        const workdir = `${directory}/compose`; mkdirSync(workdir, { recursive: true });
        const file = `${workdir}/compose.json`; writeFileSync(file, JSON.stringify(compose, null, 2));
        const secret = randomBytes(32).toString('hex');
        const databaseSecret = randomBytes(24).toString('hex');
        const normalized = spawnSync('docker', ['compose', '--project-directory', workdir, '-f', file, 'config', '--format', 'json'], {
          env: { PATH: process.env.PATH, N8N_ENCRYPTION_KEY: secret, POSTGRES_PASSWORD: databaseSecret, POSTGRES_USER: 'n8n', POSTGRES_DB: 'n8n',
            N8N_IMAGE_TAG: '2.38.5', DOMAIN: 'ci.example.invalid', SSL_EMAIL: 'ci@example.invalid', GENERIC_TIMEZONE: 'UTC' },
          encoding: 'utf8', timeout: 15000, maxBuffer: 1024 * 1024,
        });
        checks.compose_normalizes = normalized.status === 0;
        writeFileSync(`${workdir}/stderr.txt`, normalized.stderr || '');
        if (checks.compose_normalizes) {
          const config = JSON.parse(normalized.stdout); const services = Object.entries(config.services);
          const workers = services.filter(([, s]) => /(?:^|\/)n8n(?::|@|$)/.test(s.image || '') && /\bworker\b/.test(JSON.stringify(s.command)));
          const main = services.find(([, s]) => /(?:^|\/)n8n(?::|@|$)/.test(s.image || '') && !/\bworker\b/.test(JSON.stringify(s.command)))?.[1];
          const postgres = services.find(([, s]) => /postgres/.test(s.image || ''));
          const redis = services.find(([, s]) => /redis/.test(s.image || ''));
          checks.queue_topology = !!main && !!postgres && !!redis && workers.length > 0;
          checks.pinned_n8n_image = !!main && /:2\.38\.5(?:@|$)/.test(main.image);
          checks.queue_env_shared = checks.queue_topology && [main, ...workers.map(([, s]) => s)].every(s =>
            s.environment?.EXECUTIONS_MODE === 'queue' && s.environment?.DB_TYPE === 'postgresdb'
            && s.environment?.N8N_ENCRYPTION_KEY === secret && s.environment?.DB_POSTGRESDB_HOST === postgres[0]
            && s.environment?.QUEUE_BULL_REDIS_HOST === redis[0] && s.image === main.image);
          checks.database_auth_shared = checks.queue_topology
            && postgres[1].environment?.POSTGRES_PASSWORD === databaseSecret
            && [main, ...workers.map(([, s]) => s)].every(s =>
              s.environment?.DB_POSTGRESDB_PASSWORD === databaseSecret
              && s.environment?.DB_POSTGRESDB_USER === (postgres[1].environment?.POSTGRES_USER || 'postgres')
              && s.environment?.DB_POSTGRESDB_DATABASE === (postgres[1].environment?.POSTGRES_DB || postgres[1].environment?.POSTGRES_USER || 'postgres'));
          checks.no_internal_ports = services.filter(([, s]) => !/caddy/.test(s.image || '')).every(([, s]) => !s.ports?.length);
          checks.secrets_are_variable_references = /\$\{N8N_ENCRYPTION_KEY(?::[?+\-][^}]*)?\}/.test(JSON.stringify(compose))
            && /\$\{POSTGRES_PASSWORD(?::[?+\-][^}]*)?\}/.test(JSON.stringify(compose));
          // Do not save the normalized ephemeral secret values.
        }
      }
    }
    return { checks, scope: 'Compose configuration only; no remote deployment, DNS or TLS claim', answer };
  }
  const tools = completedTools(events);
  const target = scenario.target;
  const list = await api('/workflows?limit=100', {}, target);
  const created = await identifyWorkflow({list:list.data, events, name, path, target, seedId, read:id=>api(`/workflows/${id}`, {}, target)});
  checks.saved_workflow_exists = !!created;
  const observations = [];
  if (created) {
    const workflow = created;
    saveJson(`${directory}/identity.json`, {id:workflow.id, requestedName:name, savedName:workflow.name, target});
    saveJson(`${directory}/workflow.json`, workflow);
    if (seedId) checks.repairs_original_workflow = seedId === workflow.id;
    const mcp = new Mcp();
    try {
      await mcp.initialize();
      if (target !== 'prod') await mcp.call('n8n_instances', { mode: 'switch', name: target });
      const validation = await mcp.call('n8n_validate_workflow', { id: workflow.id });
      saveJson(`${directory}/validation.json`, validation.data);
      // MCP validation is diagnostic; actual saved state and execution determine the verdict.
    } catch (error) {
      saveJson(`${directory}/validation.json`, {diagnosticOnly:true,error:scrub(error.message)});
    } finally { await mcp.close(); }
    checks.active = workflow.active === true;
    const webhook = workflow.nodes.find(n => n.type === 'n8n-nodes-base.webhook');
    checks.webhook_contract = webhook?.parameters?.path === path && webhook?.parameters?.httpMethod === 'POST';
    if (['expression', 'multi-instance'].includes(scenario.kind)) checks.native_expressions = workflow.nodes.length === 2
      && workflow.nodes.some(n => n.type === 'n8n-nodes-base.respondToWebhook');
    if (['python', 'javascript'].includes(scenario.kind)) checks.code_runtime = workflow.nodes.some(n => n.type === 'n8n-nodes-base.code'
      && (scenario.kind === 'python' ? n.parameters.language === 'pythonNative' : [undefined, 'javaScript'].includes(n.parameters.language)));
    if (scenario.kind === 'binary') checks.binary_download = workflow.nodes.some(n => n.type === 'n8n-nodes-base.httpRequest'
      && JSON.stringify(n.parameters).includes('file'));
    if (scenario.kind === 'error-path') checks.error_output_wired = workflow.nodes.some(n => n.type === 'n8n-nodes-base.httpRequest'
      && n.onError === 'continueErrorOutput' && workflow.connections[n.name]?.main?.[1]?.length);
    if (scenario.kind === 'subworkflow') {
      const caller = workflow.nodes.find(n => n.type === 'n8n-nodes-base.executeWorkflow');
      const childId = referencedChildId(caller);
      const child = list.data.find(w => w.id === childId && w.id !== workflow.id);
      checks.child_workflow = !!caller && !!child;
      if (child) {
        const value = await api(`/workflows/${child.id}`, {}, target);
        saveJson(`${directory}/child-workflow.json`, value);
        const trigger = value.nodes.find(n => n.type === 'n8n-nodes-base.executeWorkflowTrigger');
        checks.typed_child_input = !!trigger?.parameters?.workflowInputs?.values?.some(field => field.name === 'amount' && field.type === 'number');
        checks.per_item_caller = caller?.parameters?.mode === 'each';
        checks.waits_for_child = caller?.parameters?.options?.waitForSubWorkflow !== false;
      }
    }
    if (scenario.kind === 'multi-instance') {
      const prod = await api('/workflows?limit=100');
      checks.no_prod_mutation = !prod.data.some(w => w.name.startsWith(name));
      checks.explicit_switch = tools.some(e => e.part.tool === 'n8n_mcp_n8n_instances' && e.part.state.input?.mode === 'switch'
        && e.part.state.input?.name === 'staging');
    }
    if (['agent-http-tool', 'code-tool'].includes(scenario.kind)) {
      const agent = workflow.nodes.find(n => n.type === '@n8n/n8n-nodes-langchain.agent');
      const toolTypes = scenario.kind === 'code-tool' ? ['@n8n/n8n-nodes-langchain.toolCode']
        : ['n8n-nodes-base.httpRequestTool', '@n8n/n8n-nodes-langchain.toolHttpRequest'];
      const tool = workflow.nodes.find(n => toolTypes.includes(n.type));
      checks.real_agent_and_tool = !!agent && !!tool && connected(workflow, tool, agent, 'ai_tool');
      const chatModel = workflow.nodes.find(n => n.type === '@n8n/n8n-nodes-langchain.lmChatOpenAi');
      checks.chat_model_connected = !!agent && !!chatModel && connected(workflow, chatModel, agent, 'ai_languageModel');
      if (scenario.kind === 'code-tool') checks.structured_tool_input = tool?.parameters?.specifyInputSchema === true;
      else checks.dynamic_tool_input = !!tool && JSON.stringify(tool.parameters).includes('$fromAI');
    }
    // Baseline excludes all executions made by OpenCode while building/debugging.
    const baseline = new Set((await api(`/executions?workflowId=${workflow.id}&limit=100`, {}, target)).data.map(e => String(e.id)));
    const records = [];
    if (checks.active && checks.webhook_contract) {
      for (const fixture of scenario.fixtures) {
        const requestId = randomUUID();
        const observation = { requestId, input: fixture.input, expected: {
          ...fixture.expected, ...Object.fromEntries((fixture.preserve || []).map(key => [key, fixture.input[key]])),
        }, passed: false };
        const beforeCalls = (await (await fetch('http://fixture-api:8080/calls')).json()).length;
        try {
          const response = await fetch(`${target === 'prod' ? primaryUrl : secondaryUrl}/webhook/${path}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Skill-Test-Id': requestId },
            body: JSON.stringify(fixture.input), signal: AbortSignal.timeout(30000),
          });
          const text = await response.text();
          let body; try { body = JSON.parse(text); } catch { body = text; }
          Object.assign(observation, { status: response.status, body, passed: response.status === (fixture.status || 200)
            && !!body && !Array.isArray(body) && Object.entries(observation.expected).every(([key, value]) => Object.is(body[key], value)) });
        } catch (error) { Object.assign(observation, { status: null, error: error.message }); }
        // Each HTTP input needs its own completed, correlated execution. An old
        // success or an unrelated request cannot satisfy this assertion.
        let matched;
        for (let attempt = 0; attempt < 40; attempt++) {
          const executions = await api(`/executions?workflowId=${workflow.id}&limit=100`, {}, target);
          for (const execution of executions.data.filter(e => !baseline.has(String(e.id)))) {
            const record = await api(`/executions/${execution.id}?includeData=true`, {}, target);
            if (executionMatches(record, workflow.id, requestId) && ['success', 'error', 'crashed', 'canceled'].includes(record.status)) {
              matched = record; break;
            }
          }
          if (matched) break;
          await new Promise(resolve => setTimeout(resolve, 250));
        }
        if (matched) {
          baseline.add(String(matched.id)); records.push(matched);
          saveJson(`${directory}/execution-${matched.id}.json`, matched);
        }
        const verified = executionChecks(matched, scenario, fixture.input);
        observation.execution = { id: matched?.id, status: matched?.status || 'missing',
          ...verified, error: matched?.data?.resultData?.error?.message };
        if (['agent-http-tool', 'code-tool'].includes(scenario.kind)) {
          const calls = (await (await fetch('http://fixture-api:8080/calls')).json()).slice(beforeCalls);
          saveJson(`${directory}/model-fixture-${requestId}.json`, calls);
          observation.toolResultObserved = calls.some(call => call.toolExecuted);
        }
        observations.push(observation);
        saveJson(`${directory}/observations.json`, observations);
      }
    }
    const complete = observations.length === scenario.fixtures.length;
    checks.actual_http_results = complete && observations.every(o => o.passed);
    checks.every_execution_succeeded = complete && observations.every(o => o.execution.successful);
    checks.required_runtime_nodes_executed = complete && observations.every(o => o.execution.requiredNodesExecuted);
    if (['agent-http-tool', 'code-tool'].includes(scenario.kind)) {
      checks.every_tool_result_observed = complete && observations.every(o => o.toolResultObserved);
    }
    saveJson(`${directory}/executions.json`, records.map(r => ({ id: r.id, status: r.status })));

  }
  return { checks, observations, answer, scope: scenario.layer };
}
export function livePrompt({ scenario, name, path, seedId }) {
  return `You are working ONLY on disposable test n8n instances reachable through n8n_mcp. You are authorized to create, validate, activate and test workflows here. No external service credentials or remote deployment are authorized. Load using-n8n-mcp-skills first, then the relevant specialists. Before workflow MCP mutations, also load n8n-mcp-tools-expert; use the actual exposed tool schemas for activation and updates. ${scenario.group === 'router' ? '' : `The target skill for this execution test is ${scenario.skills[0]}.`}
${scenario.query}
${scenario.kind === 'error-path' ? 'Intentional HTTP 400 and 503 responses are part of this task. n8n_test_workflow can report non-2xx responses as success:false even for a correct error branch. Inspect execution data and the expected response contract before changing that branch.' : ''}
${scenario.kind === 'compose' ? 'Read the bundled templates with the read tool. The grader runs Docker Compose normalization; do not call shell, SSH, deploy, or write files yourself. Return the requested JSON artifact.' : `Use workflow name exactly ${name} and POST webhook path exactly ${path}. Create only the workflows requested by this task; every additional requested workflow must start with ${name}. Debug the original workflow IDs rather than creating probe or replacement workflows. ${seedId ? `A broken workflow already exists with id ${seedId}; repair that original workflow, do not replace it.` : ''}
Consult live node schemas, validate through MCP, activate, and fetch the saved connections. Keep success and error execution data for this disposable test. You may test and debug your own workflow. The test harness independently executes fresh hidden HTTP inputs after you finish; your own executions do not count toward passing. Do not modify local files or use shell commands. Do not merely describe a workflow: create it on n8n. The local fixture OpenAI credential is ${JSON.stringify(access.fixtureCredential)}; it is for http://fixture-api:8080/v1 only and uses no real provider key. Summarize what you created. Your answer format does not affect the runtime verdict.`}`;
}
