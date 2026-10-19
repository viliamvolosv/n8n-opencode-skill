import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { completeSession } from './agent-session.mjs';
import { terminalModelError, completionProblem } from './model-output.mjs';
import { providerConfiguration, redactProviderSecrets, testPermissions, defaultModel, testCompaction } from './provider.mjs';

export const primaryUrl = 'http://n8n:5678';
export const secondaryUrl = 'http://n8n-secondary:5678';
export let access = {}, secondaryAccess = {};
export function loadAccess() {
  access = JSON.parse(readFileSync('/secrets/access.json', 'utf8'));
  secondaryAccess = JSON.parse(readFileSync('/secrets-secondary/access.json', 'utf8'));
}
export const scrub = value => [access.n8nApiKey, access.mcpToken, secondaryAccess.n8nApiKey, secondaryAccess.mcpToken]
  .filter(Boolean).reduce((text, secret) => text.replaceAll(secret, '[REDACTED]'), redactProviderSecrets(value));
export function saveJson(path, value) {
  mkdirSync(path.slice(0, path.lastIndexOf('/')), { recursive: true });
  writeFileSync(path, scrub(JSON.stringify(value, null, 2)) + '\n');
}
export async function api(path, options = {}, target = 'prod') {
  const key = target === 'prod' ? access : secondaryAccess;
  const response = await fetch(`${target === 'prod' ? primaryUrl : secondaryUrl}/api/v1${path}`, {
    ...options, headers: { 'Content-Type': 'application/json', 'X-N8N-API-KEY': key.n8nApiKey, ...options.headers },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`n8n ${target} ${path}: HTTP ${response.status}: ${scrub(await response.text()).slice(0,1500)}`);
  return response.status === 204 ? {} : response.json();
}
export class Mcp {
  constructor(url = 'http://suite-proxy:3001/mcp', token = access.mcpToken) {
    this.url = url; this.token = token; this.session = undefined;
  }
  async rpc(method, params = {}, notification = false) {
    const response = await fetch(this.url, { method: 'POST', headers: {
      Authorization: `Bearer ${this.token}`, Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json',
      ...(this.session ? { 'Mcp-Session-Id': this.session } : {}),
    }, body: JSON.stringify({ jsonrpc: '2.0', ...(notification ? {} : { id: randomUUID() }), method, params }),
    signal: AbortSignal.timeout(45000) });
    if (!response.ok) throw new Error(`MCP ${method}: HTTP ${response.status}`);
    this.session = response.headers.get('mcp-session-id') || this.session;
    const text = await response.text();
    if (!text.trim()) return {};
    const reply = response.headers.get('content-type')?.includes('text/event-stream')
      ? JSON.parse(text.split('\n').filter(line => line.startsWith('data: ')).at(-1).slice(6)) : JSON.parse(text);
    if (reply.error) throw new Error(`MCP ${method}: ${reply.error.message}`);
    return reply.result;
  }
  async initialize() {
    await this.rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'n8n-skill-suite', version: '1.0.0' } });
    await this.rpc('notifications/initialized', {}, true);
    return this;
  }
  async call(name, args = {}) {
    const result = await this.rpc('tools/call', { name, arguments: args });
    const text = result.content?.filter(item => item.type === 'text').map(item => item.text).join('\n') || '';
    let data; try { data = JSON.parse(text); } catch { data = { text }; }
    return { failed: result.isError === true || data.success === false, data };
  }
  async close() {
    if (this.session) await fetch(this.url, { method: 'DELETE', headers: {
      Authorization: `Bearer ${this.token}`, 'Mcp-Session-Id': this.session,
    }, signal: AbortSignal.timeout(5000) }).catch(() => {});
  }
}
export const completedTools = events => events.filter(e => e.type === 'tool_use' && e.part?.state?.status === 'completed');
export const loadedSkills = events => completedTools(events).filter(e => e.part.tool === 'skill' && e.part.state.output)
  .map(e => e.part.state.input?.id);
export function answerText(events) {
  const text = events.findLast(e => e.type === 'text' && typeof e.part?.text === 'string')?.part.text || '';
  const boundary = text.lastIndexOf('</think>');
  return boundary < 0 ? text : text.slice(boundary + '</think>'.length).trim();
}
export function version() {
  const result = spawnSync('opencode', ['--version'], { encoding: 'utf8' });
  if (result.status !== 0 || !/\bv2\./.test(result.stdout)) throw new Error('OpenCode V2 is required');
  return result.stdout.trim();
}
export function configure(workdir, { model = process.env.SKILL_TEST_MODEL || defaultModel, tools } = {}) {
  mkdirSync(workdir, { recursive: true });
  // Explicit skill source supports a separate fresh workspace for every case.
  writeFileSync(`${workdir}/opencode.json`, JSON.stringify({
    ...providerConfiguration(model),
    compaction: testCompaction,
    skills: ['/work/.opencode/skills'],
    mcp: { servers: { n8n_mcp: {
      type: 'remote', url: 'http://suite-proxy:3001/mcp', oauth: false, codemode: false,
      headers: { Authorization: `Bearer ${access.mcpToken}` },
      timeout: { startup: 30000, catalog: 30000, execution: 60000 },
    } } },
    permissions: testPermissions(model, { tools }),
  }, null, 2));
}
export async function runAgent(options) {
  const result = await completeSession({ ...options, runTurn: args => runAgentTurn({ ...options, ...args,
    output: args.turn === 0 ? options.output : `${options.output}/continuation-${args.turn}`, requireAnswer: false }) });
  writeFileSync(`${options.output}/events.ndjson`, scrub(result.events.map(e => JSON.stringify(e)).join('\n')) + '\n');
  saveJson(`${options.output}/session.json`, { turns: result.turns, sameSessionContinuation: result.turns > 1 });
  return result.events;
}
async function runAgentTurn({ workdir, prompt, model, output, timeout = 360, requireAnswer = false, session }) {
  const child = spawn('opencode', ['run', '--standalone', '--format', 'json', '--model', model, ...(session ? ['--session', session] : []), '--title', output.split('/').at(-1), prompt],
    { cwd: workdir, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '', timedOut = false;
  mkdirSync(output, { recursive: true });
  const flush = () => {
    writeFileSync(`${output}/events.ndjson`, scrub(stdout));
    writeFileSync(`${output}/stderr.txt`, scrub(stderr));
  };
  const checkpoint = setInterval(flush, 5000); checkpoint.unref();
  const stop = () => {
    try { process.kill(-child.pid, 'SIGTERM'); } catch {}
    setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }, 2000).unref();
  };
  const timer = setTimeout(() => { timedOut = true; stop(); }, timeout * 1000);
  child.stdout.on('data', data => { stdout += data; if (stdout.length > 12 * 1024 * 1024) stop(); });
  child.stderr.on('data', data => { stderr = (stderr + data).slice(-256 * 1024); });
  let exit;
  try { exit = await new Promise((resolve, reject) => {
    child.once('error', reject); child.once('close', (code, signal) => resolve({ code, signal }));
  }); } finally { clearTimeout(timer); clearInterval(checkpoint); flush(); }
  mkdirSync(output, { recursive: true });
  writeFileSync(`${output}/events.ndjson`, scrub(stdout)); writeFileSync(`${output}/stderr.txt`, scrub(stderr));
  let events;
  try { events = stdout.split('\n').filter(line => line.trim()).map(line => JSON.parse(line)); }
  catch { throw new Error('Invalid OpenCode NDJSON; inspect case events'); }
  const error = terminalModelError(events);
  saveJson(`${output}/run.json`, { exit, timedOut, recoveredProviderErrors: !error ? events.filter(e => e.type === 'error').map(e => e.error) : [] });
  const incomplete = completionProblem(events);
  // A completed workflow task is assessed from n8n, even if no final prose was emitted.
  const truncated = ['length', 'max_tokens'].includes(events.findLast(e => e.type === 'step_finish')?.part?.reason);
  if (timedOut || exit.code !== 0 || error || truncated || (requireAnswer && incomplete)) {
    const log = '/root/.local/share/opencode/log/opencode.log';
    if (existsSync(log)) writeFileSync(`${output}/opencode.log`, scrub(readFileSync(log, 'utf8').slice(-128 * 1024)));
    throw new Error(scrub(timedOut ? 'Model timeout' : error?.error?.message || incomplete || `OpenCode exited ${exit.code}`));
  }
  return events;
}
export async function cleanupWorkflows(prefix, owned = []) {
  const errors = [];
  for (const target of ['prod', 'staging']) {
    const list = await api('/workflows?limit=100', {}, target);
    for (const workflow of list.data.filter(item => item.name.startsWith(prefix) || owned.some(w => w.target === target && w.id === item.id))) {
      try {
        if (workflow.active) await api(`/workflows/${workflow.id}/deactivate`, { method: 'POST' }, target);
        await api(`/workflows/${workflow.id}`, { method: 'DELETE' }, target);
      } catch (error) { errors.push(error.message); }
    }
  }
  if (errors.length) throw new Error(errors.join('; '));
}

// Recover complete native events after a killed/interrupted subject. A partial
// final NDJSON line is not evidence; previous completed calls remain evidence.
export function readSubjectEvents(directory) {
  return ['events.ndjson','continuation-1/events.ndjson'].flatMap(file => {
    const path = `${directory}/${file}`;
    if (!existsSync(path)) return [];
    return readFileSync(path,'utf8').split('\n').flatMap(line => {try{return [JSON.parse(line)];}catch{return [];}});
  });
}
