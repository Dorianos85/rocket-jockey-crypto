import { ArenaGame } from './game.js';
import { createWalletSession, shortAddress } from './wallet.js';
import { loadProgress, recordRun, rewardForRun } from './progress.js';

const $ = id => document.getElementById(id);
const number = value => Math.round(value || 0).toLocaleString('en-US');
let status = 'ready';
let previousDeliveries = 0;
let soundEnabled = false;
let audioContext;
let toastTimer;
function toast(message) {
  $('toast').textContent = message;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4500);
}
function sound(frequency = 440) {
  if (!soundEnabled) return;
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    audioContext ||= new Audio();
    void audioContext.resume().catch(() => {});
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.6, audioContext.currentTime + .12);
    gain.gain.setValueAtTime(.08, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + .2);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + .21);
  } catch { /* Audio is optional; gameplay remains available. */ }
}
function renderProgress(progress = loadProgress()) {
  $('best-value').textContent = number(progress.bestScore);
  $('rounds-value').textContent = number(progress.totalRuns);
  $('rewards-value').textContent = number(progress.totalCredits);
  const list = $('leaderboard-list');
  list.replaceChildren();
  const best = [...progress.history].sort((a, b) => b.score - a.score).slice(0, 4);
  if (!best.length) {
    const empty = document.createElement('li');
    empty.className = 'leaderboard-empty';
    empty.textContent = 'Your first run starts the story.';
    list.append(empty);
  }
  best.forEach((run, index) => {
    const row = document.createElement('li');
    row.className = 'leaderboard-entry';
    const rank = document.createElement('span');
    rank.className = 'leaderboard-rank';
    rank.textContent = String(index + 1).padStart(2, '0');
    const name = document.createElement('span');
    name.textContent = `YOU · ${run.deliveries} extracted`;
    const value = document.createElement('strong');
    value.textContent = number(run.score);
    row.append(rank, name, value);
    list.append(row);
  });
}
function update(snapshot) {
  status = snapshot.status;
  $('score-value').textContent = number(snapshot.score);
  $('health-value').textContent = `${Math.ceil(snapshot.health)}%`;
  $('energy-value').textContent = `${Math.ceil(snapshot.energy)}%`;
  $('health-value').style.setProperty('--value', `${snapshot.health}%`);
  $('energy-value').style.setProperty('--value', `${snapshot.energy}%`);
  for (const [id, value] of [['health-fill', snapshot.health], ['energy-fill', snapshot.energy]]) {
    if ($(id)) $(id).style.width = `${value}%`;
  }
  const seconds = Math.max(0, Math.ceil(snapshot.timeLeft));
  $('time-value').textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  $('deliveries-value').textContent = number(snapshot.deliveries);
  $('pause-button').disabled = !['running', 'paused'].includes(status);
  $('pause-button').textContent = status === 'paused' ? 'Resume' : 'Pause';
  $('restart-button').disabled = status === 'ready';
  const overlay = $('game-overlay');
  overlay.hidden = !['ready', 'paused'].includes(status);
  if (status === 'paused') {
    $('overlay-title').textContent = 'HOLD THAT THRUST.';
    $('overlay-copy').textContent = 'Arena paused. Your timer is safe. Ready for another pass?';
    $('start-button').textContent = 'Resume run →';
  }
  if (snapshot.deliveries > previousDeliveries) sound(660);
  previousDeliveries = snapshot.deliveries;
}
const game = new ArenaGame($('arena'), {
  onUpdate: update,
  onFinish(result) {
    renderProgress(recordRun(result));
    $('result-title').textContent = result.reason === 'destroyed' || result.reason === 'health' ? 'SLED DOWN. HEAD UP.' : 'THAT WAS A RUN.';
    $('result-score').textContent = number(result.score);
    $('result-deliveries').textContent = number(result.deliveries);
    $('result-reward').textContent = `+${number(rewardForRun(result))}`;
    $('result-dialog').showModal();
    sound(320);
  },
});
function launch() {
  if ($('result-dialog').open) $('result-dialog').close();
  if (status === 'paused') game.resume();
  else if (status === 'ready') game.start();
  else game.restart();
  $('arena').focus({ preventScroll: true });
  sound(220);
}
$('start-button').addEventListener('click', launch);
$('play-again').addEventListener('click', () => { game.restart(); $('result-dialog').close(); $('arena').focus({ preventScroll: true }); });
$('pause-button').addEventListener('click', () => { status === 'running' ? game.pause() : game.resume(); $('arena').focus({ preventScroll: true }); });
$('restart-button').addEventListener('click', () => { game.restart(); $('arena').focus({ preventScroll: true }); });
$('close-result').addEventListener('click', () => $('result-dialog').close());
$('help-button').addEventListener('click', () => { if (status === 'running') game.pause(); $('help-dialog').showModal(); });
$('close-help').addEventListener('click', () => $('help-dialog').close());
$('sound-button').addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  $('sound-button').setAttribute('aria-pressed', String(soundEnabled));
  $('sound-button').textContent = soundEnabled ? 'Sound on' : 'Sound off';
  sound();
  if (status === 'running') $('arena').focus({ preventScroll: true });
});
document.querySelectorAll('[data-control]').forEach(button => {
  const action = button.dataset.control === 'grapple' ? 'tether' : button.dataset.control;
  button.addEventListener('pointerdown', event => {
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    button.classList.add('is-pressed');
    game.setInput(action, true);
  });
  const release = () => { button.classList.remove('is-pressed'); game.setInput(action, false); };
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
  button.addEventListener('lostpointercapture', release);
  button.addEventListener('keydown', event => { if (event.key === 'Enter') game.setInput(action, true); });
  button.addEventListener('keyup', event => { if (event.key === 'Enter') release(); });
});
const wallet = createWalletSession({ onChange(state) {
  $('connect-wallet').disabled = state.status === 'connecting';
  $('connect-wallet').textContent = state.status === 'connected' ? `${shortAddress(state.address)} · Disconnect` : state.status === 'connecting' ? 'Connecting…' : 'Connect wallet ↗';
  $('wallet-status').textContent = state.status === 'connected' ? `${state.provider} connected · address only` : 'Optional · Solana · no transactions';
  if (state.error) toast(state.error);
} });
$('connect-wallet').addEventListener('click', async () => {
  if (status === 'running') game.pause();
  try {
    if (wallet.getState().status === 'connected') await wallet.disconnect();
    else await wallet.connect();
  } catch (error) { toast(error.message || 'Wallet connection could not be completed.'); }
});
window.addEventListener('pagehide', () => { game.pause(); });
renderProgress();
$('toast').hidden = true;
