// IDs in successful native MCP create results identify objects owned by this
// subject. Names are display labels and must not be the sole lookup/cleanup key.
export function subjectWorkflows(events) {
  let target = 'prod'; const owned = [];
  for (const event of events) {
    const part = event.part, state = part?.state;
    if (event.type !== 'tool_use' || state?.status !== 'completed') continue;
    let result; try { result = JSON.parse(state.output); } catch { continue; }
    if (part.tool === 'n8n_mcp_n8n_instances') {
      const current = result.current?.name || result.data?.current?.name;
      if (['prod','staging','acme'].includes(current)) target = current === 'acme' ? 'staging' : current;
    }
    if (part.tool === 'n8n_mcp_n8n_create_workflow' && result.success === true && typeof result.data?.id === 'string') {
      if (!owned.some(w => w.id === result.data.id && w.target === target)) owned.push({ id: result.data.id, target });
    }
  }
  return owned;
}

export async function identifyWorkflow({ list, events, name, path, target = 'prod', seedId, read }) {
  const ids = new Set(subjectWorkflows(events).filter(w => w.target === target).map(w => w.id));
  if (seedId) ids.add(seedId);
  const candidates = list.filter(w => ids.has(w.id) || w.name === name);
  const workflows = await Promise.all(candidates.map(w => read(w.id)));
  const hasWebhook = w => w.nodes?.some(n => n.type === 'n8n-nodes-base.webhook');
  const matching = workflows.filter(w => w.nodes?.some(n => n.type === 'n8n-nodes-base.webhook' && n.parameters?.path === path));
  if (matching.length > 1) throw new Error('Multiple subject workflows claim the same test webhook path');
  // Preserve the saved object for useful contract diagnostics if its path is
  // wrong; the verifier still rejects the wrong path before executing requests.
  return matching[0] || workflows.find(w => w.name === name) || (workflows.filter(hasWebhook).length === 1 ? workflows.find(hasWebhook) : undefined);
}
