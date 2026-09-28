/** Address-only injected wallet connection. Never requests signatures or transactions. */
export function shortAddress(address, length = 4) {
  if (typeof address !== 'string') return '';
  const size = Math.max(1, Math.min(12, Math.trunc(Number(length)) || 4));
  return address.length > size * 2 + 1 ? `${address.slice(0, size)}…${address.slice(-size)}` : address;
}

export function createWalletSession({ onChange, scope = globalThis } = {}) {
  let state = { status: 'disconnected', address: null, provider: null, error: null };
  let wallet = null;
  let pending = null;
  let disconnecting = null;
  let generation = 0;
  let destroyed = false;
  let listeners = [];
  const getState = () => ({ ...state });
  const update = (next) => {
    state = { ...state, ...next };
    if (!destroyed && typeof onChange === 'function') onChange(getState());
    return getState();
  };
  const addressOf = (key) => {
    if (!key) return null;
    const value = typeof key === 'string' ? key : key.toBase58?.() ?? key.toString?.();
    return typeof value === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value) ? value : null;
  };
  const detach = () => {
    for (const [event, handler] of listeners) {
      if (typeof wallet?.removeListener === 'function') wallet.removeListener(event, handler);
      else wallet?.off?.(event, handler);
    }
    listeners = [];
  };
  const discover = () => {
    const host = scope.window ?? scope;
    if (typeof host.phantom?.solana?.connect === 'function') return [host.phantom.solana, 'Phantom'];
    if (typeof host.solflare?.connect === 'function') return [host.solflare, 'Solflare'];
    if (typeof host.solana?.connect === 'function') {
      return [host.solana, host.solana.isPhantom ? 'Phantom' : host.solana.isSolflare ? 'Solflare' : 'Solana'];
    }
    return [null, null];
  };
  const bind = () => {
    if (typeof wallet?.on !== 'function') return;
    const disconnected = () => {
      generation += 1;
      pending = null;
      update({ status: 'disconnected', address: null, error: null });
    };
    const accountChanged = (key) => {
      if (destroyed) return;
      const address = addressOf(key);
      if (!address) return disconnected();
      update({ status: 'connected', address, error: null });
    };
    listeners = [['disconnect', disconnected], ['accountChanged', accountChanged]];
    for (const [event, handler] of listeners) wallet.on(event, handler);
  };

  const connect = () => {
    if (destroyed || state.status === 'connected') return Promise.resolve(getState());
    // A provider can emit disconnect when its asynchronous cleanup completes.
    // Let that finish before attaching listeners for a new connection.
    if (disconnecting) return disconnecting.then(() => connect());
    if (pending) return pending;
    detach();
    const [injected, provider] = discover();
    wallet = injected;
    if (!wallet) return Promise.resolve(update({ status: 'unavailable', provider: null, address: null, error: 'Install Phantom or Solflare to connect a Solana wallet.' }));
    const current = ++generation;
    update({ status: 'connecting', provider, address: null, error: null });
    bind();
    const operation = Promise.resolve().then(() => {
      if (destroyed || current !== generation) return null;
      return injected.connect();
    }).then((response) => {
      if (destroyed || current !== generation) return getState();
      const address = addressOf(response?.publicKey ?? injected.publicKey);
      if (!address) throw new Error('The wallet did not provide a valid Solana address.');
      return update({ status: 'connected', address, error: null });
    }).catch((error) => {
      if (destroyed || current !== generation) return getState();
      detach();
      const rejected = error?.code === 4001 || /reject|cancel|denied/i.test(String(error?.message ?? ''));
      return update({ status: 'error', address: null, error: rejected ? 'Wallet connection was cancelled. You can continue playing.' : 'Could not connect to the wallet. Please unlock it and try again.' });
    }).finally(() => {
      if (pending === operation) pending = null;
    });
    pending = operation;
    return operation;
  };

  const disconnect = () => {
    if (disconnecting) return disconnecting.then(getState);
    generation += 1;
    pending = null;
    detach();
    const previous = wallet;
    wallet = null;
    const operation = Promise.resolve().then(() => previous?.disconnect?.()).catch(() => {
      // Local disconnection still succeeds if the extension rejects cleanup.
    }).finally(() => {
      if (disconnecting === operation) disconnecting = null;
    });
    disconnecting = operation;
    update({ status: 'disconnected', address: null, provider: null, error: null });
    return operation.then(getState);
  };
  const destroy = () => {
    destroyed = true;
    generation += 1;
    pending = null;
    detach();
    wallet = null;
  };
  return { connect, disconnect, getState, destroy };
}
