import { createState, stepState } from './game-core.js';

export const REPLAY_VERSION = 1;
export const FIXED_STEP = 1 / 60;
export const MAX_REPLAY_FRAMES = 5402;
const ACTIONS = ['thrust', 'brake', 'left', 'right', 'boost', 'tether'];
export function encodeInput(input) {
  return ACTIONS.reduce((mask, key, index) => mask | (input[key] ? 1 << index : 0), 0);
}
export function decodeInput(mask) {
  return Object.fromEntries(ACTIONS.map((key, index) => [key, Boolean(mask & (1 << index))]));
}
export function createReplayRecorder() {
  const frames = [];
  let total = 0;
  return {
    record(input) {
      if (total >= MAX_REPLAY_FRAMES) return;
      const mask = encodeInput(input);
      const last = frames.at(-1);
      if (last && last[0] === mask) last[1]++;
      else frames.push([mask, 1]);
      total++;
    },
    finish() { return { version: REPLAY_VERSION, frames: frames.map(frame => [...frame]) }; },
  };
}
export function verifyReplay(seed, replay) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 2147483647) throw new Error('Invalid seed.');
  if (replay?.version !== REPLAY_VERSION || !Array.isArray(replay.frames) || !replay.frames.length || replay.frames.length > MAX_REPLAY_FRAMES) throw new Error('Invalid replay format.');
  let total = 0;
  for (const frame of replay.frames) {
    if (!Array.isArray(frame) || frame.length !== 2 || !Number.isInteger(frame[0]) || frame[0] < 0 || frame[0] > 63 || !Number.isInteger(frame[1]) || frame[1] < 1) throw new Error('Invalid replay input.');
    total += frame[1];
    if (total > MAX_REPLAY_FRAMES) throw new Error('Replay is too long.');
  }
  const state = createState(seed);
  state.status = 'running';
  for (const [mask, count] of replay.frames) {
    const input = decodeInput(mask);
    for (let frame = 0; frame < count; frame++) {
      if (state.status !== 'running') throw new Error('Replay continues after the round ended.');
      stepState(state, input, FIXED_STEP);
    }
  }
  if (state.status !== 'finished') throw new Error('Replay does not contain a completed round.');
  return { score: state.score, deliveries: state.deliveries, duration: Math.min(90, state.elapsed), reason: state.reason, frames: total };
}
