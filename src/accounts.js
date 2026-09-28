const STATEMENT = 'Sign in to Rocket Jockey. No transaction or spending approval.';

function validConfig(config) {
  try {
    const url = new URL(config?.supabaseUrl);
    if (url.username || url.password || url.search || url.hash) return false;
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) return false;
    const key = config?.supabaseKey;
    if (typeof key !== 'string') return false;
    if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return true;
    const payload = key.split('.')[1];
    return Boolean(payload && JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))).role === 'anon');
  } catch { return false; }
}

function publicUser(user) {
  if (!user?.id || typeof user.id !== 'string') return null;
  // This is display-only. The Edge Function independently verifies JWT identity.
  const providers = (user.identities || []).map(identity => identity.provider);
  const provider = providers.includes('google') ? 'google' : providers.some(value => ['web3', 'solana', 'web3:solana'].includes(value)) ? 'phantom' : 'other';
  return { id: user.id, displayName: `Pilot-${user.id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8)}`, provider };
}

export function createAccountSession({ config, onChange, createClientImpl, scope = globalThis } = {}) {
  let state = { status: validConfig(config) ? 'guest' : 'unconfigured', user: null, error: null };
  let client = null;
  let initialization = null;
  let operation = null;
  let subscription = null;
  let destroyed = false;
  let revision = 0;
  const getState = () => ({ ...state, user: state.user ? { ...state.user } : null });
  const setState = next => {
    if (destroyed) return getState();
    state = { ...state, ...next };
    onChange?.(getState());
    return getState();
  };
  const setUser = user => {
    const visibleUser = publicUser(user);
    return setState({ status: visibleUser ? 'signed-in' : 'guest', user: visibleUser, error: null });
  };
  const failure = (error, fallback) => {
    const cancelled = error?.code === 4001 || /reject|cancel|denied/i.test(String(error?.message ?? ''));
    return setState({ status: 'error', error: cancelled ? 'Sign-in was cancelled. You can keep playing as a guest.' : fallback });
  };

  const initialize = () => {
    if (destroyed) return Promise.resolve(getState());
    if (initialization) return initialization;
    if (client) return Promise.resolve(getState());
    initialization = (async () => {
      try {
        const settings = config ?? (await import('./config.js')).PUBLIC_CONFIG;
        if (!validConfig(settings)) return setState({ status: 'unconfigured', user: null, error: 'Shared ranking is not configured. Guest play is available.' });
        setState({ status: 'loading', error: null });
        const createClient = createClientImpl ?? (await import('./vendor/supabase.js')).createClient;
        if (destroyed) return getState();
        client = createClient(settings.supabaseUrl, settings.supabaseKey, {
          auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true },
        });
        subscription = client.auth.onAuthStateChange((_event, session) => {
          revision += 1;
          setUser(session?.user);
        }).data.subscription;
        const before = revision;
        const { data, error } = await client.auth.getSession();
        if (error) throw error;
        if (before === revision) setUser(data?.session?.user);
        return getState();
      } catch (error) {
        return failure(error, 'Sign-in could not be initialized. Please reload and try again.');
      } finally { initialization = null; }
    })();
    return initialization;
  };

  const perform = callback => {
    if (operation) return operation;
    const pending = (async () => {
      await initialize();
      if (destroyed || !client) return getState();
      setState({ status: 'loading', error: null });
      try { await callback(); } catch (error) { failure(error, 'Sign-in failed. Check your connection and try again.'); }
      return getState();
    })().finally(() => { if (operation === pending) operation = null; });
    operation = pending;
    return pending;
  };

  const signInPhantom = () => perform(async () => {
    const host = scope.window ?? scope;
    const hostname = host.location?.hostname ?? '';
    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) || hostname.startsWith('[')) {
      // Supabase's SIWS parser accepts DNS names/localhost, but not IP literals.
      // Never sign a substituted origin: the wallet must show the actual page.
      const local = hostname === '127.0.0.1' || hostname === '[::1]';
      setState({ status: 'error', error: local
        ? `For Phantom sign-in, open http://localhost:${host.location.port || '4173'}/. Guest play remains available here.`
        : 'Phantom sign-in requires a domain name rather than an IP address. Open this game using its website address.' });
      return;
    }
    const wallet = host.phantom?.solana ?? (host.solana?.isPhantom ? host.solana : null);
    if (typeof wallet?.connect !== 'function') {
      setState({ status: 'error', error: 'Install Phantom or open this page in the Phantom browser, then try again.' });
      return;
    }
    await wallet.connect();
    if (destroyed) return;
    const { data, error } = await client.auth.signInWithWeb3({ chain: 'solana', wallet, statement: STATEMENT });
    if (error) throw error;
    if (!data?.session?.user) throw new Error('Missing session');
    setUser(data.session.user);
  });

  const signInGoogle = () => perform(async () => {
    const location = (scope.window ?? scope).location;
    if (!location?.origin || !location?.pathname) throw new Error('Missing browser origin');
    const { error } = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${location.origin}${location.pathname}` } });
    if (error) throw error;
    // The SDK now redirects. Session restoration on return is handled by PKCE.
  });

  const signOut = () => {
    // Wait for any wallet prompt so its late success cannot undo this sign-out.
    if (operation) return operation.then(() => signOut());
    return perform(async () => {
      try {
        const { error } = await client.auth.signOut({ scope: 'local' });
        if (error) throw error;
        setUser(null);
      } catch (error) { failure(error, 'Could not sign out. Check your connection and try again.'); }
    });
  };

  const destroy = () => { destroyed = true; subscription?.unsubscribe(); subscription = null; };
  return { initialize, signInPhantom, signInGoogle, signOut, getState, getClient: () => client, destroy };
}
