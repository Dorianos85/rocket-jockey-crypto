import { WORLD, EXTRACTION, OBSTACLES, createState, stepState, getSnapshot, distance } from './game-core.js';

const KEYS = { KeyW: 'thrust', ArrowUp: 'thrust', KeyS: 'brake', ArrowDown: 'brake', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', ShiftLeft: 'boost', ShiftRight: 'boost', Space: 'tether' };
const CYAN = '#5ef5e7';
const ORANGE = '#ff9d5c';

export class ArenaGame {
  constructor(canvas, { onUpdate = () => {}, onFinish = () => {} } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    if (!this.ctx) throw new Error('Your browser does not support the Canvas 2D renderer.');
    this.onUpdate = onUpdate; this.onFinish = onFinish;
    this.state = createState(); this.input = {}; this.particles = []; this.labels = [];
    this.last = 0; this.visualTime = 0; this.reportTimer = 0; this.shake = 0; this.destroyed = false;
    this.width = 1; this.height = 1; this.dpr = 1;
    this.onKeyDown = event => {
      if (document.querySelector('dialog[open]') || event.target?.closest?.('button, a, input, textarea, select, [contenteditable="true"]')) return;
      if (['Escape', 'KeyP'].includes(event.code) && !event.repeat) {
        if (this.state.status === 'running') this.pause();
        else if (this.state.status === 'paused') this.resume();
        return;
      }
      const action = KEYS[event.code];
      if (!action) return;
      if (this.state.status === 'running') { event.preventDefault(); this.setInput(action, true); }
    };
    this.onKeyUp = event => { const action = KEYS[event.code]; if (action) this.setInput(action, false); };
    this.onBlur = () => this.pause();
    this.onVisibility = () => { if (document.hidden) this.pause(); };
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize(); this.emit();
    this.tick = this.tick.bind(this);
    this.frame = requestAnimationFrame(this.tick);
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, rect.width); this.height = Math.max(1, rect.height);
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
  }

  emit() { this.onUpdate(getSnapshot(this.state)); }
  start() {
    if (this.state.status === 'paused') return this.resume();
    if (this.state.status === 'running') return;
    if (this.state.status === 'finished') return this.restart();
    this.input = {}; this.state.status = 'running'; this.last = 0; this.emit();
  }
  pause() {
    if (this.state.status !== 'running') return;
    this.state.status = 'paused'; this.input = {}; this.state.tetherPressed = false; this.emit();
  }
  resume() {
    if (this.state.status !== 'paused') return;
    this.state.status = 'running'; this.input = {}; this.last = 0; this.emit();
  }
  restart() {
    this.state = createState(Math.floor(Math.random() * 100000));
    this.particles = []; this.labels = []; this.shake = 0; this.start();
  }
  setInput(action, pressed) {
    const aliases = { up: 'thrust', down: 'brake', grapple: 'tether' };
    action = aliases[action] || action;
    if (['thrust', 'brake', 'left', 'right', 'boost', 'tether'].includes(action)) this.input[action] = Boolean(pressed);
  }
  destroy() {
    this.destroyed = true; cancelAnimationFrame(this.frame); this.resizeObserver.disconnect();
    window.removeEventListener('keydown', this.onKeyDown); window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur); document.removeEventListener('visibilitychange', this.onVisibility);
  }

  burst(x, y, color, count = 22) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 35 + Math.random() * 190;
      this.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, color, life: 0.45 + Math.random() * 0.45, maxLife: 0.9, size: 2 + Math.random() * 3 });
    }
  }

  tick(time) {
    if (this.destroyed) return;
    const dt = this.last ? Math.min((time - this.last) / 1000, 0.05) : 1 / 60;
    this.last = time; this.visualTime += dt;
    if (this.state.status === 'running') {
      stepState(this.state, this.input, dt);
      for (const event of this.state.events) {
        if (event.type === 'delivery') {
          this.burst(event.x, event.y, CYAN, 45);
          this.labels.push({ text: `+${event.points}  EXTRACTED`, x: event.x, y: event.y - 30, life: 1.8, color: CYAN });
        } else if (event.type === 'hit') {
          this.shake = 9; this.burst(event.x, event.y, ORANGE, 18);
          this.labels.push({ text: `−${event.amount} HULL`, x: event.x, y: event.y - 40, life: 1, color: '#ff8490' });
        } else if (event.type === 'tether') {
          this.burst(event.x, event.y, CYAN, 12);
          this.labels.push({ text: 'TETHER LOCKED', x: event.x, y: event.y - 30, life: 1.2, color: CYAN });
        } else if (event.type === 'miss') {
          this.labels.push({ text: 'GET CLOSER TO A RUNNER', x: event.x, y: event.y - 45, life: 1.2, color: '#a0b6c3' });
        }
      }
      const p = this.state.player;
      if (this.input.thrust) {
        const boost = this.input.boost && this.state.energy > 0;
        this.particles.push({ x: p.x - Math.cos(p.angle) * 25, y: p.y - Math.sin(p.angle) * 25, vx: -Math.cos(p.angle) * 90 + (Math.random() - 0.5) * 35, vy: -Math.sin(p.angle) * 90 + (Math.random() - 0.5) * 35, color: boost ? '#b4fff2' : ORANGE, life: 0.4, maxLife: 0.4, size: boost ? 7 : 4 });
      }
      this.reportTimer += dt;
      if (this.reportTimer >= 0.08 || this.state.events.length || this.state.status === 'finished') { this.emit(); this.reportTimer = 0; }
      if (this.state.status === 'finished') {
        this.input = {};
        this.onFinish({ score: this.state.score, deliveries: this.state.deliveries, duration: Math.min(WORLD.duration, this.state.elapsed), reason: this.state.reason });
      }
    }
    if (this.state.status !== 'paused') {
      for (const particle of this.particles) { particle.life -= dt; particle.x += particle.vx * dt; particle.y += particle.vy * dt; }
      this.particles = this.particles.filter(p => p.life > 0).slice(-450);
      for (const label of this.labels) { label.life -= dt; label.y -= dt * 22; }
      this.labels = this.labels.filter(label => label.life > 0);
    }
    this.shake = Math.max(0, this.shake - dt * 35);
    this.render(); this.frame = requestAnimationFrame(this.tick);
  }

  circle(x, y, radius, fill, stroke, lineWidth = 1) {
    const c = this.ctx; c.beginPath(); c.arc(x, y, radius, 0, Math.PI * 2);
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = lineWidth; c.stroke(); }
  }

  render() {
    const c = this.ctx;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.fillStyle = '#071019'; c.fillRect(0, 0, this.width, this.height);
    const scale = Math.min(this.width / WORLD.width, this.height / WORLD.height);
    const offsetX = (this.width - WORLD.width * scale) / 2;
    const offsetY = (this.height - WORLD.height * scale) / 2;
    c.save(); c.translate(offsetX, offsetY); c.scale(scale, scale);
    if (this.shake) c.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    const glow = c.createRadialGradient(800, 500, 30, 800, 500, 870);
    glow.addColorStop(0, '#15313c'); glow.addColorStop(0.5, '#10232e'); glow.addColorStop(1, '#09131f');
    c.fillStyle = glow; c.fillRect(0, 0, WORLD.width, WORLD.height);
    this.drawFloor(); this.drawExtraction();
    for (const obstacle of OBSTACLES) this.drawObstacle(obstacle);
    for (const particle of this.particles) {
      c.globalAlpha = Math.min(1, particle.life / particle.maxLife);
      this.circle(particle.x, particle.y, particle.size * Math.max(0.15, particle.life / particle.maxLife), particle.color);
    }
    c.globalAlpha = 1;
    const tethered = this.state.npcs.find(npc => npc.id === this.state.tether);
    if (tethered) {
      c.save(); c.shadowColor = CYAN; c.shadowBlur = 10;
      c.strokeStyle = CYAN; c.lineWidth = 2.5; c.setLineDash([9, 7]); c.lineDashOffset = -this.visualTime * 50;
      c.beginPath(); c.moveTo(this.state.player.x, this.state.player.y); c.lineTo(tethered.x, tethered.y); c.stroke(); c.restore();
    }
    for (const npc of this.state.npcs) this.drawNpc(npc);
    for (const rival of this.state.rivals) this.drawSled(rival, rival.color, false);
    this.drawSled(this.state.player, '#e0edf2', true);
    if (this.state.status === 'running') this.drawTargetGuide();
    for (const label of this.labels) {
      c.globalAlpha = Math.min(1, label.life * 2); c.fillStyle = label.color;
      c.font = '700 18px ui-monospace, monospace'; c.textAlign = 'center'; c.fillText(label.text, label.x, label.y);
    }
    c.globalAlpha = 1;
    this.drawArenaLabels();
    c.restore();
  }

  drawFloor() {
    const c = this.ctx;
    c.strokeStyle = 'rgba(107,165,190,.075)'; c.lineWidth = 1;
    c.beginPath();
    for (let x = 0; x <= WORLD.width; x += 50) { c.moveTo(x, 0); c.lineTo(x, WORLD.height); }
    for (let y = 0; y <= WORLD.height; y += 50) { c.moveTo(0, y); c.lineTo(WORLD.width, y); }
    c.stroke();
    c.strokeStyle = '#264351'; c.lineWidth = 3; c.strokeRect(22, 22, 1556, 956);
    c.strokeStyle = '#172e3b'; c.lineWidth = 8; c.strokeRect(31, 31, 1538, 938);
    c.strokeStyle = '#395667'; c.lineWidth = 3;
    for (let x = 95; x < 1540; x += 112) {
      c.beginPath(); c.moveTo(x, 24); c.lineTo(x + 40, 24); c.moveTo(x, 976); c.lineTo(x + 40, 976); c.stroke();
    }
    for (const x of [60, 1540]) for (const y of [60, 940]) {
      this.circle(x, y, 7, '#526c78'); this.circle(x, y, 3, '#b7d0d5');
    }
    c.save(); c.setLineDash([8, 12]); c.strokeStyle = '#294350'; c.lineWidth = 2;
    c.beginPath(); c.ellipse(800, 500, 590, 365, 0, 0, Math.PI * 2); c.stroke(); c.restore();
    c.fillStyle = 'rgba(174,207,216,.1)'; c.font = '800 100px Arial, sans-serif'; c.textAlign = 'left'; c.fillText('07', 100, 160);
    c.textAlign = 'right'; c.fillText('RJ', 1500, 900);
    c.fillStyle = 'rgba(174,207,216,.07)';
    for (let i = 0; i < 8; i++) {
      c.save(); c.translate(165 + i * 180, 505); c.rotate(-0.55); c.fillRect(-2, -13, 4, 26); c.restore();
    }
  }

  drawExtraction() {
    const c = this.ctx; const { x, y, radius } = EXTRACTION;
    const pulse = Math.sin(this.visualTime * 2.5) * 0.5 + 0.5;
    const g = c.createRadialGradient(x, y, 0, x, y, radius + 45);
    g.addColorStop(0, 'rgba(72,226,210,.10)'); g.addColorStop(0.7, 'rgba(72,226,210,.05)'); g.addColorStop(1, 'rgba(72,226,210,0)');
    this.circle(x, y, radius + 45, g);
    this.circle(x, y, radius, '#0e3037', '#3d9c98', 2);
    this.circle(x, y, radius - 14, null, 'rgba(86,238,218,.13)', 12);
    c.save(); c.strokeStyle = CYAN; c.lineWidth = 4; c.shadowColor = CYAN; c.shadowBlur = 8 + pulse * 8;
    for (let i = 0; i < 4; i++) { const a = this.visualTime * 0.2 + i * Math.PI / 2; c.beginPath(); c.arc(x, y, radius, a, a + 0.65); c.stroke(); }
    c.restore();
    c.strokeStyle = '#67dfd2'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(x - 13, y - 17); c.lineTo(x, y - 30); c.lineTo(x + 13, y - 17); c.moveTo(x, y - 29); c.lineTo(x, y + 1); c.stroke();
    c.textAlign = 'center'; c.fillStyle = '#a2e7df'; c.font = '600 14px ui-monospace, monospace';
    c.fillText('EXTRACTION', x, y + 26); c.fillStyle = '#548b91'; c.font = '11px ui-monospace, monospace'; c.fillText('BRING RUNNERS HERE', x, y + 45);
  }

  drawObstacle(obstacle) {
    const c = this.ctx; const { x, y, radius } = obstacle;
    this.circle(x + 7, y + 10, radius + 5, 'rgba(0,0,0,.28)');
    c.save(); c.translate(x, y); c.rotate(Math.PI / 8);
    c.beginPath();
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; const px = Math.cos(a) * radius; const py = Math.sin(a) * radius; if (i === 0) c.moveTo(px, py); else c.lineTo(px, py); }
    c.closePath(); c.fillStyle = '#1b2d38'; c.fill(); c.strokeStyle = '#51616b'; c.lineWidth = 3; c.stroke();
    this.circle(0, 0, radius * 0.66, '#263b46', '#344e58', 3);
    this.circle(0, 0, radius * 0.25, '#172834', '#60717a', 2);
    c.strokeStyle = '#d59153'; c.lineWidth = 5;
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; c.beginPath(); c.arc(0, 0, radius - 4, a, a + 0.3); c.stroke(); }
    c.restore();
  }

  drawNpc(npc) {
    const c = this.ctx;
    const selected = npc.id === this.state.tether;
    const nearby = distance(npc, this.state.player) < 165;
    const pulse = Math.sin(this.visualTime * 3 + npc.phase) * 2;
    c.save(); c.translate(npc.x, npc.y);
    this.circle(0, 4, 14, 'rgba(0,0,0,.3)');
    this.circle(0, 0, 22 + pulse, null, selected ? CYAN : nearby ? '#abc87a' : 'rgba(214,221,156,.25)', selected || nearby ? 2 : 1);
    c.strokeStyle = selected ? CYAN : '#c8d896'; c.lineWidth = 4; c.lineCap = 'round';
    c.beginPath(); c.moveTo(-4, 2); c.lineTo(-7, 10); c.moveTo(4, 2); c.lineTo(7, 10); c.stroke();
    c.fillStyle = selected ? '#84f6d9' : '#c4d297'; c.fillRect(-7, -6, 14, 14);
    this.circle(0, -8, 6, '#e5e6c8');
    c.fillStyle = '#405963'; c.fillRect(-4, -10, 8, 4);
    c.restore();
  }

  drawSled(sled, color, player) {
    const c = this.ctx;
    const running = this.state.status === 'running';
    const thrust = player ? this.input.thrust && running : true;
    const boost = player && this.input.boost && this.state.energy > 0 && thrust;
    c.save(); c.translate(sled.x + 5, sled.y + 8); c.rotate(sled.angle);
    c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.ellipse(0, 0, 37, 20, 0, 0, Math.PI * 2); c.fill(); c.restore();
    c.save(); c.translate(sled.x, sled.y); c.rotate(sled.angle);
    if (thrust || (player && this.state.status === 'ready')) {
      const length = (boost ? 52 : 25) + Math.sin(this.visualTime * 37) * 7;
      c.shadowColor = boost ? CYAN : ORANGE; c.shadowBlur = 12;
      c.fillStyle = boost ? '#5eeddf' : '#ff9758';
      c.beginPath(); c.moveTo(-20, -7); c.lineTo(-28 - length, 0); c.lineTo(-20, 7); c.fill();
      c.fillStyle = '#ffe8c3'; c.beginPath(); c.moveTo(-22, -3); c.lineTo(-30 - length * 0.55, 0); c.lineTo(-22, 3); c.fill(); c.shadowBlur = 0;
    }
    if (player && this.state.player.hitCooldown > 0 && Math.floor(this.visualTime * 15) % 2 === 0) c.globalAlpha = 0.55;
    c.fillStyle = '#293e4e'; c.strokeStyle = '#627782'; c.lineWidth = 1.5;
    for (const side of [-1, 1]) {
      c.beginPath(); c.moveTo(-23, side * 8); c.lineTo(-28, side * 18); c.lineTo(8, side * 15); c.lineTo(18, side * 8); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = color; c.fillRect(-19, side * 12 - 2, 18, 4); c.fillStyle = '#293e4e';
    }
    c.beginPath(); c.moveTo(33, 0); c.lineTo(10, -11); c.lineTo(-22, -9); c.lineTo(-26, 0); c.lineTo(-22, 9); c.lineTo(10, 11); c.closePath();
    c.fillStyle = color; c.fill(); c.strokeStyle = '#b9cad1'; c.lineWidth = 1; c.stroke();
    c.fillStyle = '#102a39'; c.beginPath(); c.ellipse(7, 0, 9, 6, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = player ? CYAN : '#eddce8'; c.fillRect(3, -4, 7, 2);
    c.fillStyle = '#354955'; c.fillRect(-20, -5, 13, 10);
    c.fillStyle = ORANGE; c.fillRect(-24, -4, 4, 8);
    c.restore();
    if (player) {
      c.textAlign = 'center'; c.fillStyle = '#d3e9ef'; c.font = '600 11px ui-monospace, monospace';
      c.fillText('YOU', sled.x, sled.y - 37);
      c.strokeStyle = CYAN; c.lineWidth = 1;
      c.beginPath(); c.moveTo(sled.x - 4, sled.y - 31); c.lineTo(sled.x, sled.y - 27); c.lineTo(sled.x + 4, sled.y - 31); c.stroke();
    }
  }

  drawTargetGuide() {
    const c = this.ctx; const p = this.state.player;
    if (this.state.tether !== null) {
      const angle = Math.atan2(EXTRACTION.y - p.y, EXTRACTION.x - p.x);
      if (distance(p, EXTRACTION) > 165) {
        c.save(); c.translate(p.x, p.y); c.rotate(angle); c.fillStyle = CYAN;
        c.beginPath(); c.moveTo(61, 0); c.lineTo(48, -6); c.lineTo(48, 6); c.closePath(); c.fill(); c.restore();
      }
      return;
    }
    const nearest = [...this.state.npcs].sort((a, b) => distance(a, p) - distance(b, p))[0];
    if (nearest && distance(nearest, p) <= 165) {
      c.save(); c.setLineDash([3, 7]); c.strokeStyle = 'rgba(163,214,176,.35)'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(nearest.x, nearest.y); c.stroke(); c.restore();
      c.fillStyle = '#d4e6b4'; c.font = '600 13px ui-monospace, monospace'; c.textAlign = 'center'; c.fillText('SPACE / GRAPPLE', nearest.x, nearest.y - 33);
    }
  }

  drawArenaLabels() {
    const c = this.ctx;
    c.font = '600 12px ui-monospace, monospace'; c.fillStyle = '#5b7b8a'; c.textAlign = 'left';
    c.fillText('SECTOR 07 / THE DRYDOCK', 63, 958);
    c.textAlign = 'right'; c.fillText('GRAVITY 0.4G  ·  SURFACE STABLE', 1538, 61);
  }
}
