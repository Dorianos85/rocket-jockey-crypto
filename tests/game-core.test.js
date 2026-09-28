import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, createRandom, stepState, toggleTether, resolveCircleCollision, getSnapshot, WORLD, EXTRACTION } from '../src/game-core.js';

test('seeded arena generation is deterministic', () => {
  assert.deepEqual(createState(7).npcs, createState(7).npcs);
  assert.notDeepEqual(createState(7).npcs, createState(8).npcs);
  assert.equal(createRandom(7)(), createRandom(7)());
});

test('ready and paused arenas do not advance the clock', () => {
  const state = createState();
  stepState(state, { thrust: true }, 0.02);
  assert.equal(state.timeLeft, WORLD.duration);
  state.status = 'paused';
  stepState(state, { thrust: true }, 0.02);
  assert.equal(state.player.vx, 0);
});

test('thrust moves the sled, braking reduces speed, and boost consumes energy', () => {
  const state = createState(); state.status = 'running';
  for (let i = 0; i < 10; i++) stepState(state, { thrust: true, boost: true }, 0.02);
  assert.ok(state.player.y < 655);
  assert.ok(state.energy < 100);
  const previous = getSnapshot(state).speed;
  stepState(state, { brake: true }, 0.05);
  assert.ok(getSnapshot(state).speed < previous);
});

test('tether takes the nearest NPC, ignores distant NPCs, and toggles off', () => {
  const state = createState();
  state.npcs = [{ id: 1, x: 900, y: 655 }, { id: 2, x: 830, y: 655 }];
  assert.equal(toggleTether(state), true);
  assert.equal(state.tether, 2);
  toggleTether(state);
  assert.equal(state.tether, null);
  state.npcs = [{ id: 3, x: 200, y: 200 }];
  assert.equal(toggleTether(state), false);
});

test('holding tether does not repeatedly release and reattach', () => {
  const state = createState(); state.status = 'running';
  state.npcs[0] = { id: 0, x: 800, y: 710, vx: 0, vy: 0, phase: 0 };
  stepState(state, { tether: true }, 0.02);
  stepState(state, { tether: true }, 0.02);
  assert.equal(state.tether, 0);
});

test('extraction awards combo points once and respawns delivered NPC', () => {
  const state = createState(); state.status = 'running';
  Object.assign(state.player, { x: EXTRACTION.x, y: EXTRACTION.y });
  state.tether = 0; state.combo = 3; state.comboTimer = 10; state.health = 80;
  Object.assign(state.npcs[0], { x: EXTRACTION.x, y: EXTRACTION.y });
  stepState(state, {}, 0.02);
  assert.equal(state.score, 300);
  assert.equal(state.deliveries, 1);
  assert.equal(state.combo, 4);
  assert.equal(state.health, 86);
  assert.equal(state.tether, null);
  assert.ok(Math.hypot(state.npcs[0].x - 800, state.npcs[0].y - 500) > 200);
  stepState(state, {}, 0.02);
  assert.equal(state.score, 300);
});

test('solid obstacle resolves penetration and bounces inward velocity', () => {
  const body = { x: 15, y: 0, radius: 10, vx: -100, vy: 0 };
  assert.equal(resolveCircleCollision(body, { x: 0, y: 0, radius: 10 }), 100);
  assert.equal(body.x, 20);
  assert.ok(body.vx > 0);
});

test('timer and destroyed hull finish the round with the right reason', () => {
  const state = createState(); state.status = 'running'; state.elapsed = WORLD.duration - 0.01;
  stepState(state, {}, 0.02);
  assert.equal(state.status, 'finished'); assert.equal(state.reason, 'time');
  const destroyed = createState(); destroyed.status = 'running'; destroyed.health = 0;
  stepState(destroyed, {}, 0.02);
  assert.equal(destroyed.status, 'finished'); assert.equal(destroyed.reason, 'destroyed');
});

test('collision invulnerability prevents damage every simulation frame', () => {
  const state = createState(); state.status = 'running';
  Object.assign(state.rivals[0], { x: 800, y: 655 });
  stepState(state, {}, 0.01);
  assert.equal(state.health, 86);
  Object.assign(state.rivals[0], { x: state.player.x, y: state.player.y });
  stepState(state, {}, 0.01);
  assert.equal(state.health, 86);
});
