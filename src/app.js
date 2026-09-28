import { ArenaGame } from './game.js';
import { createAccountSession } from './accounts.js';
import { createRankingClient } from './ranking.js';
import { PUBLIC_CONFIG } from './config.js';
import { loadProgress, recordRun, rewardForRun } from './progress.js';

const $ = id => document.getElementById(id);
const number = value => Math.round(value || 0).toLocaleString('en-US');
let status = 'ready';
let previousDeliveries = 0;
let soundEnabled = false;
let audioContext;
let toastTimer;
let accountState = { status: 'loading', user: null };
let profileAlias = null;
let activeRankedRun = null;
let launchPending = false;
let submissionRevision = 0;
let googleAvailable = null;
const onlineConfig = location.protocol === 'file:' ? {} : PUBLIC_CONFIG;
const guidance = document.createElement('div');
guidance.className = 'arena-guidance';
guidance.hidden = true;
document.querySelector('.arena-canvas-wrap').append(guidance);
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
  guidance.hidden = !['running', 'paused'].includes(status);
  guidance.textContent = snapshot.tethered ? 'TETHER LOCKED · TOW TO THE CYAN RING' : snapshot.canGrapple ? 'RUNNER IN RANGE · SPACE / HOOK' : 'FIND A RUNNER · GET CLOSE TO HOOK';
  $('pause-button').disabled = !['running', 'paused'].includes(status);
  $('pause-button').textContent = status === 'paused' ? 'Resume' : 'Pause';
  $('restart-button').disabled = status === 'ready';
  $('ranked-toggle').disabled = !accountState.user || ['running', 'paused'].includes(status) || launchPending;
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
let game;
try { game = new ArenaGame($('arena'), {
  onUpdate: update,
  async onFinish(result) {
    renderProgress(recordRun(result));
    $('result-title').textContent = result.reason === 'destroyed' || result.reason === 'health' ? 'SLED DOWN. HEAD UP.' : 'THAT WAS A RUN.';
    $('result-score').textContent = number(result.score);
    $('result-deliveries').textContent = number(result.deliveries);
    $('result-reward').textContent = `+${number(rewardForRun(result))}`;
    $('result-dialog').showModal();
    sound(320);
    const ranked = activeRankedRun;
    activeRankedRun = null;
    const revision = ++submissionRevision;
    $('result-ranking-status').textContent = ranked ? 'Checking your run on the server…' : 'Practice run · saved on this device.';
    if (ranked) {
      try {
        if (accountState.user?.id !== ranked.userId) throw new Error('Account changed. This run was saved locally only.');
        const verified = await ranking.submitRun(ranked.runId, result.replay);
        if (revision === submissionRevision) $('result-ranking-status').textContent = `Verified · ${number(verified.score)} points added to the global ranking.`;
        await refreshLeaderboard();
      } catch (error) {
        if (revision === submissionRevision) $('result-ranking-status').textContent = `Not ranked: ${error.message} Local result saved.`;
      }
    }
  },
}); } catch (error) {
  $('overlay-title').textContent = '3D NOT AVAILABLE';
  $('overlay-copy').textContent = 'This game needs WebGL 2. Enable hardware acceleration in your browser and reload.';
  $('start-button').disabled = true;
  $('pause-button').disabled = true;
  $('restart-button').disabled = true;
  console.error(error);
}
async function launch(forceNew = false) {
  if (!game || launchPending) return;
  if (!forceNew && status === 'paused') {
    game.resume(); $('arena').focus({ preventScroll: true }); return;
  }
  launchPending = true;
  $('ranked-toggle').disabled = true;
  $('start-button').disabled = true;
  $('play-again').disabled = true;
  $('restart-button').disabled = true;
  try {
    let options = {};
    activeRankedRun = null;
    if ($('ranked-toggle').checked) {
      if (!accountState.user) throw new Error('Sign in with Phantom or Google to start a ranked run.');
      const userId = accountState.user.id;
      $('ranked-status').textContent = 'Reserving your ranked run…';
      const ranked = await ranking.startRankedRun();
      if (accountState.user?.id !== userId) throw new Error('Account changed. Please start the run again.');
      activeRankedRun = { ...ranked, userId };
      options.seed = ranked.seed;
    }
    submissionRevision++;
    if ($('result-dialog').open) $('result-dialog').close();
    $('session-mode').textContent = activeRankedRun ? 'RANKED / VERIFIED REPLAY' : 'PRACTICE / SOLO';
    $('ranked-status').textContent = activeRankedRun ? 'Ranked run reserved. Finish to submit your result.' : 'Practice results stay on this device.';
    game.restart(options);
    $('arena').focus({ preventScroll: true });
    sound(220);
  } catch (error) {
    toast(error.message || 'Could not start this run. Please try again.');
    $('ranked-status').textContent = error.message;
  } finally {
    launchPending = false;
    $('start-button').disabled = false;
    $('play-again').disabled = false;
    $('restart-button').disabled = status === 'ready';
    $('ranked-toggle').disabled = !accountState.user || ['running', 'paused'].includes(status);
  }
}
$('start-button').addEventListener('click', () => launch());
$('play-again').addEventListener('click', () => launch(true));
$('pause-button').addEventListener('click', () => { status === 'running' ? game?.pause() : game?.resume(); $('arena').focus({ preventScroll: true }); });
$('restart-button').addEventListener('click', () => { game?.pause(); void launch(true); });
$('close-result').addEventListener('click', () => $('result-dialog').close());
$('help-button').addEventListener('click', () => { if (status === 'running') game?.pause(); $('help-dialog').showModal(); });
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
    game?.setInput(action, true);
  });
  const release = () => { button.classList.remove('is-pressed'); game?.setInput(action, false); };
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
  button.addEventListener('lostpointercapture', release);
  button.addEventListener('keydown', event => { if (event.key === 'Enter') game?.setInput(action, true); });
  button.addEventListener('keyup', event => { if (event.key === 'Enter') release(); });
});
const accounts = createAccountSession({ config: onlineConfig, onChange(state) {
  const previousId = accountState.user?.id;
  accountState = state;
  if (profileAlias?.userId !== state.user?.id) profileAlias = null;
  const signedIn = Boolean(state.user);
  $('connect-wallet').textContent = signedIn ? 'Pilot profile ↗' : 'Sign in / Pilot profile ↗';
  $('account-name').textContent = signedIn ? profileAlias?.handle || state.user.displayName : 'GUEST PILOT';
  $('account-status').textContent = state.error || (signedIn ? 'Signed in. Enable Ranked run to publish a verified score.' : state.status === 'loading' ? 'Connecting…' : 'Sign in to compete in the global ranking.');
  $('wallet-status').textContent = signedIn ? `${state.user.provider === 'phantom' ? 'Phantom' : state.user.provider === 'google' ? 'Google' : 'Account'} signed in` : 'Guest pilot · practice available';
  $('sign-out').hidden = !signedIn;
  $('sign-in-phantom').disabled = state.status === 'loading' || state.status === 'unconfigured';
  $('sign-in-google').disabled = state.status === 'loading' || state.status === 'unconfigured' || googleAvailable === false;
  $('ranked-toggle').disabled = !signedIn || ['running', 'paused'].includes(status) || launchPending;
  if (!signedIn) $('ranked-toggle').checked = false;
  if (activeRankedRun && state.user?.id !== activeRankedRun.userId) {
    activeRankedRun = null; $('session-mode').textContent = 'PRACTICE / ACCOUNT CHANGED';
    toast('Account changed. This run will be saved locally only.');
  }
  if (signedIn && previousId !== state.user.id) {
    const id = state.user.id;
    void Promise.resolve().then(() => ranking.fetchProfile()).then(profile => {
      if (accountState.user?.id === id) { profileAlias = {userId: id, handle: profile.handle}; $('account-name').textContent = profile.handle; }
    }).catch(error => { $('account-status').textContent = error.message; });
  }
} });
const ranking = createRankingClient({ getClient: accounts.getClient });
let leaderboardLoading = false;
async function refreshLeaderboard() {
  if (leaderboardLoading) return;
  leaderboardLoading = true;
  $('refresh-leaderboard').disabled = true;
  $('global-leaderboard-status').textContent = 'Loading global ranking…';
  try {
    const entries = await ranking.fetchLeaderboard();
    const list = $('global-leaderboard-list'); list.replaceChildren();
    for (const entry of entries) {
      const row = document.createElement('li'); row.className = 'leaderboard-entry';
      const rank = document.createElement('span'); rank.className = 'leaderboard-rank'; rank.textContent = String(entry.rank).padStart(2, '0');
      const player = document.createElement('span'); player.textContent = `${entry.handle} · ${entry.provider === 'phantom' ? 'Phantom' : entry.provider === 'google' ? 'Google' : 'Pilot'}`;
      const score = document.createElement('strong'); score.textContent = number(entry.bestScore);
      row.append(rank, player, score); list.append(row);
    }
    $('global-leaderboard-status').textContent = entries.length ? 'Best verified run per pilot · refreshed just now' : 'No ranked runs yet. Sign in and set the first score.';
  } catch (error) {
    const list = $('global-leaderboard-list');
    if (!list.querySelector('.leaderboard-entry')) list.replaceChildren();
    $('global-leaderboard-status').textContent = error.message;
  }
  finally { leaderboardLoading = false; $('refresh-leaderboard').disabled = false; }
}
$('connect-wallet').addEventListener('click', () => { game?.pause(); $('account-dialog').showModal(); });
if (window.location.hostname === '127.0.0.1') {
  const note = document.createElement('p');
  note.className = 'dialog-note';
  note.textContent = 'Phantom sign-in needs the localhost address. ';
  const localLink = document.createElement('a');
  localLink.id = 'localhost-auth-link';
  const localUrl = new URL('/', window.location.href);
  localUrl.hostname = 'localhost';
  localLink.href = localUrl.href;
  localLink.textContent = 'Open localhost for Phantom ↗';
  note.append(localLink);
  $('account-status').after(note);
}
$('close-account').addEventListener('click', () => $('account-dialog').close());
$('sign-in-phantom').addEventListener('click', () => void accounts.signInPhantom());
$('sign-in-google').addEventListener('click', () => void accounts.signInGoogle());
$('sign-out').addEventListener('click', () => void accounts.signOut());
$('refresh-leaderboard').addEventListener('click', () => void refreshLeaderboard());
$('ranked-toggle').addEventListener('change', () => {
  $('ranked-status').textContent = $('ranked-toggle').checked ? 'Your next run will be checked and published to the global ranking.' : 'Practice results stay on this device.';
});
$('fullscreen-button').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await $('arena-stage').requestFullscreen();
    $('arena').focus({ preventScroll: true });
  } catch { toast('Fullscreen is unavailable in this browser.'); }
});
document.addEventListener('fullscreenchange', () => { $('fullscreen-button').textContent = document.fullscreenElement ? 'Exit fullscreen' : 'Fullscreen'; });
$('arena').addEventListener('arena-render-error', () => { toast('3D rendering was interrupted. Reload the page to recover.'); });
window.addEventListener('pagehide', () => { game?.pause(); });
renderProgress();
$('toast').hidden = true;
void accounts.initialize().then(() => refreshLeaderboard());
async function checkSignInAvailability() {
  if (!onlineConfig.supabaseUrl) return;
  try {
    const response = await fetch(`${onlineConfig.supabaseUrl}/auth/v1/settings`, { headers: {apikey: onlineConfig.supabaseKey}, signal: AbortSignal.timeout(8000) });
    if (!response.ok) return;
    const settings = await response.json();
    googleAvailable = settings.external?.google !== false;
    if (!googleAvailable) {
      $('sign-in-google').disabled = true;
      $('sign-in-google').textContent = 'Google · coming soon';
      $('sign-in-google').title = 'Google sign-in has not been enabled yet.';
    }
  } catch { /* Authentication itself reports network errors when attempted. */ }
}
void checkSignInAvailability();
