import { groups } from './groups.mjs';
import { liveCases } from './live-cases.mjs';
export { groups };

export function loadCatalog() {
  const cases = liveCases();
  const ids = new Set();
  for (const scenario of cases) {
    if (ids.has(scenario.id) || !scenario.query || !scenario.skills?.length
      || !Object.hasOwn(groups, scenario.group)
      || (scenario.kind !== 'compose' && !scenario.fixtures?.length)) throw new Error(`Invalid execution scenario: ${scenario.id}`);
    ids.add(scenario.id);
  }
  for (const skill of Object.values(groups)) if (!cases.some(s => s.skills.includes(skill))) throw new Error(`No coverage for ${skill}`);
  return cases;
}
export function selectCases(cases, options) {
  let selected = cases.filter(value => (!options.group || options.group.split(',').includes(value.group)) && (!options.case || value.id === options.case));
  if (options.shard) {
    if (!/^\d+\/\d+$/.test(options.shard)) throw new Error('Shard must be i/n');
    const [index, total] = options.shard.split('/').map(Number);
    if (!Number.isInteger(index) || !Number.isInteger(total) || index < 1 || total < index) throw new Error('Shard must be i/n with 1 <= i <= n');
    selected = selected.filter((_, offset) => offset % total === index - 1);
  }
  if (options.limit) selected = selected.slice(0, options.limit);
  if (!selected.length) throw new Error('Selection matched no test cases');
  return selected;
}
export function parseOptions(args) {
  const result = { mode: 'all' };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (['--list', '--validate-catalog'].includes(arg)) result[arg.slice(2)] = true;
    else if (['--group', '--case', '--shard', '--mode', '--limit'].includes(arg)) {
      if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`Missing value for ${arg}`);
      result[arg.slice(2)] = args[++i];
    } else throw new Error(`Unknown option ${arg}`);
  }
  if (!['all', 'live', 'configuration'].includes(result.mode)) throw new Error('Mode must be all, live or configuration; text evaluations are archived and are not executable tests');
  if (result.group && !result.group.split(',').every(group => Object.hasOwn(groups, group))) throw new Error(`Unknown group ${result.group}`);
  if (result.limit && (!/^\d+$/.test(result.limit) || Number(result.limit) < 1)) throw new Error('Limit must be a positive integer');
  result.limit = result.limit ? Number(result.limit) : undefined;
  return result;
}
