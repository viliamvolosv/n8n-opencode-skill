// Retry only read-only startup checks, before the subject has done any work.
export async function waitForPreflight(check, { attempts = 3, pause = ms => new Promise(r => setTimeout(r, ms)), onAttempt = () => {} } = {}) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const result = await check();
      onAttempt({ attempt, status: 'PASS' });
      return result;
    } catch (error) {
      onAttempt({ attempt, status: 'ERROR', error: error.message });
      const transient = /timeout|timed out|aborted|fetch failed|socket|ECONN|HTTP (502|503|504)|preflight failed/i.test(error.message);
      if (!transient || attempt === attempts) throw error;
      await pause(1000);
    }
  }
}
