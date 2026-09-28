import test from 'node:test';
import assert from 'node:assert/strict';
import { createRankingClient } from '../src/ranking.js';

const runId = '01234567-89ab-cdef-0123-456789abcdef';
test('ranking uses Edge Function only, sends replay rather than claimed score, and strips private fields', async () => {
  const calls = [];
  const response = {
    leaderboard: { entries: [{ handle: 'Pilot-aabbccddeeff', provider: 'google', bestScore: 900, deliveries: 4, totalRuns: 3, email: 'private@example.com', user_id: runId }] },
    start: { runId, seed: 42, expiresAt: '2030-01-01T00:00:00.000Z' },
    profile: { handle: 'Pilot-aabbccddeeff', provider: 'google', user_id: runId },
    submit: { accepted: true, score: 900 },
  };
  const ranking = createRankingClient({ getClient: () => ({ functions: { invoke: async (name, { body }) => { calls.push([name, body]); return { data: response[body.action], error: null }; } } }) });
  const entries = await ranking.fetchLeaderboard();
  assert.deepEqual(entries[0], { rank: 1, handle: 'Pilot-aabbccddeeff', provider: 'google', bestScore: 900, deliveries: 4, totalRuns: 3 });
  assert.deepEqual(await ranking.startRankedRun(), response.start);
  const replay = { version: 1, frames: [0, 1] };
  assert.deepEqual(await ranking.submitRun(runId, replay), response.submit);
  assert.deepEqual(calls[2], ['rocket-ranked', { action: 'submit', runId, replay }]);
  assert.deepEqual(await ranking.fetchProfile(), { handle: 'Pilot-aabbccddeeff', provider: 'google' });
});

test('configuration, transport, and server validation failures do not pretend to save', async () => {
  await assert.rejects(createRankingClient().fetchLeaderboard(), /not configured/);
  const unavailable = createRankingClient({ getClient: () => ({ functions: { invoke: async () => { throw new Error('network'); } } }) });
  await assert.rejects(unavailable.fetchLeaderboard(), /temporarily unavailable/);
  const denied = createRankingClient({ getClient: () => ({ functions: { invoke: async () => ({ error: { context: { json: async () => ({ error: 'Run has expired.' }) } } }) } }) });
  await assert.rejects(denied.submitRun(runId, {}), /Run has expired/);
  await assert.rejects(denied.submitRun('invalid', {}), /Invalid ranked run/);
});

test('invalid server seed cannot start a locally unrepeatable run', async () => {
  const ranking = createRankingClient({ getClient: () => ({ functions: { invoke: async () => ({ data: { runId, seed: Infinity, expiresAt: '2030-01-01' }, error: null }) } }) });
  await assert.rejects(ranking.startRankedRun(), /invalid run/);
});
