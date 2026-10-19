// Verdicts come only from persisted n8n state and executions, never model prose.
export function connected(workflow, source, target, type) {
  return !source?.disabled && !target?.disabled && !!workflow.connections?.[source?.name]?.[type]?.[0]
    ?.some(edge => edge.node === target?.name && edge.type === type && edge.index === 0);
}

export function executionMatches(record, workflowId, requestId) {
  if (String(record.workflowId) !== String(workflowId) || record.mode !== 'webhook') return false;
  const nodes = record.workflowData?.nodes || [];
  return nodes.filter(n => n.type === 'n8n-nodes-base.webhook').some(node =>
    (record.data?.resultData?.runData?.[node.name] || []).some(run =>
      run.data?.main?.some(items => items?.some(item => item.json?.headers?.['x-skill-test-id'] === requestId))));
}

export function requiredRuntimeTypes(scenario, input, webhook) {
  const types = {
    python: ['n8n-nodes-base.code'], javascript: ['n8n-nodes-base.code'],
    http: ['n8n-nodes-base.httpRequest'], repair: ['n8n-nodes-base.httpRequest'],
    binary: ['n8n-nodes-base.httpRequest'],
    'error-path': Object.hasOwn(input, 'amount') ? ['n8n-nodes-base.httpRequest'] : [],
    subworkflow: ['n8n-nodes-base.executeWorkflow'],
    'agent-http-tool': ['@n8n/n8n-nodes-langchain.agent', '@n8n/n8n-nodes-langchain.lmChatOpenAi',
      ['n8n-nodes-base.httpRequestTool', '@n8n/n8n-nodes-langchain.toolHttpRequest']],
    'code-tool': ['@n8n/n8n-nodes-langchain.agent', '@n8n/n8n-nodes-langchain.lmChatOpenAi', '@n8n/n8n-nodes-langchain.toolCode'],
  }[scenario.kind] || [];
  const responseTypes = scenario.kind === 'binary' && webhook?.parameters?.responseMode === 'lastNode'
    ? [] : ['n8n-nodes-base.respondToWebhook'];
  return ['n8n-nodes-base.webhook', ...types, ...responseTypes];
}

export function executionChecks(record, scenario, input) {
  const nodes = record?.workflowData?.nodes || [];
  const runData = record?.data?.resultData?.runData || {};
  const webhook = nodes.find(n => n.type === 'n8n-nodes-base.webhook');
  return {
    successful: record?.status === 'success' && !record?.data?.resultData?.error,
    requiredNodesExecuted: requiredRuntimeTypes(scenario, input, webhook).every(types => nodes.some(node =>
      [types].flat().includes(node.type) && !node.disabled && runData[node.name]?.length > 0
      && (scenario.kind !== 'python' || node.type !== 'n8n-nodes-base.code' || node.parameters?.language === 'pythonNative')
      && (scenario.kind !== 'javascript' || node.type !== 'n8n-nodes-base.code' || [undefined, 'javaScript'].includes(node.parameters?.language)))),
  };
}

// Resource locator labels and workflow names are presentation metadata. Follow
// the actual saved ID to inspect the child that n8n really executes.
export function referencedChildId(caller) {
  if (!caller || caller.disabled || ![undefined, 'database'].includes(caller.parameters?.source)) return undefined;
  const locator = caller.parameters?.workflowId;
  const id = typeof locator === 'object' && locator !== null ? locator.value : locator;
  return typeof id === 'string' && id.trim() && !id.startsWith('=') ? id : undefined;
}
