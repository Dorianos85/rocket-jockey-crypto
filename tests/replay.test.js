import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, stepState } from '../src/game-core.js';
import { createReplayRecorder, verifyReplay, FIXED_STEP, decodeInput, MAX_REPLAY_FRAMES } from '../src/replay.js';
function play(seed) {
  const state = createState(seed); state.status = 'running';
  const recorder = createReplayRecorder();
  for (let i = 0; i < MAX_REPLAY_FRAMES && state.status === 'running'; i++) {
    const input = decodeInput(i % 100 < 65 ? 17 : 9);
    recorder.record(input); stepState(state, input, FIXED_STEP);
  }
  return { state, replay: recorder.finish() };
}
test('server replay recomputes the same terminal score and hull outcome from inputs', () => {
  const { state, replay } = play(741);
  const result = verifyReplay(741, replay);
  assert.equal(result.score, state.score);
  assert.equal(result.deliveries, state.deliveries);
  assert.equal(result.reason, state.reason);
  assert.equal(result.duration, Math.min(90, state.elapsed));
});
test('recorder compresses held keys without changing edge-triggered inputs', () => {
  const r = createReplayRecorder(); r.record({ thrust: true }); r.record({ thrust: true }); r.record({ tether: true }); r.record({});
  assert.deepEqual(r.finish(), { version: 1, frames: [[1, 2], [32, 1], [0, 1]] });
});
test('malformed, unfinished, oversized and trailing-input replays cannot be ranked', () => {
  for (const replay of [{ version: 2, frames: [[0, 1]] }, { version: 1, frames: [[64, 1]] }, { version: 1, frames: [[0, -1]] }, { version: 1, frames: [[0, 1.5]] }, { version: 1, frames: [[0, 999999]] }, { version: 1, frames: [[0, 1]] }]) assert.throws(() => verifyReplay(1, replay));
  const { replay } = play(741); replay.frames.push([0, 1]);
  assert.throws(() => verifyReplay(741, replay), /after the round ended|too long/);
});
