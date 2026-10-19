import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import { loadCatalog, selectCases, parseOptions, groups } from './catalog.mjs';
import { defaultModel, validateModel, discoverProviderLimits } from './provider.mjs';
import { runAndVerify, outcomeStatus } from './subject-outcome.mjs';
import { subjectWorkflows } from './workflow-identity.mjs';
import { waitForPreflight } from './preflight.mjs';
import { gradeLive, livePrompt, seedRepair } from './live-grader.mjs';
import { api, Mcp, loadAccess, configure, runAgent, saveJson, scrub, cleanupWorkflows, readSubjectEvents, version } from './runtime.mjs';

const options = parseOptions(process.argv.slice(2));
const catalog = loadCatalog();
const full = catalog.filter(s => options.mode === 'all' || (options.mode === 'configuration' ? s.kind === 'compose' : s.kind !== 'compose'));
const selected = selectCases(full, options);
if (options.list || options['validate-catalog']) {
  if (options.list) console.log(JSON.stringify(selected.map(({ id, group, skills, layer }) => ({ id, group, skills, layer })), null, 2));
  else console.log(`Catalog valid: ${catalog.filter(s => s.kind !== 'compose').length} real n8n execution cases, ${catalog.filter(s => s.kind === 'compose').length} configuration case; no LLM evaluator`);
  process.exit(0);
}
const model = process.env.SKILL_TEST_MODEL || defaultModel;
const timeout = Number(process.env.SKILL_TEST_TIMEOUT_SECONDS || 360);
const maxErrors = Number(process.env.SKILL_TEST_MAX_ERRORS || 2);
validateModel(model);
if (!Number.isInteger(timeout) || timeout < 1 || timeout > 600 || !Number.isInteger(maxErrors) || maxErrors < 1) throw new Error('Invalid timeout/error limit');
mkdirSync('/results/cases', { recursive: true });
const report = { status: 'ERROR', started: new Date().toISOString(), model, evaluation: 'deterministic-n8n', timeoutSeconds: timeout, maxErrors,
  versions: { opencode: version(), n8n: '2.38.5', n8nMcp: '2.92.1' },
  sourceCommit: JSON.parse(readFileSync('/opt/upstream.json', 'utf8')).commit,
  selected: selected.map(value => value.id), results: [],
  scope: { live: 'Real n8n executions and independent assertions; local deterministic service fixtures',
    selfHosting: 'Compose normalization and configuration invariants only; no deployment',
    archived: '63 text scenarios are reference material, not executed or counted as coverage' } };
function writeReports() {
  const counts = Object.fromEntries(['PASS', 'FAIL', 'ERROR', 'NOT_RUN'].map(status => [status, report.results.filter(r => r.status === status).length]));
  report.pending = selected.filter(s => !report.results.some(r => r.id === s.id)).map(s => s.id);
  counts.NOT_RUN += report.pending.length;
  report.counts = counts;
  report.status = counts.ERROR || counts.NOT_RUN ? 'ERROR' : counts.FAIL ? 'FAIL' : 'PASS';
  report.coverage = Object.entries(groups).map(([group, skill]) => ({ group, skill,
    selected: selected.filter(s => s.group === group).length,
    executed: report.results.filter(r => r.group === group && r.status !== 'NOT_RUN').length,
    livePassed: report.results.some(r => r.group === group && r.layer !== 'deployment-configuration' && r.status === 'PASS'),
    configurationPassed: report.results.some(r => r.group === group && r.layer === 'deployment-configuration' && r.status === 'PASS'),
  }));
  saveJson('/results/report.json', report);
  const escape = value => String(value).replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
  const pending = selected.filter(s => report.pending.includes(s.id)).map(s => ({ ...s, status: 'NOT_RUN', reason: 'Run has not reached this case' }));
  const xml = [...report.results, ...pending].map(result => {
    const detail = escape(result.error || result.cleanupError || JSON.stringify(result.checks || {}));
    const outcome = result.status === 'PASS' ? '' : result.status === 'NOT_RUN' ? `<skipped message="${escape(result.reason)}"/>`
      : result.status === 'ERROR' ? `<error message="Runner/provider error">${detail}</error>` : `<failure message="Execution contract failed">${detail}</failure>`;
    return `<testcase classname="${escape(result.group)}" name="${escape(result.id)}" time="${result.durationSeconds || 0}">${outcome}</testcase>`;
  }).join('');
  writeFileSync('/results/junit.xml', `<testsuite name="n8n-skill-suite" tests="${selected.length}" failures="${counts.FAIL}" errors="${counts.ERROR}" skipped="${counts.NOT_RUN}">${xml}</testsuite>\n`);
}
// Keep reporting synchronous so a completed case remains durable if a later one fails.

async function liveCase(scenario, context) {
  const path = `skill-ci/${randomUUID()}`;
  let seedId;
  if (scenario.kind === 'repair') {
    seedId = await seedRepair(context.prefix, path);
    const mcp = await new Mcp().initialize();
    try {
      const initial = await mcp.call('n8n_validate_workflow', { id: seedId });
      saveJson(`${context.directory}/initial-validation.json`, initial.data);
      if ((initial.data.data?.valid ?? initial.data.valid) !== false) throw new Error('Repair fixture must initially fail validation');
    } finally { await mcp.close(); }
  }
  saveJson(`${context.directory}/task.json`, {name:context.prefix, path, target:scenario.target, seedId});
  return runAndVerify({
    run: () => runAgent({workdir:context.workdir, prompt:livePrompt({scenario, name:context.prefix, path, seedId}),
      model, output:context.directory, timeout, requireAnswer:scenario.kind === 'compose'}),
    recover: () => readSubjectEvents(context.directory),
    verify: async events => {
      context.events = events;
      return gradeLive({scenario, name:context.prefix, path, events, directory:context.directory, seedId});
    },
  });
}
try {
  report.modelLimits = await discoverProviderLimits(model);
  loadAccess();
  report.preflightAttempts = [];
  await waitForPreflight(async () => {
    const mcp = new Mcp();
    try {
      await mcp.initialize();
      const health = await mcp.call('n8n_health_check');
      if (health.failed || (health.data.data?.status ?? health.data.status) !== 'ok') throw new Error('Real n8n/MCP preflight failed');
      for (const target of ['prod', 'staging']) await api('/workflows?limit=1', {}, target);
      if (!(await fetch('http://fixture-api:8080/health', {signal: AbortSignal.timeout(10000)})).ok) throw new Error('Local fixture API preflight failed');
      report.preflight = { primary: true, secondary: true, fixtureApi: true };
    } finally { await mcp.close(); }
  }, { onAttempt: attempt => {
    if (attempt.status === 'ERROR') console.error(scrub(`PREFLIGHT attempt ${attempt.attempt}: ${attempt.error}`));
    report.preflightAttempts.push({...attempt, ...(attempt.error ? {error: scrub(attempt.error)} : {})});
    saveJson('/results/preflight.json', report.preflightAttempts);
  } });
  for (const scenario of selected) {
    if (report.results.filter(r => r.status === 'ERROR').length >= maxErrors) {
      report.results.push({ id: scenario.id, group: scenario.group, layer: scenario.layer, status: 'NOT_RUN', reason: 'Circuit breaker: runner/provider error limit reached' });
      writeReports(); continue;
    }
    const started = Date.now();
    const context = { prefix: `ci-${scenario.id}-${randomUUID()}`, workdir: `/tmp/skill-subject-${scenario.id}-${randomUUID()}`,
      directory: `/results/cases/${scenario.id}` };
    mkdirSync(context.directory, { recursive: true }); configure(context.workdir, { model,
      tools: ['n8n_instances', 'n8n_update_full_workflow', 'validate_node', 'n8n_test_workflow', 'n8n_executions', 'get_node', 'tools_documentation', 'search_nodes', 'validate_workflow', 'n8n_validate_workflow', 'n8n_create_workflow', 'n8n_get_workflow', 'n8n_update_partial_workflow', 'n8n_list_workflows', 'n8n_health_check'] });
    const result = { id: scenario.id, group: scenario.group, skills: scenario.skills, layer: scenario.layer,
      skillHashes: Object.fromEntries(scenario.skills.map(skill => [skill, createHash('sha256').update(readFileSync(`/work/.opencode/skills/${skill}/SKILL.md`)).digest('hex')])) };
    console.log(`RUN ${scenario.id} [${scenario.layer}]`);
    try {
      Object.assign(result, await liveCase(scenario, context));
      result.status = outcomeStatus(result);
      if (result.status === 'ERROR' && result.subjectRun?.error) result.error = result.subjectRun.error;
    } catch (error) { result.status = 'ERROR'; result.error = scrub(error.message); }
    finally {
      const evidence = context.events || readSubjectEvents(context.directory);
      try { await cleanupWorkflows(context.prefix, subjectWorkflows(evidence)); } catch (error) { result.status = 'ERROR'; result.cleanupError = scrub(error.message); }
      result.durationSeconds = (Date.now() - started) / 1000;
      saveJson(`${context.directory}/result.json`, result);
      report.results.push(result); writeReports();
      console.log(`${result.status} ${scenario.id}${result.error ? ': ' + result.error : ''}`);
      if (result.subjectRun?.status === 'INTERRUPTED') console.log(scrub(`SUBJECT ${scenario.id}: ${result.subjectRun.error}; independent n8n verdict: ${result.status}`));
      if (result.status !== 'PASS' && result.checks) {
        console.log(`FAILED CHECKS ${scenario.id}: ${Object.entries(result.checks || {}).filter(([, value]) => value !== true).map(([name]) => name).join(', ')}`);
        for (const observation of result.observations || []) if (!observation.passed || observation.execution?.status !== 'success') console.log(scrub(JSON.stringify(observation)));
      }
    }
  }
} catch (error) {
  report.error = scrub(error.message);
  for (const scenario of selected.filter(s => !report.results.some(r => r.id === s.id))) {
    report.results.push({ id: scenario.id, group: scenario.group, layer: scenario.layer, status: 'NOT_RUN', reason: report.error });
  }
} finally {
  report.finished = new Date().toISOString(); writeReports();
  console.log(`${report.status}: ${JSON.stringify(report.counts)}`);
  process.exitCode = report.status === 'PASS' ? 0 : report.status === 'FAIL' ? 1 : 2;
}
