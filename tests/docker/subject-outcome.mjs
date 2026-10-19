// The task's observable artifact/execution is the oracle, even if the subject
// did not finish its final prose before the deadline. Never rerun the subject.
export async function runAndVerify({ run, recover, verify }) {
  let events, error;
  try { events = await run(); }
  catch (failure) {
    error = failure.message;
    events = await recover();
    if (!events.length) throw failure;
  }
  const result = await verify(events);
  return { ...result, subjectRun: { status: error ? 'INTERRUPTED' : 'COMPLETED', ...(error ? { error } : {}) } };
}
export function outcomeStatus(result) {
  const checks = Object.values(result.checks || {});
  if (checks.length && checks.every(v => v === true)) return 'PASS';
  return result.subjectRun?.status === 'INTERRUPTED' ? 'ERROR' : 'FAIL';
}
