// Dedicated runner fallback if the process/job is killed before shell traps run.
// Only this test harness's timestamped Compose projects are eligible.
import { execFileSync } from 'node:child_process';
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8' }).trim();
const maxAge = Number(process.env.SKILL_CI_MAX_AGE_SECONDS || 10800);
if (!Number.isFinite(maxAge) || maxAge < 7200) throw new Error('Minimum cleanup age is two hours');
function sweep() {
  for (const kind of ['container', 'network', 'volume', 'image']) {
    try {
      const args = kind === 'container' ? ['ps', '-aq'] : [kind, 'ls', '-q'];
      const ids = new Set(docker(...args, '--filter', 'label=com.docker.compose.project').split('\n').filter(Boolean));
      for (const id of ids) removeIfOld(kind, id);
    } catch (error) { console.error(`Janitor ${kind}: ${error.message}`); }
  }
}
function removeIfOld(kind, id) {
  const item = JSON.parse(docker(kind, 'inspect', id))[0];
  const project = (item.Config?.Labels || item.Labels || {})['com.docker.compose.project'];
  const match = /^n8n-skill-ci-(\d+)-\d+$/.exec(project || '');
  if (!match || Date.now() / 1000 - Number(match[1]) < maxAge) return;
  docker(kind, 'rm', ...(kind === 'container' ? ['-f'] : []), id);
  console.log(`Removed expired test ${kind}: ${project}`);
}
sweep();
if (process.env.SKILL_CI_ONCE !== 'true') setInterval(sweep, 60000);
