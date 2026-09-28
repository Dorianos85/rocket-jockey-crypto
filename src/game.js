import { WORLD, createState, stepState, getSnapshot } from './game-core.js';
import { ArenaScene } from './scene3d.js';
import { createReplayRecorder, FIXED_STEP } from './replay.js';

const KEYS = { KeyW: 'thrust', ArrowUp: 'thrust', KeyS: 'brake', ArrowDown: 'brake', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', ShiftLeft: 'boost', ShiftRight: 'boost', Space: 'tether' };
const STEP = FIXED_STEP;

export class ArenaGame {
  constructor(canvas, { onUpdate = () => {}, onFinish = () => {} } = {}) {
    this.canvas = canvas;
    this.scene = new ArenaScene(canvas);
    this.onUpdate = onUpdate; this.onFinish = onFinish;
    this.state = createState(); this.input = {}; this.recorder = createReplayRecorder();
    this.last = 0; this.accumulator = 0; this.visualTime = 0; this.reportTimer = 0;
    this.destroyed = false; this.contextLost = false;
    this.onKeyDown = event => {
      if (document.querySelector('dialog[open]') || event.target?.closest?.('button, a, input, textarea, select, [contenteditable="true"]')) return;
      if (['Escape', 'KeyP'].includes(event.code) && !event.repeat) {
        if (this.state.status === 'running') this.pause();
        else if (this.state.status === 'paused') this.resume();
        return;
      }
      const action = KEYS[event.code];
      if (action && this.state.status === 'running') { event.preventDefault(); this.setInput(action, true); }
    };
    this.onKeyUp = event => { const action = KEYS[event.code]; if (action) this.setInput(action, false); };
    this.onBlur = () => this.pause();
    this.onVisibility = () => { if (document.hidden) this.pause(); };
    this.onContextLost = event => {
      event.preventDefault(); this.contextLost = true; this.pause();
      canvas.dispatchEvent(new CustomEvent('arena-render-error', { bubbles: true, detail: { message: 'Graphics context interrupted. The round is paused. Wait for graphics to recover, then resume.' } }));
    };
    this.onContextRestored = () => { this.contextLost = false; this.last = 0; this.resize(); };
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('visibilitychange', this.onVisibility);
    canvas.addEventListener('webglcontextlost', this.onContextLost);
    canvas.addEventListener('webglcontextrestored', this.onContextRestored);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize(); this.emit();
    this.tick = this.tick.bind(this);
    this.frame = requestAnimationFrame(this.tick);
  }

  resize() { this.scene.resize(); }
  emit() { this.onUpdate(getSnapshot(this.state)); }
  start(options = {}) {
    if (this.contextLost) return;
    if (this.state.status === 'paused') return this.resume();
    if (this.state.status === 'running') return;
    if (this.state.status === 'finished') return this.restart(options);
    if (Number.isInteger(options.seed)) this.state = createState(options.seed);
    this.recorder = createReplayRecorder(); this.input = {};
    this.state.status = 'running'; this.last = 0; this.accumulator = 0; this.scene.resetCamera(); this.emit();
  }
  pause() {
    if (this.state.status !== 'running') return;
    this.state.status = 'paused'; this.input = {}; this.accumulator = 0; this.emit();
  }
  resume() {
    if (this.state.status !== 'paused' || this.contextLost) return;
    this.state.status = 'running'; this.input = {}; this.last = 0; this.accumulator = 0; this.emit();
  }
  restart(options = {}) {
    this.state = createState(Number.isInteger(options.seed) ? options.seed : Math.floor(Math.random() * 0x80000000));
    this.scene.resetCamera(); this.start();
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
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost); this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
    this.scene.dispose();
  }

  tick(time) {
    if (this.destroyed) return;
    const dt = this.last ? Math.min((time - this.last) / 1000, 0.1) : STEP;
    this.last = time;
    if (this.state.status !== 'paused') this.visualTime += dt;
    if (this.state.status === 'running' && !this.contextLost) {
      this.accumulator = Math.min(this.accumulator + dt, STEP * 6);
      let changed = false;
      while (this.accumulator + 1e-10 >= STEP && this.state.status === 'running') {
        this.recorder.record(this.input);
        stepState(this.state, this.input, STEP);
        this.accumulator = Math.max(0, this.accumulator - STEP);
        for (const event of this.state.events) {
          changed = true;
          if (event.type === 'delivery' || event.type === 'hit' || event.type === 'tether') this.scene.burst(event);
          this.canvas.dispatchEvent(new CustomEvent('arena-event', { bubbles: true, detail: event }));
        }
      }
      this.reportTimer += dt;
      if (this.reportTimer >= 0.08 || changed || this.state.status === 'finished') { this.emit(); this.reportTimer = 0; }
      if (this.state.status === 'finished') {
        this.input = {}; this.accumulator = 0;
        this.onFinish({ score: this.state.score, deliveries: this.state.deliveries, duration: Math.min(WORLD.duration, this.state.elapsed), reason: this.state.reason, replay: this.recorder.finish() });
      }
    }
    if (!this.contextLost) this.scene.update(this.state, this.input, dt, this.visualTime);
    this.frame = requestAnimationFrame(this.tick);
  }
}
