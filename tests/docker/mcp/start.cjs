const access = JSON.parse(require('node:fs').readFileSync('/secrets/access.json', 'utf8'));
process.env.N8N_API_KEY = access.n8nApiKey;
process.env.AUTH_TOKEN = access.mcpToken;
const child = require('node:child_process').spawn(process.execPath, ['/app/dist/mcp/index.js'], {
  env: process.env, stdio: 'inherit',
});
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => child.kill(signal));
child.on('error', error => { console.error(error.message); process.exit(2); });
child.on('exit', code => process.exit(code ?? 1));
