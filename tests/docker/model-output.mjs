// Some free reasoning models emit a thinking prefix in their text channel.
// Parse the final answer after that explicit boundary; never guess JSON from
// arbitrary prose or accept an older answer if the latest text is malformed.
export function lastJsonAnswer(events) {
  const event = events.findLast(item => item.type === 'text' && typeof item.part?.text === 'string');
  if (!event) return undefined;
  let text = event.part.text.trim();
  const boundary = text.lastIndexOf('</think>');
  if (boundary !== -1) text = text.slice(boundary + '</think>'.length).trim();
  text = text.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  try {
    const answer = JSON.parse(text);
    return answer && typeof answer === 'object' && !Array.isArray(answer) ? answer : undefined;
  } catch { return undefined; }
}

// Some free providers emit a recoverable stream error, then OpenCode retries and
// returns a later final answer. Preserve that trace without discarding the retry.
export function terminalModelError(events) {
  const lastError = events.findLastIndex(event => event.type === 'error');
  const lastAnswer = events.findLastIndex(event => event.type === 'text' && event.part?.text?.trim());
  return lastError >= 0 && lastError >= lastAnswer ? events[lastError] : undefined;
}

// Deployment is an artifact task: allow an explicitly delimited final JSON
// artifact surrounded by prose. Never search arbitrary prose for braces,
// use a stale text event, or fall back to an older block after a malformed one.
export function lastJsonArtifact(events, key) {
  const direct = lastJsonAnswer(events);
  if (direct) return Object.hasOwn(direct, key) ? direct : undefined;
  const text = events.findLast(e => e.type === 'text' && typeof e.part?.text === 'string')?.part.text || '';
  const blocks = [...text.matchAll(/```json\s*\n([\s\S]*?)\n```/g)];
  const block = blocks.at(-1);
  if (!block) return undefined;
  try {
    const value = JSON.parse(block[1]);
    return value && typeof value === 'object' && !Array.isArray(value) && Object.hasOwn(value, key) ? value : undefined;
  } catch { return undefined; }
}

export function completionProblem(events) {
  const finish = events.findLast(e => e.type === 'step_finish');
  if (['length', 'max_tokens'].includes(finish?.part?.reason)) return 'Model reached its output token limit';
  const lastTool = events.findLastIndex(e => e.type === 'tool_use');
  const lastText = events.findLastIndex(e => e.type === 'text' && e.part?.text?.trim());
  if (lastText < 0 || lastText < lastTool) return 'Model returned no final answer after its tool calls';
  return undefined;
}
