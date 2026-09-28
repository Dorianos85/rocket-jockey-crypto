export const WORLD = Object.freeze({ width: 1600, height: 1000, duration: 90 });
export const EXTRACTION = Object.freeze({ x: 800, y: 500, radius: 94 });
export const OBSTACLES = Object.freeze([
  { x: 410, y: 300, radius: 48 }, { x: 1190, y: 700, radius: 48 },
  { x: 420, y: 725, radius: 34 }, { x: 1180, y: 270, radius: 34 },
  { x: 800, y: 180, radius: 30 }, { x: 800, y: 820, radius: 30 },
]);
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const wrapAngle = angle => Math.atan2(Math.sin(angle), Math.cos(angle));

export function createRandom(seed = 42) {
  let value = seed >>> 0;
  return () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 4294967296; };
}

export function spawnNpc(random, id) {
  const angle = random() * Math.PI * 2;
  const radius = 240 + random() * 180;
  let x = clamp(EXTRACTION.x + Math.cos(angle) * radius * 1.5, 95, WORLD.width - 95);
  let y = clamp(EXTRACTION.y + Math.sin(angle) * radius, 95, WORLD.height - 95);
  for (const obstacle of OBSTACLES) {
    if (distance({ x, y }, obstacle) < obstacle.radius + 38) x += 100;
  }
  return { id, x, y, vx: 0, vy: 0, phase: random() * Math.PI * 2 };
}

export function createState(seed = 42) {
  const random = createRandom(seed);
  return {
    status: 'ready', timeLeft: WORLD.duration, elapsed: 0, score: 0, deliveries: 0,
    health: 100, energy: 100, combo: 1, comboTimer: 0, tether: null,
    player: { x: 800, y: 655, vx: 0, vy: 0, angle: -Math.PI / 2, radius: 20, hitCooldown: 0 },
    npcs: Array.from({ length: 8 }, (_, id) => spawnNpc(random, id)),
    rivals: [
      { x: 180, y: 160, vx: 50, vy: 0, angle: 0, phase: 0, color: '#fa6778' },
      { x: 1420, y: 840, vx: -50, vy: 0, angle: Math.PI, phase: 2.1, color: '#b893ff' },
      { x: 1380, y: 180, vx: 0, vy: 50, angle: Math.PI / 2, phase: 4.2, color: '#ffc06b' },
    ],
    events: [], random, tetherPressed: false,
  };
}

export function toggleTether(state) {
  if (state.tether !== null) {
    state.tether = null;
    state.events.push({ type: 'release', x: state.player.x, y: state.player.y });
    return false;
  }
  const nearby = state.npcs.filter(npc => distance(npc, state.player) <= 165)
    .sort((a, b) => distance(a, state.player) - distance(b, state.player));
  if (!nearby.length) {
    state.events.push({ type: 'miss', x: state.player.x, y: state.player.y });
    return false;
  }
  state.tether = nearby[0].id;
  state.events.push({ type: 'tether', x: nearby[0].x, y: nearby[0].y });
  return true;
}

export function resolveCircleCollision(body, obstacle, restitution = 0.6) {
  const dx = body.x - obstacle.x;
  const dy = body.y - obstacle.y;
  const length = Math.hypot(dx, dy);
  const minimum = body.radius + obstacle.radius;
  if (length >= minimum) return 0;
  const nx = length > 0.001 ? dx / length : 1;
  const ny = length > 0.001 ? dy / length : 0;
  body.x = obstacle.x + nx * minimum;
  body.y = obstacle.y + ny * minimum;
  const impact = body.vx * nx + body.vy * ny;
  if (impact < 0) {
    body.vx -= (1 + restitution) * impact * nx;
    body.vy -= (1 + restitution) * impact * ny;
  }
  return Math.max(0, -impact);
}

function constrain(body) {
  const pad = body.radius || 14;
  if (body.x < pad + 20 || body.x > WORLD.width - pad - 20) {
    body.x = clamp(body.x, pad + 20, WORLD.width - pad - 20); body.vx *= -0.65;
  }
  if (body.y < pad + 20 || body.y > WORLD.height - pad - 20) {
    body.y = clamp(body.y, pad + 20, WORLD.height - pad - 20); body.vy *= -0.65;
  }
}

function damage(state, amount, source) {
  if (state.player.hitCooldown > 0) return;
  state.health = Math.max(0, state.health - amount);
  state.player.hitCooldown = 1.1;
  state.combo = 1; state.comboTimer = 0;
  state.events.push({ type: 'hit', x: state.player.x, y: state.player.y, amount, source });
}

export function stepState(state, input, dt) {
  state.events = [];
  if (state.status !== 'running') return state;
  dt = clamp(dt, 0, 0.05);
  state.elapsed += dt;
  state.timeLeft = Math.max(0, WORLD.duration - state.elapsed);
  state.comboTimer = Math.max(0, state.comboTimer - dt);
  if (state.comboTimer === 0) state.combo = 1;
  const p = state.player;
  p.hitCooldown = Math.max(0, p.hitCooldown - dt);
  p.angle = wrapAngle(p.angle + ((input.right ? 1 : 0) - (input.left ? 1 : 0)) * 3.3 * dt);
  const boosting = input.boost && input.thrust && state.energy > 0;
  const acceleration = input.thrust ? (boosting ? 620 : 350) : 0;
  state.energy = clamp(state.energy + (boosting ? -33 : 18) * dt, 0, 100);
  p.vx += Math.cos(p.angle) * acceleration * dt;
  p.vy += Math.sin(p.angle) * acceleration * dt;
  const drag = Math.exp(-(input.brake ? 4.8 : 0.8) * dt);
  p.vx *= drag; p.vy *= drag;
  const speed = Math.hypot(p.vx, p.vy);
  const limit = boosting ? 570 : 390;
  if (speed > limit) { p.vx *= limit / speed; p.vy *= limit / speed; }
  p.x += p.vx * dt; p.y += p.vy * dt;
  constrain(p);
  for (const obstacle of OBSTACLES) {
    const impact = resolveCircleCollision(p, obstacle);
    if (impact > 115) damage(state, Math.min(16, Math.round(impact / 24)), 'obstacle');
  }
  if (input.tether && !state.tetherPressed) toggleTether(state);
  state.tetherPressed = Boolean(input.tether);

  for (const rival of state.rivals) {
    const t = state.elapsed * 0.3 + rival.phase;
    const patrol = { x: 800 + Math.cos(t) * 500, y: 500 + Math.sin(t * 1.35) * 320 };
    const target = distance(rival, p) < 260 ? p : patrol;
    const desired = Math.atan2(target.y - rival.y, target.x - rival.x);
    rival.angle += clamp(wrapAngle(desired - rival.angle), -1.9 * dt, 1.9 * dt);
    rival.vx += Math.cos(rival.angle) * 160 * dt;
    rival.vy += Math.sin(rival.angle) * 160 * dt;
    rival.vx *= Math.exp(-0.8 * dt); rival.vy *= Math.exp(-0.8 * dt);
    rival.x += rival.vx * dt; rival.y += rival.vy * dt;
    rival.radius = 21;
    constrain(rival);
    for (const obstacle of OBSTACLES) resolveCircleCollision(rival, obstacle);
    if (distance(p, rival) < 43) {
      const nx = (p.x - rival.x) / Math.max(1, distance(p, rival));
      const ny = (p.y - rival.y) / Math.max(1, distance(p, rival));
      p.vx += nx * 135; p.vy += ny * 135;
      resolveCircleCollision(p, rival);
      rival.vx -= nx * 75; rival.vy -= ny * 75;
      damage(state, 14, 'rival');
    }
  }

  for (let index = 0; index < state.npcs.length; index++) {
    const npc = state.npcs[index];
    if (state.tether === npc.id) {
      const targetX = p.x - Math.cos(p.angle) * 65;
      const targetY = p.y - Math.sin(p.angle) * 65;
      npc.vx += (targetX - npc.x) * 20 * dt;
      npc.vy += (targetY - npc.y) * 20 * dt;
      npc.vx *= Math.exp(-5 * dt); npc.vy *= Math.exp(-5 * dt);
      npc.x += npc.vx * dt; npc.y += npc.vy * dt;
      if (distance(npc, EXTRACTION) < EXTRACTION.radius && distance(p, EXTRACTION) < EXTRACTION.radius + 45) {
        const points = state.combo * 100;
        state.score += points; state.deliveries++;
        state.health = Math.min(100, state.health + 6);
        state.events.push({ type: 'delivery', x: npc.x, y: npc.y, points });
        state.combo = Math.min(5, state.combo + 1); state.comboTimer = 15;
        state.tether = null;
        state.npcs[index] = spawnNpc(state.random, npc.id);
      }
    } else {
      npc.x += Math.cos(state.elapsed * 0.5 + npc.phase) * 9 * dt;
      npc.y += Math.sin(state.elapsed * 0.6 + npc.phase) * 9 * dt;
      npc.radius = 11;
      constrain(npc);
      for (const obstacle of OBSTACLES) resolveCircleCollision(npc, obstacle);
    }
  }
  if (state.health <= 0 || state.timeLeft <= 0) {
    state.status = 'finished';
    state.reason = state.health <= 0 ? 'destroyed' : 'time';
  }
  return state;
}

export function getSnapshot(state) {
  return {
    score: state.score, health: state.health, energy: state.energy,
    timeLeft: state.timeLeft, deliveries: state.deliveries, combo: state.combo,
    status: state.status, speed: Math.round(Math.hypot(state.player.vx, state.player.vy)),
    tethered: state.tether !== null,
    canGrapple: state.npcs.some(npc => distance(npc, state.player) <= 165),
  };
}
