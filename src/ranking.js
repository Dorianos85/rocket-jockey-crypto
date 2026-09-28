const RUN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createRankingClient({ getClient } = {}) {
  const invoke = async body => {
    const client = getClient?.();
    if (!client) throw new Error('Shared ranking is not configured. Guest play is still available.');
    let response;
    try { response = await client.functions.invoke('rocket-ranked', { body }); }
    catch { throw new Error('Ranking is temporarily unavailable. Please try again.'); }
    const { data, error } = response;
    if (error) {
      let message;
      try { message = (await error.context?.json())?.error; } catch { /* Not all SDK errors contain a JSON response. */ }
      throw new Error(typeof message === 'string' ? message.slice(0, 240) : 'Ranking request failed. Sign in again or try later.');
    }
    if (data?.error) throw new Error(String(data.error).slice(0, 240));
    if (!data || typeof data !== 'object') throw new Error('Ranking returned an invalid response.');
    return data;
  };

  const fetchLeaderboard = async () => {
    const data = await invoke({ action: 'leaderboard' });
    if (!Array.isArray(data.entries)) throw new Error('Ranking returned an invalid leaderboard.');
    // Only the safe public projection crosses into rendering code.
    return data.entries.filter(entry => entry && typeof entry === 'object').slice(0, 50).map((entry, index) => ({
      rank: index + 1,
      handle: typeof entry.handle === 'string' ? entry.handle.slice(0, 40) : 'Pilot',
      provider: ['phantom', 'google'].includes(entry.provider) ? entry.provider : 'other',
      bestScore: Number.isSafeInteger(entry.bestScore) && entry.bestScore >= 0 ? entry.bestScore : 0,
      deliveries: Number.isSafeInteger(entry.deliveries) && entry.deliveries >= 0 ? entry.deliveries : 0,
      totalRuns: Number.isSafeInteger(entry.totalRuns) && entry.totalRuns >= 0 ? entry.totalRuns : 0,
    }));
  };

  const startRankedRun = async () => {
    const data = await invoke({ action: 'start' });
    if (!RUN_ID.test(data.runId) || !Number.isInteger(data.seed) || data.seed < 0 || data.seed > 2147483647 || !Number.isFinite(Date.parse(data.expiresAt))) {
      throw new Error('Ranking returned an invalid run. Please try again.');
    }
    return { runId: data.runId, seed: data.seed, expiresAt: data.expiresAt };
  };

  const fetchProfile = async () => {
    const data = await invoke({ action: 'profile' });
    if (typeof data.handle !== 'string' || !/^Pilot-[a-f0-9]{12}$/.test(data.handle)) throw new Error('Ranking returned an invalid pilot profile.');
    return { handle: data.handle, provider: ['phantom', 'google'].includes(data.provider) ? data.provider : 'other' };
  };

  const submitRun = async (runId, replay) => {
    if (!RUN_ID.test(runId) || !replay || typeof replay !== 'object') throw new Error('Invalid ranked run. Start a new run.');
    // No score, identity, seed, or provider is supplied by the caller.
    // The server uses the stored run seed and derives the score from the replay.
    return invoke({ action: 'submit', runId, replay });
  };
  return { fetchLeaderboard, fetchProfile, startRankedRun, submitRun };
}
