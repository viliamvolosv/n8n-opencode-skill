export const groqModel = 'groq/qwen/qwen3.8-27b';
export const kiloModel = 'kilo/poolside/laguna-s-2.1:free';
export const defaultModel = 'local/configured';
const discovered = new Map();
const metadataKey = env => `${env.LLM_BASE_URL?.trim()}|${env.LLM_MODEL_ID?.trim()}`;
export async function discoverProviderLimits(model, env = process.env, request = fetch) {
  if (model !== defaultModel) return undefined;
  validateModel(model, env);
  const root = env.LLM_BASE_URL.trim().replace(/\/+$/, '').replace(/\/v1$/, '');
  const headers = env.LLM_API_KEY?.trim() ? { Authorization: `Bearer ${env.LLM_API_KEY}` } : {};
  const response = await request(`${root}/api/v1/models`, { headers, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Cannot discover loaded LLM context: HTTP ${response.status}`);
  const data = await response.json();
  const id = env.LLM_MODEL_ID.trim();
  const entry = data.models?.find(m => m.key === id || m.loaded_instances?.some(i => i.id === id));
  const instances = entry?.loaded_instances || [];
  const instance = instances.find(i => i.id === id) || (instances.length === 1 ? instances[0] : undefined);
  const context = instance?.config?.context_length;
  if (!Number.isInteger(context) || context < 16384) throw new Error('LLM must be loaded with a discoverable context of at least 16384 tokens');
  const limits = { context, output: Math.min(16384, Math.floor(context / 3)), source: 'lmstudio-loaded-instance' };
  discovered.set(metadataKey(env), limits);
  return limits;
}
export const testCompaction = { auto: true, buffer: 12000, keep: { tokens: 8000 } };

export function validateModel(model, env = process.env) {
  if (model === defaultModel) {
    if (!env.LLM_BASE_URL?.trim() || !env.LLM_MODEL_ID?.trim()) throw new Error('LLM_BASE_URL and LLM_MODEL_ID repository secrets are required');
    const url = new URL(env.LLM_BASE_URL);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('LLM_BASE_URL must be an HTTP(S) base URL without credentials, query or fragment');
    return;
  }
  if (/^opencode\/(big-pickle|[a-z0-9.-]+-free)$/.test(model)) return;
  if (model === kiloModel) {
    if (!env.KILO_API_KEY?.trim()) throw new Error('KILO_API_KEY is required for Kilo tests; configure the repository Actions secret');
    return;
  }
  if (model !== groqModel) throw new Error(`Unsupported test model: ${model}`);
  if (!env.GROQ_API_KEY?.trim()) throw new Error('GROQ_API_KEY is required for Groq tests; configure the repository Actions secret');
}
export function providerConfiguration(model, env = process.env) {
  if (model === defaultModel) {
    validateModel(model, env);
    const url = env.LLM_BASE_URL.trim().replace(/\/+$/, '');
    return { providers: { local: {
      name: 'Configured CI LLM', env: ['LLM_BASE_URL', 'LLM_MODEL_ID', 'LLM_API_KEY'],
      package: '@opencode/ai/providers/openai-compatible',
      settings: { baseURL: url.endsWith('/v1') ? url : `${url}/v1`,
        ...(env.LLM_API_KEY?.trim() ? { apiKey: '{env:LLM_API_KEY}' } : {}) },
      models: { configured: {
        modelID: env.LLM_MODEL_ID.trim(), name: 'Configured CI model',
        capabilities: { tools: true, input: ['text'], output: ['text'] },
        limit: { context: discovered.get(metadataKey(env))?.context || 62000, output: discovered.get(metadataKey(env))?.output || 16384 },
      } },
    } } };
  }
  if (model === kiloModel) return { providers: { kilo: {
    name: 'Kilo', env: ['KILO_API_KEY'],
    package: '@opencode/ai/providers/openai-compatible',
    settings: { baseURL: 'https://api.kilo.ai/api/gateway', apiKey: '{env:KILO_API_KEY}' },
    models: { 'poolside/laguna-s-2.1:free': {
      modelID: 'poolside/laguna-s-2.1:free', name: 'Laguna S 2.1 Free',
      capabilities: { tools: true, input: ['text'], output: ['text'] },
      limit: { context: 262144, output: 32768 },
    } },
  } } };
  if (!model.startsWith('groq/')) return {};
  return { providers: { groq: {
    name: 'Groq', env: ['GROQ_API_KEY'],
    package: '@opencode/ai/providers/openai-compatible',
    settings: { baseURL: 'https://api.groq.com/openai/v1', apiKey: '{env:GROQ_API_KEY}' },
    models: { 'qwen/qwen3.8-27b': {
      modelID: 'qwen/qwen3.8-27b', name: 'Qwen 3.8 27B',
      capabilities: { tools: true, input: ['text', 'image'], output: ['text'] },
      limit: { context: 131042, output: 16384 },
      body: { reasoning_effort: 'none' },
    } },
  } } };
}
export function redactProviderSecrets(value, env = process.env) {
  let result = String(value);
  for (const key of [env.GROQ_API_KEY, env.KILO_API_KEY, env.LLM_API_KEY, env.LLM_BASE_URL, env.LLM_MODEL_ID]) {
    if (key) result = result.replaceAll(key, '[REDACTED]');
  }
  return result;
}

export function testPermissions(model, { tools } = {}) {
  const groq = model.startsWith('groq/') || model.startsWith('kilo/') || model.startsWith('local/');
  const permissions = [{ action: '*', resource: '*', effect: groq ? 'deny' : 'ask' }];
  permissions.push({ action: 'skill', resource: '*', effect: 'allow' },
    { action: 'external_directory', resource: '/work/.opencode/skills/*', effect: 'allow' },
    { action: 'read', resource: '/work/.opencode/skills/*', effect: 'allow' },
    { action: 'read', resource: '.opencode/skills/*', effect: 'allow' });
  for (const tool of groq && tools ? tools : ['*']) {
    permissions.push({ action: `n8n_mcp_${tool}`, resource: '*', effect: 'allow' });
  }
  return permissions;
}
