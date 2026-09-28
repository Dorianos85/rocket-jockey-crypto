// Opt-in smoke test: creates ONE throwaway Auth account, profile and unsubmitted run.
// No private key or session token is persisted or printed. No admin API is used.
// Run pnpm run build first: this deliberately tests the same SDK bundle as the browser.
import { generateKeyPairSync, sign } from 'node:crypto';
import { createClient } from '../src/vendor/supabase.js';
import { PUBLIC_CONFIG } from '../src/config.js';

if (!process.argv.includes('--create-test-account')) {
  console.error('Explicit opt-in required: --create-test-account (creates a throwaway account and unsubmitted run).');
  process.exit(2);
}

const url = process.env.ROCKET_SUPABASE_URL || PUBLIC_CONFIG.supabaseUrl;
const key = process.env.ROCKET_SUPABASE_PUBLISHABLE_KEY || PUBLIC_CONFIG.supabaseKey;
const origin = process.env.ROCKET_AUTH_TEST_URL || 'http://localhost:4173/';
if (!url || !key || !key.startsWith('sb_publishable_')) throw new Error('A project URL and publishable key are required.');
const timedFetch = (input, options = {}) => fetch(input, { ...options, signal: AbortSignal.timeout(20000) });
const client = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: timedFetch },
});

function base58(bytes) {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let value = BigInt(`0x${Buffer.from(bytes).toString('hex')}`);
  let text = '';
  while (value > 0n) { text = alphabet[Number(value % 58n)] + text; value /= 58n; }
  for (const byte of bytes) { if (byte !== 0) break; text = `1${text}`; }
  return text;
}

let signedIn = false;
try {
  const settingsResponse = await timedFetch(`${url}/auth/v1/settings`, { headers: { apikey: key } });
  const settings = await settingsResponse.json();
  console.log(JSON.stringify({ check: 'public_auth_settings', status: settingsResponse.status,
    googleEnabled: Boolean(settings.external?.google), web3: settings.external?.web3 ?? settings.web3 ?? null,
    solanaEnabled: settings.external?.solana ?? settings.external?.['web3:solana'] ?? null,
  }));
  if (!settingsResponse.ok) throw new Error('Public auth settings could not be read.');

  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const address = base58(publicKey.export({ format: 'der', type: 'spki' }).subarray(-32));
  const wallet = {
    publicKey: { toBase58: () => address },
    signMessage: async message => new Uint8Array(sign(null, message, privateKey)),
  };
  const auth = await client.auth.signInWithWeb3({
    chain: 'solana', wallet, statement: 'Sign in to Rocket Jockey. No transaction or spending approval.',
    options: { url: origin },
  });
  if (auth.error || !auth.data?.session) {
    console.log(JSON.stringify({ check: 'solana_sign_in', ok: false, code: auth.error?.code, status: auth.error?.status, message: auth.error?.message }));
    process.exitCode = 1;
  } else {
    signedIn = true;
    console.log(JSON.stringify({ check: 'solana_sign_in', ok: true, providers: auth.data.user.identities.map(identity => identity.provider) }));
    for (const action of ['profile', 'start']) {
      const { data, error } = await client.functions.invoke('rocket-ranked', { body: { action } });
      if (error) {
        let detail;
        try { detail = await error.context?.json(); } catch { /* No response body. */ }
        console.log(JSON.stringify({ check: action, ok: false, status: error.context?.status, error: detail?.error ?? error.message }));
        process.exitCode = 1;
        break;
      }
      console.log(JSON.stringify(action === 'profile'
        ? { check: action, ok: true, handle: data.handle, provider: data.provider }
        : { check: action, ok: true, runReserved: Boolean(data.runId), validSeed: Number.isInteger(data.seed), expiresAt: data.expiresAt }));
    }
  }
} catch (error) {
  // Avoid dumping SDK responses, requests, or stacks, which may include credentials.
  console.error(JSON.stringify({ check: 'live_test', ok: false, message: String(error.message).slice(0, 240) }));
  process.exitCode = 1;
} finally {
  if (signedIn) {
    const { error } = await client.auth.signOut({ scope: 'local' });
    console.log(JSON.stringify({ check: 'sign_out', ok: !error }));
  }
}
