import test from 'node:test';
import assert from 'node:assert/strict';
import { createRankedHandler } from '../supabase/functions/rocket-ranked/handler.js';
import { createState, stepState } from '../src/game-core.js';
import { createReplayRecorder, FIXED_STEP, verifyReplay } from '../src/replay.js';

const USER = '01234567-89ab-cdef-0123-456789abcdef';
const RUN = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const NOW = Date.parse('2026-09-29T12:00:00Z');
const authenticated = async () => ({ data: { user: { id: USER, identities: [{ provider: 'google' }] } }, error: null });
const request = (body, token = 'valid-token') => new Request('https://example.test/rocket-ranked', {
  method: 'POST', headers: token ? { authorization: `Bearer ${token}` } : {}, body: typeof body === 'string' ? body : JSON.stringify(body),
});

// Script response boundaries without reimplementing the database's query engine.
function fakeDb(...responses) {
  const calls = [];
  const take = query => {
    calls.push(query);
    assert.ok(responses.length, 'unexpected database request');
    const response = responses.shift();
    return typeof response === 'function' ? response(query) : response;
  };
  return { calls,
    rpc(name) { return Promise.resolve(take({ rpc: name })); },
    from(table) {
      const query = { table, operations: [] };
      const builder = {};
      for (const method of ['select', 'upsert', 'insert', 'update', 'eq', 'gte', 'gt']) builder[method] = (...args) => { query.operations.push([method, ...args]); return builder; };
      builder.single = builder.maybeSingle = () => Promise.resolve(take(query));
      builder.then = (resolve, reject) => Promise.resolve(take(query)).then(resolve, reject);
      return builder;
    },
  };
}
const ok = data => ({ data, error: null });
const activeRun = () => ({ id: RUN, seed: 741, status: 'active', started_at: new Date(NOW - 100000).toISOString(), expires_at: new Date(NOW + 100000).toISOString() });
function finishedReplay() {
  const state = createState(741);
  state.status = 'running';
  const recorder = createReplayRecorder();
  while (state.status === 'running') { recorder.record({}); stepState(state, {}, FIXED_STEP); }
  return recorder.finish();
}

test('public leaderboard exposes only pseudonym and ranking fields', async () => {
  const db = fakeDb(ok([{ handle: 'Pilot-123456abcdef', provider: 'google', best_score: 900, deliveries: 4, total_runs: 7, user_id: USER, email: 'hidden@example.com' }]));
  const handler = createRankedHandler({ db, authenticate: () => assert.fail('Public read should not authenticate') });
  const response = await handler(request({ action: 'leaderboard' }, null));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*');
  assert.deepEqual(await response.json(), { entries: [{ rank: 1, handle: 'Pilot-123456abcdef', provider: 'google', bestScore: 900, deliveries: 4, totalRuns: 7 }] });
});

test('rejects malformed, oversized, unknown and unauthorized requests before database access', async () => {
  const handler = createRankedHandler({ db: fakeDb(), authenticate: async () => ({ error: new Error('private backend detail') }) });
  for (const [body, token, expected] of [['not json', null, 400], ['x'.repeat(131073), null, 413], [{ action: 'unknown' }, null, 400], [{ action: 'start' }, null, 401], [{ action: 'start' }, 'invalid', 401]]) {
    const response = await handler(request(body, token));
    assert.equal(response.status, expected);
    assert.equal((await response.text()).includes('private backend detail'), false);
  }
  assert.equal((await handler(new Request('https://example.test', { method: 'GET' }))).status, 405);
  assert.equal((await handler(new Request('https://example.test', { method: 'OPTIONS' }))).status, 204);
});

test('editable user metadata cannot promote an email session into Google eligibility', async () => {
  const handler = createRankedHandler({ db: fakeDb(), authenticate: async () => ({ data: { user: { id: USER, identities: [{ provider: 'email' }], user_metadata: { provider: 'google' } } } }) });
  assert.equal((await handler(request({ action: 'start', provider: 'google' }))).status, 403);
});

test('start enforces per-user hourly limit before creating a run', async () => {
  const db = fakeDb({ data: null, error: null, count: 20 });
  const handler = createRankedHandler({ db, authenticate: authenticated, now: () => NOW });
  assert.equal((await handler(request({ action: 'start' }))).status, 429);
  assert.ok(db.calls[0].operations.some(op => op[0] === 'eq' && op[1] === 'user_id' && op[2] === USER));
});

test('start issues server seed and ignores supplied user/seed/score', async () => {
  const db = fakeDb({ count: 0, error: null }, ok(null), ok({ handle: 'Pilot-123456abcdef', provider: 'google' }), query => {
    const row = query.operations.find(op => op[0] === 'insert')[1];
    assert.equal(row.user_id, USER);
    assert.ok(Number.isInteger(row.seed) && row.seed >= 0 && row.seed <= 2147483647);
    assert.equal(row.score, undefined);
    return ok({ id: RUN, seed: row.seed, expires_at: row.expires_at });
  });
  const response = await createRankedHandler({ db, authenticate: authenticated, now: () => NOW })(request({ action: 'start', seed: -5, user_id: 'attacker', score: 999999 }));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.runId, RUN);
  assert.equal(Date.parse(body.expiresAt), NOW + 20 * 60000);
  assert.equal(body.user_id, undefined);
});

test('profile returns generated alias and never the auth identity', async () => {
  const db = fakeDb(ok(null), ok({ handle: 'Pilot-123456abcdef', provider: 'google', user_id: USER }));
  const response = await createRankedHandler({ db, authenticate: authenticated })(request({ action: 'profile' }));
  assert.deepEqual(await response.json(), { handle: 'Pilot-123456abcdef', provider: 'google' });
});

test('submit rejects wrong-owner lookup, duplicate, expired, incomplete and accelerated runs', async () => {
  const replay = finishedReplay();
  for (const [run, expected, input] of [
    [null, 404, replay],
    [{ ...activeRun(), status: 'verified' }, 409, replay],
    [{ ...activeRun(), expires_at: new Date(NOW - 1).toISOString() }, 410, replay],
    [activeRun(), 400, { version: 1, frames: [[0, 1]] }],
    [{ ...activeRun(), started_at: new Date(NOW).toISOString() }, 400, replay],
  ]) {
    const db = fakeDb(ok(run));
    const response = await createRankedHandler({ db, authenticate: authenticated, now: () => NOW })(request({ action: 'submit', runId: RUN, replay: input }));
    assert.equal(response.status, expected);
    assert.ok(db.calls[0].operations.some(op => op[0] === 'eq' && op[1] === 'user_id' && op[2] === USER));
  }
});

test('submit derives its own result, hashes replay, and atomically prevents a second claim', async () => {
  const replay = finishedReplay();
  const verified = verifyReplay(741, replay);
  for (const concurrentWinner of [false, true]) {
    const db = fakeDb(ok(activeRun()), query => {
      const value = query.operations.find(op => op[0] === 'update')[1];
      assert.equal(value.score, verified.score);
      assert.equal(value.deliveries, verified.deliveries);
      assert.match(value.replay_hash, /^[a-f0-9]{64}$/);
      for (const filter of [['eq', 'id', RUN], ['eq', 'user_id', USER], ['eq', 'status', 'active']]) assert.ok(query.operations.some(op => JSON.stringify(op) === JSON.stringify(filter)));
      return ok(concurrentWinner ? null : verified);
    });
    const response = await createRankedHandler({ db, authenticate: authenticated, now: () => NOW })(request({ action: 'submit', runId: RUN, replay, score: 999999, seed: -1 }));
    assert.equal(response.status, concurrentWinner ? 409 : 200);
    if (!concurrentWinner) assert.equal((await response.json()).score, verified.score);
  }
});

test('database errors never expose internals', async () => {
  const response = await createRankedHandler({ db: fakeDb({ error: new Error('SQL private host password') }), authenticate: authenticated })(request({ action: 'leaderboard' }));
  assert.equal(response.status, 500);
  assert.doesNotMatch(await response.text(), /SQL|password|host/);
});
