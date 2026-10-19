import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
const base='http://127.0.0.1:8080';
test('local fixtures preserve binary bytes and execute a complete model tool protocol',async()=>{
  const child=spawn(process.execPath,[new URL('./fixture-api.mjs',import.meta.url).pathname],{stdio:['ignore','pipe','pipe']});
  try {
    await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw new Error('Fixture exited before listening');}),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Fixture startup timeout')),5000).unref())]);
    const post=async(path,body)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const binary=await post('/file',{text:'café'});
    assert.equal(Buffer.from(await binary.arrayBuffer()).toString(),'café');
    assert.equal((await post('/status/503',{})).status,503);
    const messages=[{role:'user',content:JSON.stringify({text:'café'})}];
    const tools=[{type:'function',function:{name:'uppercase',parameters:{type:'object',properties:{text:{type:'string'}}}}}];
    const first=await (await post('/v1/chat/completions',{messages,tools})).json();
    const message=first.choices[0].message;
    assert.equal(JSON.parse(message.tool_calls[0].function.arguments).text,'café');
    const queryTool=structuredClone(tools);
    queryTool[0].function.parameters.properties={query:{type:'string'}};
    const stringQuery=await (await post('/v1/chat/completions',{messages,tools:queryTool})).json();
    assert.equal(JSON.parse(stringQuery.choices[0].message.tool_calls[0].function.arguments).query,JSON.stringify({text:'café'}));
    queryTool[0].function.parameters.properties.query.type='object';
    const objectQuery=await (await post('/v1/chat/completions',{messages,tools:queryTool})).json();
    assert.deepEqual(JSON.parse(objectQuery.choices[0].message.tool_calls[0].function.arguments).query,{text:'café'});
    const output=await (await post('/uppercase',{text:'café'})).json();
    messages.push(message,{role:'tool',tool_call_id:message.tool_calls[0].id,content:JSON.stringify(output)});
    const final=await (await post('/v1/chat/completions',{messages,tools})).json();
    assert.deepEqual(JSON.parse(final.choices[0].message.content),{echo:'CAFÉ'});
    messages[messages.length-1].content=JSON.stringify({response:JSON.stringify(output)});
    const wrapped=await (await post('/v1/chat/completions',{messages,tools})).json();
    assert.deepEqual(JSON.parse(wrapped.choices[0].message.content),{echo:'CAFÉ'});
    const streamed=await (await post('/v1/chat/completions',{messages,tools,stream:true})).text();
    assert.ok(streamed.endsWith('data: [DONE]\n\n'));
    assert.ok((await (await fetch(base+'/calls')).json()).some(call=>call.toolExecuted));
  } finally { child.kill(); await once(child,'close'); }
});
