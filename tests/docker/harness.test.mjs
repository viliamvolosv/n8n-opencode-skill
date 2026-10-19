import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOptions, selectCases, loadCatalog, groups } from './catalog.mjs';
test('selection shards are disjoint and invalid options fail',()=>{
  const cases=Array.from({length:7},(_,i)=>({id:String(i),group:'agents'}));
  const shards=[1,2,3].map(i=>selectCases(cases,{shard:`${i}/3`}));
  assert.equal(new Set(shards.flat().map(c=>c.id)).size,7);
  assert.throws(()=>parseOptions(['--limit','0']));
  assert.throws(()=>parseOptions(['--unknown']));
  assert.equal(parseOptions(['--group','agents,code-tool']).group,'agents,code-tool');
  assert.throws(()=>parseOptions(['--group','agents,unknown']));
  assert.equal(selectCases([{group:'agents'},{group:'code-tool'},{group:'router'}],{group:'agents,code-tool'}).length,2);
  assert.throws(()=>selectCases(cases,{shard:'0/3'}));
});

test('Groq config uses the requested model and never embeds credentials', async () => {
  const { groqModel: defaultModel, validateModel, providerConfiguration, redactProviderSecrets } = await import('./provider.mjs');
  assert.equal(defaultModel, 'groq/qwen/qwen3.8-27b');
  assert.throws(() => validateModel(defaultModel, {}), /GROQ_API_KEY/);
  validateModel(defaultModel, { GROQ_API_KEY: 'test-credential' });
  validateModel('opencode/big-pickle', {});
  assert.throws(() => validateModel('groq/other', { GROQ_API_KEY: 'test-credential' }), /Unsupported/);
  const provider = providerConfiguration(defaultModel).providers.groq;
  assert.equal(provider.settings.apiKey, '{env:GROQ_API_KEY}');
  assert.equal(provider.models['qwen/qwen3.8-27b'].modelID, 'qwen/qwen3.8-27b');
  assert.equal(provider.models['qwen/qwen3.8-27b'].capabilities.tools, true);
  assert.deepEqual(providerConfiguration('opencode/big-pickle'), {});
  assert.equal(redactProviderSecrets('key=test-credential', { GROQ_API_KEY: 'test-credential' }), 'key=[REDACTED]');
});

test('Groq exposes only authorized tools while preserving native free-model compatibility', async () => {
  const { testPermissions, defaultModel } = await import('./provider.mjs');
  const permissions = testPermissions(defaultModel, { tools: ['get_node'] });
  assert.equal(permissions[0].effect, 'deny');
  assert.ok(permissions.some(p => p.action === 'skill' && p.effect === 'allow'));
  assert.ok(permissions.some(p => p.action === 'n8n_mcp_get_node' && p.effect === 'allow'));
  assert.ok(!permissions.some(p => p.action === 'n8n_mcp_*'));
  assert.equal(testPermissions('opencode/big-pickle')[0].effect, 'ask');
});

 test('Kilo requires a secret, pins a free tool model and redacts both providers', async () => {
  const { kiloModel, validateModel, providerConfiguration, redactProviderSecrets, testPermissions } = await import('./provider.mjs');
  assert.throws(() => validateModel(kiloModel, {}), /KILO_API_KEY/);
  validateModel(kiloModel, { KILO_API_KEY: 'kilo-test-secret' });
  const p = providerConfiguration(kiloModel).providers.kilo;
  assert.equal(p.settings.apiKey, '{env:KILO_API_KEY}');
  assert.equal(p.models['poolside/laguna-s-2.1:free'].capabilities.tools, true);
  assert.equal(redactProviderSecrets('a groq-secret b kilo-secret', { GROQ_API_KEY: 'groq-secret', KILO_API_KEY: 'kilo-secret' }), 'a [REDACTED] b [REDACTED]');
  assert.equal(testPermissions(kiloModel)[0].effect, 'deny');
});

test('local CI provider uses secret settings and permits an empty API key', async () => {
  const { defaultModel, validateModel, providerConfiguration, redactProviderSecrets } = await import('./provider.mjs');
  const env = { LLM_BASE_URL: 'http://model.example:1234', LLM_MODEL_ID: 'example-model', LLM_API_KEY: '' };
  assert.throws(() => validateModel(defaultModel, {}), /LLM_BASE_URL/);
  validateModel(defaultModel, env);
  const p = providerConfiguration(defaultModel, env).providers.local;
  assert.equal(p.settings.baseURL, 'http://model.example:1234/v1');
  assert.equal(p.settings.apiKey, undefined);
  assert.equal(p.models.configured.modelID, 'example-model');
  assert.equal(providerConfiguration(defaultModel, { ...env, LLM_BASE_URL: env.LLM_BASE_URL + '/v1/' }).providers.local.settings.baseURL, p.settings.baseURL);
  assert.equal(providerConfiguration(defaultModel, { ...env, LLM_API_KEY: 'test-key' }).providers.local.settings.apiKey, '{env:LLM_API_KEY}');
  assert.equal(redactProviderSecrets('example-model test-key', { ...env, LLM_API_KEY: 'test-key' }), '[REDACTED] [REDACTED]');
});

test('local context discovery uses the loaded instance rather than architecture maximum', async () => {
  const { defaultModel, discoverProviderLimits, providerConfiguration } = await import('./provider.mjs');
  const env = { LLM_BASE_URL: 'http://discovery.example/v1', LLM_MODEL_ID: 'loaded' };
  const request = async url => {
    assert.equal(url, 'http://discovery.example/api/v1/models');
    return { ok: true, json: async () => ({ models: [{ key: 'loaded', max_context_length: 262144, loaded_instances: [{ id: 'loaded', config: { context_length: 62976 } }] }] }) };
  };
  const result = await discoverProviderLimits(defaultModel, env, request);
  assert.equal(result.context, 62976);
  assert.deepEqual(providerConfiguration(defaultModel, env).providers.local.models.configured.limit, { context: 62976, output: 16384 });
  await assert.rejects(discoverProviderLimits(defaultModel, { ...env, LLM_MODEL_ID: 'unloaded' }, request), /loaded/);
});


test('only executable contracts enter the catalog', () => {
 const cases = loadCatalog();
 assert.equal(cases.length, 15);
 assert.equal(cases.filter(s => s.kind !== 'compose').length, 14);
 assert.deepEqual(new Set(cases.map(s => s.group)), new Set(Object.keys(groups)));
 assert.ok(cases.every(s => !s.criteria && !s.layer.includes('behavior')));
 assert.throws(() => parseOptions(['--mode', 'upstream']), /archived/);
});


test('startup timeout retries only bounded read-only preflight checks', async () => {
  const {waitForPreflight}=await import('./preflight.mjs');
  let calls=0;const observations=[];
  const result=await waitForPreflight(async()=>{if(++calls===1)throw new Error('The operation was aborted due to timeout');return 'ready';},
    {pause:async()=>{},onAttempt:a=>observations.push(a)});
  assert.equal(result,'ready');assert.equal(calls,2);assert.deepEqual(observations.map(a=>a.status),['ERROR','PASS']);
  calls=0;
  await assert.rejects(waitForPreflight(async()=>{calls++;throw new Error('MCP initialize: HTTP 401');},{pause:async()=>{}}),/401/);
  assert.equal(calls,1);
  calls=0;
  await assert.rejects(waitForPreflight(async()=>{calls++;throw new Error('timeout');},{pause:async()=>{}}),/timeout/);
  assert.equal(calls,3);
});

test('saved workflow identity survives a display-name typo without accepting an unrelated object', async () => {
  const {identifyWorkflow,subjectWorkflows}=await import('./workflow-identity.mjs');
  const create=(id)=>({type:'tool_use',part:{tool:'n8n_mcp_n8n_create_workflow',state:{status:'completed',output:JSON.stringify({success:true,data:{id}})}}});
  const events=[create('child'),create('parent')];
  const saved={child:{id:'child',name:'Child label',nodes:[]},parent:{id:'parent',name:'Changed label',nodes:[{type:'n8n-nodes-base.webhook',parameters:{path:'hidden-path'}}]}};
  const args={list:Object.values(saved),events,name:'Requested label',path:'hidden-path',read:async id=>saved[id]};
  assert.equal((await identifyWorkflow(args)).id,'parent');
  assert.deepEqual(subjectWorkflows(events),[{id:'child',target:'prod'},{id:'parent',target:'prod'}]);
  assert.equal(await identifyWorkflow({...args,events:[]}),undefined);
  const switched=[{type:'tool_use',part:{tool:'n8n_mcp_n8n_instances',state:{status:'completed',output:JSON.stringify({current:{name:'staging'}})}}},create('staging-id')];
  assert.deepEqual(subjectWorkflows(switched),[{id:'staging-id',target:'staging'}]);
  assert.equal(await identifyWorkflow({...args,path:'wrong-path'}).then(w=>w.nodes[0].parameters.path),'hidden-path');
});


test('subject interruption cannot skip or relax the independent n8n verdict', async () => {
  const {runAndVerify,outcomeStatus}=await import('./subject-outcome.mjs');
  let runs=0,verifications=0;
  const events=[{type:'tool_use',part:{tool:'skill'}}];
  const interrupted=async()=>{runs++;throw new Error('Model timeout');};
  const passed=await runAndVerify({run:interrupted,recover:()=>events,verify:async e=>{
    verifications++;assert.equal(e,events);return {checks:{skills_loaded:true,every_execution_succeeded:true,actual_http_results:true}};}});
  assert.equal(outcomeStatus(passed),'PASS');assert.equal(passed.subjectRun.error,'Model timeout');
  const failed=await runAndVerify({run:interrupted,recover:()=>events,verify:async()=>({checks:{actual_http_results:false}})});
  assert.equal(outcomeStatus(failed),'ERROR');
  assert.equal(outcomeStatus({checks:{actual_http_results:false},subjectRun:{status:'COMPLETED'}}),'FAIL');
  assert.equal(outcomeStatus({checks:{}}),'FAIL');
  await assert.rejects(runAndVerify({run:interrupted,recover:()=>[],verify:()=>{throw new Error('must not grade empty evidence');}}),/Model timeout/);
  assert.equal(runs,3);assert.equal(verifications,1);
});
