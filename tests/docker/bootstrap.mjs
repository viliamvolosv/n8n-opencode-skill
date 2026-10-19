import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';

// Only a fresh disposable instance is supported. Never log cookies or API keys.
const base = process.env.N8N_TEST_SECONDARY === 'true' ? 'http://n8n-secondary:5678' : 'http://n8n:5678';
async function main() {
  const setup = await fetch(`${base}/rest/owner/setup`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'ci@example.invalid', firstName: 'Skill', lastName: 'Test',
      password: `Ci9!${randomBytes(24).toString('hex')}` }),
    signal: AbortSignal.timeout(15000),
  });
  if (!setup.ok) throw new Error(`Owner setup failed (${setup.status}); use a fresh test volume`);
  const cookie = setup.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  if (!cookie) throw new Error('Owner setup did not return a session cookie');
  const scopes = ['workflow:create', 'workflow:read', 'workflow:list', 'workflow:update', 'workflow:delete',
    'workflow:activate', 'workflow:deactivate', 'execution:read', 'execution:list'];
  const response = await fetch(`${base}/rest/api-keys`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ label: 'Disposable skill CI', expiresAt: Math.floor(Date.now() / 1000) + 24 * 3600, scopes }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`API key creation failed (${response.status})`);
  const value = await response.json();
  const key = value.data?.rawApiKey;
  if (typeof key !== 'string' || !key) throw new Error('API key response has no rawApiKey');
  let fixtureCredential;
  if (process.env.SKILL_TEST_SUITE === 'true') {
    const credential = await fetch(`${base}/rest/credentials`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ name: 'Local protocol fixture', type: 'openAiApi',
        data: { apiKey: 'fixture-not-a-real-key', url: 'http://fixture-api:8080/v1' } }),
      signal: AbortSignal.timeout(15000) });
    if (!credential.ok) throw new Error(`Fixture credential creation failed (${credential.status})`);
    const created = await credential.json(); fixtureCredential = { id: created.data.id, name: created.data.name };
  }
  mkdirSync('/secrets', { recursive: true });
  writeFileSync('/secrets/access.json', JSON.stringify({ n8nApiKey: key, mcpToken: randomBytes(32).toString('hex'), fixtureCredential }), { mode: 0o644 });
  console.log('Initialized disposable n8n owner and ephemeral workflow API key');
}
main().catch(error => { console.error(error.message); process.exitCode = 2; });
