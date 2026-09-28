// Demo credits are local game points. They have no monetary or token value.
const STORAGE_KEY = 'rocket-jockey-progress-v1';
const LIMIT = 1_000_000_000;
const MAX_HISTORY = 10;
let memory = null;
const fallback = new WeakMap();
const empty = () => ({ bestScore: 0, totalRuns: 0, totalCredits: 0, history: [] });
const number = (value) => typeof value === 'number' && Number.isFinite(value) ? Math.min(LIMIT, Math.max(0, Math.floor(value))) : 0;

function resolveStorage(storage) {
  if (storage !== undefined) return storage;
  try { return globalThis.localStorage; } catch { return null; }
}

function cleanRun(run) {
  if (!run || typeof run !== 'object' || Array.isArray(run)) return null;
  return {
    id: typeof run.id === 'string' ? run.id.slice(0, 100) : '',
    score: number(run.score), deliveries: number(run.deliveries), credits: number(run.credits),
    date: typeof run.date === 'string' && Number.isFinite(Date.parse(run.date)) ? new Date(run.date).toISOString() : new Date(0).toISOString(),
    duration: number(run.duration),
    reason: typeof run.reason === 'string' ? run.reason.slice(0, 80) : 'finished',
  };
}

function sanitize(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return empty();
  const history = Array.isArray(value.history) ? value.history.slice(0, MAX_HISTORY).map(cleanRun).filter(Boolean) : [];
  return {
    bestScore: Math.max(number(value.bestScore), ...history.map((run) => run.score)),
    totalRuns: Math.max(number(value.totalRuns), history.length),
    totalCredits: number(value.totalCredits), history,
  };
}

function isObject(value) { return value !== null && (typeof value === 'object' || typeof value === 'function'); }

export function loadProgress(storage) {
  const store = resolveStorage(storage);
  if (!isObject(store)) return sanitize(memory);
  if (fallback.has(store)) return sanitize(fallback.get(store));
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (typeof raw !== 'string' || raw.length > 100_000) return empty();
    return sanitize(JSON.parse(raw));
  } catch { return empty(); }
}

function saveProgress(progress, storage) {
  const store = resolveStorage(storage);
  if (!isObject(store)) { memory = progress; return; }
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(progress));
    fallback.delete(store);
  } catch { fallback.set(store, progress); }
}

export function rewardForRun(result = {}) {
  return Math.min(LIMIT, number(result?.deliveries) * 10 + Math.floor(number(result?.score) / 100));
}

export function recordRun(result = {}, storage) {
  const progress = loadProgress(storage);
  const date = new Date().toISOString();
  const run = cleanRun({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    score: result?.score, deliveries: result?.deliveries,
    credits: rewardForRun(result), date, duration: result?.duration, reason: result?.reason,
  });
  progress.bestScore = Math.max(progress.bestScore, run.score);
  progress.totalRuns = Math.min(LIMIT, progress.totalRuns + 1);
  progress.totalCredits = Math.min(LIMIT, progress.totalCredits + run.credits);
  progress.history = [run, ...progress.history].slice(0, MAX_HISTORY);
  saveProgress(progress, storage);
  return sanitize(progress);
}

export function resetProgress(storage) {
  const progress = empty();
  saveProgress(progress, storage);
  return progress;
}
