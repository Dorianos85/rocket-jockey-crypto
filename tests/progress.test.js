import test from 'node:test';
import assert from 'node:assert/strict';
import { loadProgress, recordRun, resetProgress, rewardForRun } from '../src/progress.js';

function storage(initial = null) {
  let data = initial;
  return { getItem: () => data, setItem: (_key, value) => { data = value; } };
}

test('runs persist best score, totals and deterministic demo credits', () => {
  const store = storage();
  assert.deepEqual(loadProgress(store), { bestScore: 0, totalRuns: 0, totalCredits: 0, history: [] });
  assert.equal(rewardForRun({ score: 350, deliveries: 2 }), 23);
  recordRun({ score: 350, deliveries: 2, duration: 90, reason: 'finished' }, store);
  const result = recordRun({ score: 210, deliveries: 1, duration: 60, reason: 'crashed' }, store);
  assert.equal(result.bestScore, 350);
  assert.equal(result.totalRuns, 2);
  assert.equal(result.totalCredits, 35);
  assert.equal(result.history[0].reason, 'crashed');
  assert.deepEqual(loadProgress(store), result);
});

test('keeps ten recent runs without losing aggregate totals', () => {
  const store = storage();
  for (let score = 0; score < 14; score++) recordRun({ score, deliveries: 1 }, store);
  const progress = loadProgress(store);
  assert.equal(progress.history.length, 10);
  assert.equal(progress.history[0].score, 13);
  assert.equal(progress.history[9].score, 4);
  assert.equal(progress.totalRuns, 14);
  assert.equal(progress.totalCredits, 140);
  resetProgress(store);
  assert.equal(loadProgress(store).totalRuns, 0);
});

test('corrupt, excessive and malicious data is sanitized', () => {
  for (const input of ['nope', 'null', '[]', '"value"', 'x'.repeat(100_001)]) {
    assert.equal(loadProgress(storage(input)).totalRuns, 0);
  }
  const progress = loadProgress(storage(JSON.stringify({
    bestScore: -4, totalRuns: '100', totalCredits: 1e20,
    history: [null, { score: 12, deliveries: -99, credits: '3', date: 'bad', reason: 'x'.repeat(1000) }],
    __proto__: { admin: true },
  })));
  assert.equal(progress.bestScore, 12);
  assert.equal(progress.totalRuns, 1);
  assert.equal(progress.totalCredits, 1_000_000_000);
  assert.equal(progress.history[0].deliveries, 0);
  assert.equal(progress.history[0].reason.length, 80);
  assert.equal(progress.admin, undefined);
  assert.equal(rewardForRun({ score: Infinity, deliveries: -1 }), 0);
  assert.equal(rewardForRun(null), 0);
});

test('blocked or absent storage keeps ephemeral progress and resets', () => {
  const blocked = { getItem() { throw Error('blocked'); }, setItem() { throw Error('quota'); } };
  for (const store of [blocked, null]) {
    resetProgress(store);
    recordRun({ score: 100, deliveries: 1 }, store);
    recordRun({ score: 200, deliveries: 2 }, store);
    assert.equal(loadProgress(store).totalRuns, 2);
    assert.equal(loadProgress(store).totalCredits, 33);
    const copy = loadProgress(store);
    copy.history[0].score = 123456;
    assert.equal(loadProgress(store).bestScore, 200);
    resetProgress(store);
    assert.equal(loadProgress(store).totalRuns, 0);
  }
});
