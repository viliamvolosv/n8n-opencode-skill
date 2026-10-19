import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { Mcp, access, secondaryAccess, loadAccess } from './runtime.mjs';
loadAccess();

// Contract fixture for the hosted-only n8n_instances surface. Ordinary tool
// calls are forwarded unchanged to REAL n8n-mcp servers backed by two real n8ns.
// This does not claim to test the proprietary hosted implementation.
const sessions = new Map();
const send = (res, status, value, id) => { res.writeHead(status, { 'Content-Type': 'application/json',
  ...(id ? { 'Mcp-Session-Id': id } : {}) }); res.end(value === undefined ? '' : JSON.stringify(value)); };
const instance = name => ({ id: name, name, url: name === 'prod' ? 'http://n8n:5678' : 'http://n8n-secondary:5678', isDefault: name === 'prod' });
http.createServer(async (req, res) => {
  if (req.url === '/health') return send(res, 200, { ok: true });
  if (req.headers.authorization !== `Bearer ${access.mcpToken}`) return send(res, 401, { error: 'Unauthorized' });
  let sessionId = req.headers['mcp-session-id'];
  if (req.method === 'DELETE') {
    const state = sessions.get(sessionId);
    if (state) await Promise.all(Object.values(state.backends).map(backend => backend.close()));
    sessions.delete(sessionId); return send(res, 200, {});
  }
  if (req.method !== 'POST') return send(res, 405, { error: 'POST required' });
  let input;
  try {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    input = JSON.parse(Buffer.concat(chunks).toString());
    if (input.method === 'initialize') {
      sessionId = randomUUID();
      const prod = await new Mcp('http://n8n-mcp:3000/mcp', access.mcpToken).initialize();
      const staging = await new Mcp('http://n8n-mcp-secondary:3000/mcp', secondaryAccess.mcpToken).initialize();
      sessions.set(sessionId, { current: 'prod', explicit: false, backends: { prod, staging } });
      return send(res, 200, { jsonrpc: '2.0', id: input.id, result: {
        protocolVersion: input.params.protocolVersion, capabilities: { tools: {} },
        serverInfo: { name: 'n8n-multi-instance-contract-fixture', version: '1.0.0' },
      } }, sessionId);
    }
    const state = sessions.get(sessionId);
    if (!state) return send(res, 400, { error: 'Initialize first' });
    if (input.method.startsWith('notifications/')) return send(res, 202);
    const backend = state.backends[state.current === 'prod' ? 'prod' : 'staging'];
    let result;
    if (input.method === 'tools/list') {
      result = await backend.rpc('tools/list');
      result.tools.push({ name: 'n8n_instances', description: 'CONTRACT FIXTURE: choose between real disposable prod/staging n8n instances. acme aliases staging.',
        inputSchema: { type: 'object', properties: { mode: { type: 'string', enum: ['list', 'switch'] }, name: { type: 'string' } }, required: ['mode'] } });
    } else if (input.method === 'tools/call' && input.params.name === 'n8n_instances') {
      const args = input.params.arguments || {};
      let value;
      if (args.mode === 'list') value = { current: instance(state.current), default: instance('prod'),
        available: ['prod', 'staging', 'acme'].map(name => ({ ...instance(name), isCurrent: name === state.current })) };
      else if (args.mode === 'switch' && ['prod', 'staging', 'acme'].includes(args.name?.toLowerCase())) {
        const previous = instance(state.current); state.current = args.name.toLowerCase(); state.explicit = true;
        value = { previous, current: instance(state.current) };
      } else value = { error: 'UNKNOWN_INSTANCE', message: 'Choose prod, staging or acme' };
      result = { content: [{ type: 'text', text: JSON.stringify(value) }] };
    } else result = await backend.rpc(input.method, input.params);
    send(res, 200, { jsonrpc: '2.0', id: input.id, result }, sessionId);
  } catch (error) { send(res, 200, { jsonrpc: '2.0', id: input?.id ?? null, error: { code: -32603, message: error.message } }, sessionId); }
}).listen(3001, '0.0.0.0', () => console.log('Multi-instance contract proxy ready (two real n8n backends)'));
