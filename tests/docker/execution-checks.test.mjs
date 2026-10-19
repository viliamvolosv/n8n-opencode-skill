import test from 'node:test';
import assert from 'node:assert/strict';
import { connected, executionMatches, executionChecks, referencedChildId } from './execution-checks.mjs';

const record = () => ({ workflowId: 'w1', mode: 'webhook', status: 'success',
  workflowData: { nodes: [{ name: 'Hook', type: 'n8n-nodes-base.webhook' },
    { name: 'Code', type: 'n8n-nodes-base.code', parameters: { language: 'pythonNative' } },
    { name: 'Reply', type: 'n8n-nodes-base.respondToWebhook' }] },
  data: { resultData: { runData: { Hook: [{ data: { main: [[{ json: { headers: { 'x-skill-test-id': 'request1' } } }]] } }],
    Code: [{}], Reply: [{}] } } } });

test('execution evidence belongs to the exact hidden request, workflow and trigger', () => {
  const value = record();
  assert.equal(executionMatches(value, 'w1', 'request1'), true);
  assert.equal(executionMatches(value, 'w1', 'request2'), false);
  assert.equal(executionMatches(value, 'other-workflow', 'request1'), false);
  value.mode = 'manual';
  assert.equal(executionMatches(value, 'w1', 'request1'), false);
});
test('saved nodes and a successful HTTP response cannot substitute for execution', () => {
  const value = record();
  assert.deepEqual(executionChecks(value, { kind: 'python' }, {}), { successful: true, requiredNodesExecuted: true });
  delete value.data.resultData.runData.Code;
  assert.equal(executionChecks(value, { kind: 'python' }, {}).requiredNodesExecuted, false);
  value.status = 'error'; value.data.resultData.error = { message: 'Runner failed' };
  assert.equal(executionChecks(value, { kind: 'python' }, {}).successful, false);
  assert.equal(executionChecks(undefined, { kind: 'python' }, {}).successful, false);
});
test('wrong runtime and disabled nodes fail even with misleading execution data', () => {
  const value = record();
  value.workflowData.nodes[1].parameters.language = 'javaScript';
  assert.equal(executionChecks(value, { kind: 'python' }, {}).requiredNodesExecuted, false);
  value.workflowData.nodes[1].disabled = true;
  assert.equal(executionChecks(value, { kind: 'javascript' }, {}).requiredNodesExecuted, false);
});
test('missing-input error branch need not run HTTP; present zero must run it', () => {
  const value = record();
  assert.equal(executionChecks(value, { kind: 'error-path' }, {}).requiredNodesExecuted, true);
  assert.equal(executionChecks(value, { kind: 'error-path' }, { amount: 0 }).requiredNodesExecuted, false);
});
test('run 158 regression: AI socket edges typed main are invalid', () => {
  const model = { name: 'Model' }, agent = { name: 'Agent' };
  const value = { connections: { Model: { ai_languageModel: [[{ node: 'Agent', type: 'main', index: 0 }]] } } };
  assert.equal(connected(value, model, agent, 'ai_languageModel'), false);
  value.connections.Model.ai_languageModel[0][0].type = 'ai_languageModel';
  assert.equal(connected(value, model, agent, 'ai_languageModel'), true);
  model.disabled = true;
  assert.equal(connected(value, model, agent, 'ai_languageModel'), false);
});

test('binary workflow may return its last node; responseNode still requires a Respond node', () => {
  const value = record();
  value.workflowData.nodes = value.workflowData.nodes.filter(n => n.name !== 'Reply');
  value.workflowData.nodes.push({name:'Download',type:'n8n-nodes-base.httpRequest'});
  value.data.resultData.runData.Download = [{}];
  const hook = value.workflowData.nodes[0];
  hook.parameters = {responseMode:'lastNode'};
  assert.equal(executionChecks(value,{kind:'binary'},{}).requiredNodesExecuted,true);
  delete value.data.resultData.runData.Download;
  assert.equal(executionChecks(value,{kind:'binary'},{}).requiredNodesExecuted,false);
  value.data.resultData.runData.Download = [{}];
  hook.parameters.responseMode = 'responseNode';
  assert.equal(executionChecks(value,{kind:'binary'},{}).requiredNodesExecuted,false);
  hook.parameters.responseMode = 'lastNode';
  assert.equal(executionChecks(value,{kind:'expression'},{}).requiredNodesExecuted,false);
});
test('child workflow resolution follows the saved reference, not display names', () => {
  const caller={parameters:{source:'database',workflowId:{__rl:true,value:'actual-child-id',mode:'list',cachedResultName:'Different child name'}}};
  assert.equal(referencedChildId(caller),'actual-child-id');
  caller.parameters.workflowId='actual-child-id';
  assert.equal(referencedChildId(caller),'actual-child-id');
  caller.parameters.workflowId='={{ $json.child }}';
  assert.equal(referencedChildId(caller),undefined);
  caller.parameters.source='parameter';
  assert.equal(referencedChildId(caller),undefined);
});
