import { completionProblem } from './model-output.mjs';

// Continue a prematurely ended tool turn in the SAME session. This is not a
// fresh subject retry: created objects and all previous mistakes remain visible.
export async function completeSession({ runTurn, prompt, timeout = 360, requireAnswer = false, now = Date.now }) {
  const deadline = now() + timeout * 1000;
  const events = [];
  let session;
  for (let turn = 0; turn < 2; turn++) {
    const remaining = Math.floor((deadline - now()) / 1000);
    if (remaining < 1) throw new Error('Model timeout');
    const next = await runTurn({ turn, session, timeout: remaining, prompt: turn === 0 ? prompt
      : 'Continue the SAME unfinished task from the tool results already in this session. Do not repeat completed reads or recreate existing workflows. Finish any remaining work and provide the requested artifact or a final summary of the actual outcome.' });
    events.push(...next);
    const problem = completionProblem(next);
    if (!problem) return { events, turns: turn + 1 };
    if (/token limit/.test(problem)) throw new Error(problem);
    session = next.findLast(e => e.sessionID)?.sessionID;
    if (!session || turn === 1) {
      if (requireAnswer) throw new Error(problem);
      return { events, turns: turn + 1 };
    }
  }
}
