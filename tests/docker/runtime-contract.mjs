// Test the tester against REAL disposable n8n. These scripted workflows are
// harness controls and never count as OpenCode/skill coverage. No LLM is called.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFileSync, readFileSync } from 'node:fs';
import { api, access, loadAccess, cleanupWorkflows, saveJson } from './runtime.mjs';
import { runAndVerify, outcomeStatus } from './subject-outcome.mjs';
import { gradeLive } from './live-grader.mjs';
import { liveCases } from './live-cases.mjs';
loadAccess();
const results = [];
const node = (name, type, typeVersion, parameters, extra = {}) => ({ id: name, name, type, typeVersion, parameters, position: [0, 0], ...extra });
const edge = (name, type = 'main') => [[{ node: name, type, index: 0 }]];
const base = 'n8n-nodes-base.';
const ai = '@n8n/n8n-nodes-langchain.';
const controlKinds = ['expression', 'renamed-expression', 'interrupted-expression', 'mcp-diagnostic-outage', 'http', 'http-missing-method', 'http-forward-envelope', 'binary', 'subworkflow', 'subworkflow-latest', 'subworkflow-string-id', 'error-path', 'agent-http-tool', 'agent-http-tool-latest', 'code-tool', 'broken-ai-edge'];
for (const kind of controlKinds) {
  const name = `ci-harness-${randomUUID()}`, path = `skill-ci/${randomUUID()}`;
  const scenario = liveCases().find(s => s.kind === (['renamed-expression','interrupted-expression','mcp-diagnostic-outage'].includes(kind) ? 'expression' : ['broken-ai-edge','agent-http-tool-latest'].includes(kind) ? 'agent-http-tool' : kind.startsWith('http-') ? 'http' : kind.startsWith('subworkflow') ? 'subworkflow' : kind));
  const workflow = { name, nodes: [node('Hook', base + 'webhook', 2.1,
    { httpMethod: 'POST', path, responseMode: 'responseNode', options: {} }, { webhookId: randomUUID() })],
    connections: {}, settings: { executionOrder: 'v1', saveDataSuccessExecution: 'all', saveDataErrorExecution: 'all' } };
  let createdId;
  if (['expression','renamed-expression','interrupted-expression','mcp-diagnostic-outage'].includes(kind)) {
    workflow.nodes.push(node('Reply', base + 'respondToWebhook', 1.4, {
      respondWith: 'json', responseBody: '={{ { email: $json.body.email, doubled: $json.body.amount * 2 } }}', options: {} }));
    workflow.connections.Hook = { main: edge('Reply') };
  } else if (kind === 'http' || kind.startsWith('http-')) {
    workflow.nodes.push(node('Request',base+'httpRequest',4.2,{method:'POST',url:'http://fixture-api:8080/echo',
      sendBody:true,contentType:'json',specifyBody:'json',jsonBody:kind==='http-forward-envelope'?'={{ $json }}':'={{ $json.body }}',options:{}}),
      node('Reply',base+'respondToWebhook',1.4,{respondWith:'json',responseBody:kind==='http-missing-method'?"={{ $('Hook').first().json.body }}":'={{ $json }}',options:{}}));
    workflow.connections={Hook:{main:edge('Request')},Request:{main:edge('Reply')}};
  } else if (kind === 'binary') {
    workflow.nodes[0].parameters.responseMode = 'lastNode';
    workflow.nodes[0].parameters.responseData = 'firstEntryJson';
    workflow.nodes.push(node('Download', base + 'httpRequest', 4.2, {
      method:'POST',url:'http://fixture-api:8080/file',sendBody:true,specifyBody:'json',
      jsonBody:'={{ { text: $json.body.text } }}',options:{response:{response:{responseFormat:'file'}}} }),
      node('Bytes',base+'code',2,{jsCode:"const b = await this.helpers.getBinaryDataBuffer(0, 'data'); return [{json:{text:b.toString('utf8'),bytes:b.length}}];"}));
    workflow.connections = {Hook:{main:edge('Download')},Download:{main:edge('Bytes')}};
  } else if (kind === 'error-path') {
    workflow.nodes.push(node('Check',base+'if',2.3,{conditions:{options:{typeValidation:'strict',version:2},combinator:'and',conditions:[{
      id:'present',leftValue:'={{ $json.body.amount !== undefined && $json.body.amount !== null }}',
      operator:{type:'boolean',operation:'true',singleValue:true}}]},options:{}}),
      node('Request',base+'httpRequest',4.5,{url:'http://fixture-api:8080/status/503',options:{}},{onError:'continueErrorOutput'}),
      node('BadRequest',base+'respondToWebhook',1.5,{respondWith:'json',responseBody:'{"error":"bad_request"}',options:{responseCode:400}}),
      node('UpstreamFailed',base+'respondToWebhook',1.5,{respondWith:'json',responseBody:'{"error":"upstream_failed"}',options:{responseCode:503}}));
    workflow.connections={Hook:{main:edge('Check')},Check:{main:[edge('Request')[0],edge('BadRequest')[0]]},
      Request:{main:[[],edge('UpstreamFailed')[0]]}};
  } else if (kind.startsWith('subworkflow')) {
    workflow.nodes.push(node('Child',base+'executeWorkflow',kind === 'subworkflow' ? 1.3 : 1.4,{source:'database',mode:'each',
      workflowInputs:{mappingMode:'defineBelow',value:{amount:'={{ $json.body.amount }}'},schema:[{id:'amount',type:'number'}]},options:{waitForSubWorkflow:true}}),
      node('Reply',base+'respondToWebhook',1.4,{respondWith:'json',responseBody:'={{ $json }}',options:{}}));
    workflow.connections = {Hook:{main:edge('Child')},Child:{main:edge('Reply')}};
  } else {
    workflow.nodes.push(node('Agent', ai + 'agent', 3.1, { promptType: 'define', text: '={{ JSON.stringify($json.body) }}', options: { enableStreaming: false } }),
      node('Model', ai + 'lmChatOpenAi', 1.3, { model: { __rl: true, mode: 'id', value: 'fixture-model' }, responsesApiEnabled: false, options: {} },
        { credentials: { openAiApi: access.fixtureCredential } }),
      kind === 'code-tool' ? node('Uppercase', ai + 'toolCode', 1.3, {
        description: 'Uppercase the input text', jsCode: 'return JSON.stringify({echo: query.text.toUpperCase()});',
        specifyInputSchema: true, schemaType: 'manual', inputSchema: '{"type":"object","properties":{"text":{"type":"string"}},"required":["text"]}' })
      : node('Uppercase', base + 'httpRequestTool', kind === 'agent-http-tool-latest' ? 4.5 : 4.2, { toolDescription: 'Uppercase the input text', method: 'POST',
        url: 'http://fixture-api:8080/uppercase', sendBody: true, specifyBody: 'keypair',
        bodyParameters: { parameters: [{ name: 'text', value: "={{ $fromAI('text', 'Text to uppercase', 'string') }}" }] }, options: {}, ...(kind === 'agent-http-tool-latest' ? {specifyBody:'json',jsonBody:"={{ JSON.stringify({ text: $fromAI('text', 'Text to uppercase') }) }}"} : {}) }),
      node('Reply', base + 'respondToWebhook', 1.4, { respondWith: 'json', responseBody: '={{ JSON.parse($json.output) }}', options: {} }));
    workflow.connections = { Hook: { main: edge('Agent') }, Agent: { main: edge('Reply') },
      Model: { ai_languageModel: edge('Agent', kind === 'broken-ai-edge' ? 'main' : 'ai_languageModel') },
      Uppercase: { ai_tool: edge('Agent', 'ai_tool') } };
  }
  if (kind === 'agent-http-tool-latest') {
    workflow.nodes.find(n=>n.name==='Agent').parameters.options = {};
    workflow.nodes.find(n=>n.name==='Model').parameters.options = {baseURL:'http://fixture-api:8080/v1'};
    workflow.nodes.find(n=>n.name==='Reply').typeVersion = 1.5;
  }
  try {
    if (kind.startsWith('subworkflow')) {
      const child = await api('/workflows',{method:'POST',body:JSON.stringify({name:`${name}-different-child-label`,
        nodes:[node('Input',base+'executeWorkflowTrigger',1.1,{inputSource:'workflowInputs',workflowInputs:{values:[{name:'amount',type:'number'}]}}),
          node('Double',base+'code',2,{jsCode:'return $input.all().map(item => ({json:{doubled:item.json.amount * 2}}));'})],
        connections:{Input:{main:edge('Double')}},settings:{executionOrder:'v1',saveDataSuccessExecution:'all'}})});
      await api(`/workflows/${child.id}/activate`, {method:'POST'});
      workflow.nodes.find(n=>n.name==='Child').parameters.workflowId=kind === 'subworkflow-string-id' ? child.id : {__rl:true,mode:'id',value:child.id};
    }
    const created = await api('/workflows', { method: 'POST', body: JSON.stringify(workflow) });
    createdId = created.id;
    if (kind === 'renamed-expression') await api(`/workflows/${created.id}`, {method:'PUT',body:JSON.stringify({...workflow,name:'Changed display label'})});
    await api(`/workflows/${created.id}/activate`, { method: 'POST' });
    const events = scenario.skills.map(id => ({type:'tool_use',part:{tool:'skill',state:{status:'completed',input:{id},output:'scripted harness control'}}}))
      .concat([{type:'tool_use',part:{tool:'n8n_mcp_n8n_create_workflow',state:{status:'completed',output:JSON.stringify({success:true,data:{id:created.id}})}}}]);
    const verify = async events => {
      const originalFetch = globalThis.fetch;
      try {
        if (kind === 'mcp-diagnostic-outage') globalThis.fetch = (...args) => String(args[0]).startsWith('http://suite-proxy:3001/mcp')
          ? Promise.resolve(new Response('diagnostic MCP unavailable', {status:503})) : originalFetch(...args);
        return await gradeLive({scenario,name,path,directory:`/results/controls/${kind}`,events});
      } finally { globalThis.fetch = originalFetch; }
    };
    const result = kind === 'interrupted-expression' ? await runAndVerify({
      run:async()=>{throw new Error('Model timeout (scripted control)');},recover:()=>events,verify,
    }) : await verify(events);
    if (kind === 'interrupted-expression') {
      assert.equal(result.subjectRun.status,'INTERRUPTED');
      assert.equal(outcomeStatus(result),'PASS');
    }
    if (kind === 'mcp-diagnostic-outage') assert.equal(JSON.parse(readFileSync(`/results/controls/${kind}/validation.json`,'utf8')).diagnosticOnly,true);
    saveJson(`/results/controls/${kind}/result.json`, result);
    if (kind === 'subworkflow-string-id') {
      assert.equal(result.checks.actual_http_results,false);
      assert.equal(result.checks.every_execution_succeeded,false);
      assert.ok(result.observations.every(o => /Error executing workflow/.test(o.execution.error)), JSON.stringify(result.observations));
    } else if (kind === 'broken-ai-edge') {
      assert.equal(result.checks.chat_model_connected, false);
      assert.equal(result.checks.every_execution_succeeded, false);
      assert.equal(result.checks.actual_http_results, false);
      assert.ok(result.observations.every(o => /Chat Model/.test(o.execution.error)), JSON.stringify(result.observations));
    } else if (kind.startsWith('http-')) {
      assert.equal(result.checks.actual_http_results,false);
      assert.equal(result.checks.every_execution_succeeded,true);
      assert.equal(result.checks.required_runtime_nodes_executed,true);
    } else assert.ok(Object.values(result.checks).every(v => v === true), JSON.stringify(result));
    results.push({ kind, status: 'PASS' });
    console.log(`PASS harness control ${kind}`);
  } catch (error) {
    results.push({ kind, status: 'ERROR', error: error.message });
    throw error;
  } finally {
    await cleanupWorkflows(name, createdId ? [{id:createdId,target:'prod'}] : []);
    writeFileSync('/results/junit.xml', `<testsuite name="harness-runtime-controls" tests="${results.length}" errors="${results.filter(r => r.status !== 'PASS').length}">${results.map(r => `<testcase name="${r.kind}">${r.status === 'PASS' ? '' : '<error message="Runtime control failed; inspect report.json"/>'}</testcase>`).join('')}</testsuite>\n`);
    saveJson('/results/report.json', { scope: 'Harness controls only, no OpenCode or skill coverage', results,
      status: results.some(r => r.status !== 'PASS') ? 'ERROR' : results.length === controlKinds.length ? 'PASS' : 'INCOMPLETE' });
  }
}
