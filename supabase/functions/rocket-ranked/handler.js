import { verifyReplay } from '../../../src/replay.js';

const MAX_BODY_BYTES = 128 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
};
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } });
class RequestError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function readBody(request) {
  if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES) throw new RequestError(413, 'Request is too large.');
  if (!request.body) throw new RequestError(400, 'A JSON request body is required.');
  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BODY_BYTES) { await reader.cancel(); throw new RequestError(413, 'Request is too large.'); }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    const value = JSON.parse(text);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid object');
    return value;
  } catch (error) {
    if (error instanceof RequestError) throw error;
    throw new RequestError(400, 'Invalid JSON request.');
  } finally { reader.releaseLock(); }
}

function providerOf(user) {
  const identities = Array.isArray(user?.identities) ? user.identities : [];
  if (identities.some(identity => identity.provider === 'google')) return 'google';
  if (identities.some(identity => ['solana', 'web3', 'web3:solana'].includes(identity.provider))) return 'phantom';
  return null;
}

function databaseResult(result) {
  if (result.error) throw new Error('Database operation failed');
  return result.data;
}

const safeCount = value => Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : 0;
const publicProfile = profile => ({ handle: profile.handle, provider: profile.provider });

export function createRankedHandler({ db, authenticate, now = Date.now }) {
  async function ensureProfile(user, provider) {
    databaseResult(await db.from('rocket_profiles').upsert({ user_id: user.id, provider }, { onConflict: 'user_id', ignoreDuplicates: true }));
    const profile = databaseResult(await db.from('rocket_profiles').select('handle,provider').eq('user_id', user.id).single());
    if (!profile) throw new Error('Profile unavailable');
    return profile;
  }

  return async request => {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (request.method !== 'POST') return json(405, { error: 'Use POST for ranking requests.' });
    try {
      const body = await readBody(request);
      if (!['leaderboard', 'profile', 'start', 'submit'].includes(body.action)) throw new RequestError(400, 'Unknown ranking action.');
      if (body.action === 'leaderboard') {
        const rows = databaseResult(await db.rpc('rocket_leaderboard')) || [];
        return json(200, { entries: rows.slice(0, 50).map((row, index) => ({
          rank: index + 1, handle: row.handle, provider: row.provider,
          bestScore: safeCount(row.best_score), deliveries: safeCount(row.deliveries), totalRuns: safeCount(row.total_runs),
        })) });
      }

      const token = request.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
      if (!token || token.length > 16384) throw new RequestError(401, 'Sign in with Phantom or Google to rank a run.');
      let auth;
      try { auth = await authenticate(token); } catch { throw new RequestError(401, 'Your session could not be verified. Please sign in again.'); }
      const user = auth?.data?.user;
      if (auth?.error || !user?.id || !UUID.test(user.id)) throw new RequestError(401, 'Your session has expired. Please sign in again.');
      const provider = providerOf(user);
      if (!provider) throw new RequestError(403, 'Use Phantom or Google to enter the shared ranking.');

      if (body.action === 'profile') return json(200, publicProfile(await ensureProfile(user, provider)));

      if (body.action === 'start') {
        const timestamp = now();
        const limit = await db.from('rocket_runs').select('id', { count: 'exact', head: true }).eq('user_id', user.id).gte('started_at', new Date(timestamp - 3600000).toISOString());
        databaseResult(limit);
        if (limit.count === null || limit.count === undefined) throw new Error('Run count unavailable');
        if (limit.count >= 20) throw new RequestError(429, 'You have reached 20 ranked runs this hour. Try guest practice while you wait.');
        await ensureProfile(user, provider);
        const seed = crypto.getRandomValues(new Uint32Array(1))[0] & 0x7fffffff;
        const run = databaseResult(await db.from('rocket_runs').insert({
          user_id: user.id, seed, started_at: new Date(timestamp).toISOString(), expires_at: new Date(timestamp + 20 * 60000).toISOString(),
        }).select('id,seed,expires_at').single());
        return json(200, { runId: run.id, seed: run.seed, expiresAt: run.expires_at });
      }

      if (typeof body.runId !== 'string' || !UUID.test(body.runId)) throw new RequestError(400, 'Invalid ranked run.');
      const run = databaseResult(await db.from('rocket_runs').select('id,seed,status,started_at,expires_at').eq('id', body.runId).eq('user_id', user.id).maybeSingle());
      if (!run) throw new RequestError(404, 'Ranked run was not found.');
      if (run.status !== 'active') throw new RequestError(409, 'This run has already been submitted or closed.');
      if (now() >= Date.parse(run.expires_at)) throw new RequestError(410, 'This ranked run has expired. Start a new run.');
      let result;
      try { result = verifyReplay(run.seed, body.replay); }
      catch { throw new RequestError(400, 'The run replay is invalid or incomplete. Start a new run.'); }
      if ((now() - Date.parse(run.started_at)) / 1000 < result.duration - 1) throw new RequestError(400, 'This run finished too quickly to be verified.');
      const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(body.replay)));
      const replayHash = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
      const finishedAt = new Date(now()).toISOString();
      const saved = databaseResult(await db.from('rocket_runs').update({
        status: 'verified', finished_at: finishedAt, score: result.score, deliveries: result.deliveries,
        duration: result.duration, reason: result.reason, replay_hash: replayHash,
      }).eq('id', body.runId).eq('user_id', user.id).eq('status', 'active').gt('expires_at', finishedAt)
        .select('score,deliveries,duration,reason').maybeSingle());
      if (!saved) throw new RequestError(409, 'This run was already submitted or expired.');
      return json(200, { verified: true, score: saved.score, deliveries: saved.deliveries, duration: Number(saved.duration), reason: saved.reason });
    } catch (error) {
      if (error instanceof RequestError) return json(error.status, { error: error.message });
      return json(500, { error: 'Ranking is temporarily unavailable. Please try again.' });
    }
  };
}
