import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createWalletSession, shortAddress } from '../src/wallet.js';

const ADDRESS = '11111111111111111111111111111111';
const OTHER = '22222222222222222222222222222222';
function fakeWallet() {
  const wallet = new EventEmitter();
  wallet.connects = 0;
  wallet.connect = async () => { wallet.connects += 1; return { publicKey: { toBase58: () => ADDRESS } }; };
  wallet.disconnect = async () => wallet.emit('disconnect');
  wallet.signTransaction = () => assert.fail('Never sign transactions');
  wallet.signMessage = () => assert.fail('Never sign messages');
  return wallet;
}

test('missing wallet reports unavailable and remains playable', async () => {
  const session = createWalletSession({ scope: {} });
  assert.equal((await session.connect()).status, 'unavailable');
  assert.match(session.getState().error, /Install Phantom or Solflare/);
});

test('Phantom is preferred, duplicate connects share a request, addresses update', async () => {
  const wallet = fakeWallet();
  const secondary = fakeWallet();
  const changes = [];
  const session = createWalletSession({ scope: { window: { phantom: { solana: wallet }, solflare: secondary } }, onChange: state => changes.push(state) });
  const first = session.connect();
  assert.equal(first, session.connect());
  assert.equal((await first).address, ADDRESS);
  assert.equal(wallet.connects, 1);
  assert.equal(secondary.connects, 0);
  assert.equal(session.getState().provider, 'Phantom');
  wallet.emit('accountChanged', OTHER);
  assert.equal(session.getState().address, OTHER);
  wallet.emit('accountChanged', null);
  assert.equal(session.getState().status, 'disconnected');
  assert.equal(changes[0].status, 'connecting');
  session.destroy();
  assert.equal(wallet.listenerCount('accountChanged'), 0);
  assert.equal(wallet.listenerCount('disconnect'), 0);
});

test('Solflare and generic Solana wallets connect using provider.publicKey fallback', async () => {
  for (const [slot, expected] of [['solflare', 'Solflare'], ['solana', 'Solana']]) {
    const wallet = fakeWallet();
    wallet.publicKey = ADDRESS;
    wallet.connect = async () => undefined;
    const session = createWalletSession({ scope: { [slot]: wallet } });
    assert.equal((await session.connect()).provider, expected);
    assert.equal(session.getState().address, ADDRESS);
    await session.disconnect();
    assert.equal(session.getState().status, 'disconnected');
    assert.equal(wallet.listenerCount('accountChanged'), 0);
  }
});

test('wallet rejection becomes recoverable error', async () => {
  const wallet = fakeWallet();
  wallet.connect = async () => { throw { code: 4001 }; };
  const session = createWalletSession({ scope: { solana: wallet } });
  assert.match((await session.connect()).error, /cancelled/);
  assert.equal(wallet.listenerCount('disconnect'), 0);
  wallet.connect = async () => ({ publicKey: ADDRESS });
  assert.equal((await session.connect()).status, 'connected');
});

test('disconnect and destroy ignore late connection resolutions', async () => {
  for (const action of ['disconnect', 'destroy']) {
    const wallet = fakeWallet();
    let resolve;
    wallet.connect = () => new Promise(done => { resolve = done; });
    const session = createWalletSession({ scope: { solana: wallet } });
    const pending = session.connect();
    await Promise.resolve();
    await session[action]();
    resolve({ publicKey: ADDRESS });
    assert.notEqual((await pending).status, 'connected');
    assert.equal(wallet.listenerCount('disconnect'), 0);
  }
});

test('immediate disconnect cancels a not-yet-started request', async () => {
  const wallet = fakeWallet();
  const session = createWalletSession({ scope: { solana: wallet } });
  const pending = session.connect();
  await session.disconnect();
  await pending;
  assert.equal(wallet.connects, 0);
});

test('reconnection waits for old provider disconnect and survives its delayed event', async () => {
  const wallet = fakeWallet();
  let finishDisconnect;
  wallet.disconnect = () => new Promise(resolve => {
    finishDisconnect = () => { wallet.emit('disconnect'); resolve(); };
  });
  const session = createWalletSession({ scope: { solana: wallet } });
  await session.connect();
  const closing = session.disconnect();
  const reconnecting = session.connect();
  const duplicate = session.connect();
  await Promise.resolve();
  assert.equal(wallet.connects, 1);
  finishDisconnect();
  await closing;
  assert.equal((await reconnecting).status, 'connected');
  assert.equal((await duplicate).status, 'connected');
  assert.equal(wallet.connects, 2);
  assert.equal(wallet.listenerCount('disconnect'), 1);
  session.destroy();
});

test('invalid address is rejected and shortAddress safely formats input', async () => {
  const wallet = fakeWallet();
  wallet.connect = async () => ({ publicKey: '<script>untrusted</script>' });
  const session = createWalletSession({ scope: { solana: wallet } });
  assert.equal((await session.connect()).status, 'error');
  assert.equal(shortAddress(ADDRESS), '1111…1111');
  assert.equal(shortAddress(null), '');
  assert.equal(shortAddress('abc'), 'abc');
});
