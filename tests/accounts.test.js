import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccountSession } from '../src/accounts.js';

const config = { supabaseUrl: 'https://example.supabase.co', supabaseKey: 'sb_publishable_test' };
const user = { id: '01234567-89ab-cdef-0123-456789abcdef', email: 'private@example.com', identities: [{ provider: 'google' }], user_metadata: { name: 'Private Name', provider: 'phantom' } };
function fixture(overrides = {}) {
  let listener;
  let unsubscribed = false;
  const calls = [];
  const client = { auth: {
    onAuthStateChange(callback) { listener = callback; return { data: { subscription: { unsubscribe() { unsubscribed = true; } } } }; },
    async getSession() { return { data: { session: null }, error: null }; },
    async signInWithWeb3(input) { calls.push(input); return { data: { session: { user: { ...user, identities: [{ provider: 'web3:solana' }] } } }, error: null }; },
    async signInWithOAuth(input) { calls.push(input); return { data: { url: 'https://accounts.google.com' }, error: null }; },
    async signOut() { listener('SIGNED_OUT', null); return { error: null }; },
    ...overrides,
  } };
  const createClientImpl = (_url, _key, options) => { calls.push(options); return client; };
  return { client, createClientImpl, calls, emit: session => listener('SIGNED_IN', session), unsubscribed: () => unsubscribed };
}

test('missing/unsafe configuration never initializes SDK or signs in a fake user', async () => {
  const service = `x.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.x`;
  for (const input of [{}, { ...config, supabaseKey: 'sb_secret_private' }, { ...config, supabaseKey: service }, { ...config, supabaseUrl: 'http://untrusted.example' }]) {
    const account = createAccountSession({ config: input, createClientImpl: () => assert.fail('SDK must not initialize') });
    assert.equal((await account.signInGoogle()).status, 'unconfigured');
    assert.equal(account.getClient(), null);
    assert.equal(account.getState().user, null);
  }
});

test('restores identity without exposing email/name and clears subscription on destroy', async () => {
  const f = fixture({ getSession: async () => ({ data: { session: { user } }, error: null }) });
  const account = createAccountSession({ config, createClientImpl: f.createClientImpl });
  const state = await account.initialize();
  assert.equal(state.status, 'signed-in');
  assert.equal(state.user.provider, 'google');
  assert.equal(state.user.displayName, 'Pilot-01234567');
  assert.equal(JSON.stringify(state).includes('private@example.com'), false);
  assert.equal(account.getClient(), f.client);
  assert.equal(f.calls[0].auth.flowType, 'pkce');
  f.emit(null);
  assert.equal(account.getState().status, 'guest');
  account.destroy();
  assert.equal(f.unsubscribed(), true);
  f.emit({ user });
  assert.equal(account.getState().status, 'guest');
});

test('Phantom connects and requests signed authentication without a transaction', async () => {
  const f = fixture();
  let connections = 0;
  const wallet = { connect: async () => { connections++; }, signTransaction: () => assert.fail('No spending approval') };
  const account = createAccountSession({ config, createClientImpl: f.createClientImpl, scope: { phantom: { solana: wallet } } });
  const one = account.signInPhantom();
  assert.equal(one, account.signInPhantom());
  assert.equal((await one).user.provider, 'phantom');
  assert.equal(connections, 1);
  assert.deepEqual(f.calls[1], { chain: 'solana', wallet, statement: 'Sign in to Rocket Jockey. No transaction or spending approval.' });
  assert.equal((await account.signOut()).status, 'guest');
});

test('IP origin shows localhost recovery before requesting any wallet connection or signature', async () => {
  const f = fixture();
  const account = createAccountSession({ config, createClientImpl: f.createClientImpl, scope: {
    location: { hostname: '127.0.0.1', port: '4173' },
    phantom: { solana: { connect: () => assert.fail('Invalid SIWS origin must not prompt the wallet') } },
  } });
  const state = await account.signInPhantom();
  assert.equal(state.status, 'error');
  assert.match(state.error, /http:\/\/localhost:4173\//);
  assert.equal(f.calls.length, 1);
});

test('missing Phantom, rejected signature, and session failure remain recoverable', async () => {
  const f = fixture({ signInWithWeb3: async () => ({ data: null, error: { code: 4001 } }) });
  const scope = {};
  const account = createAccountSession({ config, createClientImpl: f.createClientImpl, scope });
  assert.match((await account.signInPhantom()).error, /Install Phantom/);
  scope.phantom = { solana: { connect: async () => {} } };
  assert.match((await account.signInPhantom()).error, /cancelled/);
  const broken = fixture({ getSession: async () => ({ data: null, error: new Error('network') }) });
  assert.equal((await createAccountSession({ config, createClientImpl: broken.createClientImpl }).initialize()).status, 'error');
});

test('Google redirects to current page without forwarding query or hash', async () => {
  const f = fixture();
  const account = createAccountSession({ config, createClientImpl: f.createClientImpl, scope: { location: { origin: 'https://game.example', pathname: '/arena/', search: '?redirect=evil', hash: '#token' } } });
  assert.equal((await account.signInGoogle()).status, 'loading');
  assert.deepEqual(f.calls[1], { provider: 'google', options: { redirectTo: 'https://game.example/arena/' } });
});

test('sign-out waits for pending authentication so late success cannot restore the session', async () => {
  let finish;
  const f = fixture({ signInWithWeb3: () => new Promise(resolve => { finish = resolve; }) });
  const account = createAccountSession({ config, createClientImpl: f.createClientImpl, scope: { phantom: { solana: { connect: async () => {} } } } });
  await account.initialize();
  const signing = account.signInPhantom();
  await new Promise(resolve => setImmediate(resolve));
  const signingOut = account.signOut();
  finish({ data: { session: { user } }, error: null });
  await signing;
  assert.equal((await signingOut).status, 'guest');
});
