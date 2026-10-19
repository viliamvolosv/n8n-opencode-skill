import test from 'node:test';
import assert from 'node:assert/strict';
import { completeSession } from './agent-session.mjs';
const tool = {type:'tool_use',sessionID:'existing-session',part:{tool:'read',state:{status:'completed'}}};
const finish = {type:'step_finish',sessionID:'existing-session',part:{reason:'tool-calls'}};
const text = value => ({type:'text',sessionID:'existing-session',part:{text:value}});

test('unfinished tool turns continue in the same session with only remaining time', async () => {
  let clock = 0; const calls = [];
  const result = await completeSession({prompt:'Create workflow',timeout:60,requireAnswer:true,now:()=>clock,
    runTurn:async args=>{calls.push(args);clock+=10000;return args.turn===0?[tool,finish]:[text('Artifact completed')];}});
  assert.equal(calls.length,2);
  assert.equal(calls[1].session,'existing-session');
  assert.equal(calls[1].timeout,50);
  assert.match(calls[1].prompt,/Do not repeat/);
  assert.equal(result.events.length,3);
});
test('a completed answer, even an admission of failure, is never retried', async () => {
  let calls=0;
  const result=await completeSession({prompt:'Task',timeout:60,runTurn:async()=>{calls++;return[text('I could not complete the task')];}});
  assert.equal(calls,1);assert.equal(result.turns,1);
});
test('continuation is bounded and incomplete artifact sessions remain errors', async () => {
  let calls=0;
  await assert.rejects(completeSession({prompt:'Task',timeout:60,requireAnswer:true,
    runTurn:async()=>{calls++;return[tool,finish];}}),/no final answer/);
  assert.equal(calls,2);
  await assert.rejects(completeSession({prompt:'Task',timeout:60,
    runTurn:async()=>[{type:'step_finish',part:{reason:'length'}}]}),/token limit/);
});
test('elapsed time cannot be reset by a continuation', async () => {
  let clock=0,calls=0;
  await assert.rejects(completeSession({prompt:'Task',timeout:1,now:()=>clock,
    runTurn:async()=>{calls++;clock=1001;return[tool,finish];}}),/timeout/);
  assert.equal(calls,1);
});

test('native CLI continuation passes the session ID and preserves both event traces', async () => {
  const {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} = await import('node:fs');
  const {tmpdir} = await import('node:os');
  const {join} = await import('node:path');
  const {runAgent} = await import('./runtime.mjs');
  const root=mkdtempSync(join(tmpdir(),'native-session-'));
  const originalPath=process.env.PATH;
  try {
    mkdirSync(join(root,'bin'));mkdirSync(join(root,'work'));
    const fake=`#!${process.execPath}
const args=process.argv.slice(2);const resumed=args.includes('--session');
if(resumed && args[args.indexOf('--session')+1]!=='existing-session') process.exit(9);
const events=resumed?[{type:'text',sessionID:'existing-session',part:{text:'{"compose":{"services":{}}}'}}]
 :[{type:'tool_use',sessionID:'existing-session',part:{tool:'read',state:{status:'completed'}}},{type:'step_finish',sessionID:'existing-session',part:{reason:'tool-calls'}}];
for(const event of events) process.stdout.write(JSON.stringify(event)+'\\n');
`;
    writeFileSync(join(root,'bin','opencode'),fake,{mode:0o755});
    process.env.PATH=join(root,'bin')+':'+originalPath;
    const output=join(root,'results');
    const events=await runAgent({workdir:join(root,'work'),prompt:'Produce artifact',model:'fake/model',output,timeout:10,requireAnswer:true});
    assert.equal(events.length,3);
    assert.equal(JSON.parse(readFileSync(join(output,'session.json'),'utf8')).turns,2);
    assert.equal(readFileSync(join(output,'events.ndjson'),'utf8').trim().split('\n').length,3);
    assert.match(readFileSync(join(output,'continuation-1','events.ndjson'),'utf8'),/compose/);
  } finally {process.env.PATH=originalPath;rmSync(root,{recursive:true,force:true});}
});
