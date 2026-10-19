import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gradeLive } from './live-grader.mjs';
const env={EXECUTIONS_MODE:'queue',DB_TYPE:'postgresdb',DB_POSTGRESDB_HOST:'postgres',
  QUEUE_BULL_REDIS_HOST:'redis',DB_POSTGRESDB_USER:'n8n',DB_POSTGRESDB_DATABASE:'n8n',DB_POSTGRESDB_PASSWORD:'${POSTGRES_PASSWORD}',N8N_ENCRYPTION_KEY:'${N8N_ENCRYPTION_KEY}'};
const artifact=()=>({services:{postgres:{image:'postgres:16',environment:{POSTGRES_USER:'n8n',POSTGRES_DB:'n8n',POSTGRES_PASSWORD:'${POSTGRES_PASSWORD}'}},
  redis:{image:'redis:7-alpine'},main:{image:'n8nio/n8n:2.38.5',environment:{...env}},
  worker:{image:'n8nio/n8n:2.38.5',command:'worker',environment:{...env}}}});
async function grade(compose, prose = false){
  const directory=mkdtempSync(join(tmpdir(),'deployment-grader-'));
  try{return await gradeLive({scenario:{kind:'compose',skills:['n8n-self-hosting']},directory,
    events:[{type:'tool_use',part:{tool:'skill',state:{status:'completed',input:{id:'n8n-self-hosting'},output:'loaded'}}},
      {type:'text',part:{text:prose ? 'Prepared configuration.\n```json\n'+JSON.stringify({compose})+'\n```\nExplanation after the artifact.' : JSON.stringify({compose})}}]});}
  finally{rmSync(directory,{recursive:true,force:true});}
}
test('deployment grading normalizes Compose and rejects broken queue invariants',async()=>{
  const good=await grade(artifact()); assert.ok(Object.values(good.checks).every(v=>v===true),JSON.stringify(good));
  assert.ok(Object.values((await grade(artifact(), true)).checks).every(v=>v===true));
  const wrongKey=artifact();wrongKey.services.worker.environment.N8N_ENCRYPTION_KEY='different';
  assert.equal((await grade(wrongKey)).checks.queue_env_shared,false);
  const wrongDb=artifact();wrongDb.services.worker.environment.DB_POSTGRESDB_PASSWORD='${N8N_ENCRYPTION_KEY}';
  assert.equal((await grade(wrongDb)).checks.database_auth_shared,false);
  const exposed=artifact();exposed.services.redis.ports=['6379:6379'];
  assert.equal((await grade(exposed)).checks.no_internal_ports,false);
  const unpinned=artifact();unpinned.services.main.image=unpinned.services.worker.image='n8nio/n8n:latest';
  assert.equal((await grade(unpinned)).checks.pinned_n8n_image,false);
  const external=artifact();external.services.main.env_file=['outside.env'];
  assert.equal((await grade(external)).checks.self_contained_manifest,false);
});
