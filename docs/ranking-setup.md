# Shared ranking setup

The browser supports guest practice, Google authentication, and signed Phantom authentication. The shared ranking requires a configured Supabase project and deployed `rocket-ranked` Edge Function. A local best score is not an uploaded or verified score.

## Project configuration

1. Select the Supabase project intended for this game. Apply `supabase/schema.sql` using the project's SQL Editor or database tooling. This is a schema source, not a migration-history file. Both game tables enable RLS and deny browser database access. Only the server's `service_role` can access them.
2. Deploy the `rocket-ranked` Edge Function with its game-core/replay dependencies. The handler authenticates profile/start/submit requests with `auth.getUser()` and exposes only generated handles and aggregate game statistics for leaderboard reads. Its CORS policy permits any origin; authorization comes from the verified bearer token, not the origin header. Gateway JWT verification is disabled so the leaderboard is public, while the handler verifies every authenticated action.
3. Set `PUBLIC_CONFIG.supabaseUrl` and `PUBLIC_CONFIG.supabaseKey` in `src/config.js`. Use a **publishable key**, or a legacy **anon** key. Never put a service-role key, secret API key, or Google client secret in this file, the browser bundle, or Git.
4. In Supabase Authentication URL Configuration, allow the exact application redirect URL, plus the local development URL when needed. Preserve an existing shared project's Site URL and other applications' redirects. Google uses the current origin and pathname. For Web3, register the matching URL including the trailing slash; the official Web3 guide explains domain and URI validation.

## Phantom

Enable the Solana Web3 provider in Supabase Authentication. Use Phantom's extension or its mobile in-app browser. Login connects the wallet and requests a **message signature** proving address ownership; no transaction, token transfer, spending approval, or RPC balance request is made. Cancelling the prompt keeps guest play available.

Signing out ends this browser's Supabase session. It does not revoke the wallet extension's site connection. Phantom and Google normally create separate accounts; automatic account linking is not implemented.

## Google

Create a Web Application OAuth client in Google Cloud. Add the game's origin as an authorized JavaScript origin and the Supabase Auth callback URL as an authorized redirect URI (`https://YOUR_PROJECT.supabase.co/auth/v1/callback`, or the project's configured custom auth domain). Enter the Google client ID and secret only in the Supabase Google provider settings, then enable that provider. Configure the Google consent screen and permitted test users or production audience.

The browser uses the SDK's PKCE flow with URL session detection, persistent sessions, and token refresh. The redirect must return to the same browser and site storage where login started.

## Ranking protocol

- `leaderboard` returns `{ entries: [{ handle, provider, bestScore, deliveries, totalRuns }] }`. No email, full wallet address, auth UUID, or identity metadata belongs in this response.
- `start` authenticates the user, creates the server-generated profile if necessary, and issues `{ runId, seed, expiresAt }`. Seeds are non-negative signed 32-bit integers. Runs expire after 20 minutes by default, allowing ordinary pauses.
- `submit` receives `{ runId, replay }`. The server loads that user's issued seed, checks expiration and elapsed time, bounds and validates the replay, re-simulates the game, and derives the result itself. Updating an active run to verified must include both `user_id` and `status = 'active'` predicates so replays cannot award the same result twice.

Profiles use randomly generated `Pilot-` pseudonyms. The provider label is derived server-side from verified Auth identities. Never use editable `user_metadata` or a request body's provider/user ID for authorization. Do not add direct client INSERT/UPDATE policies on the score tables. The Edge Function invokes the service-role-only `rocket_leaderboard()` SQL function, which selects each pilot's best verified run, counts their verified runs, and returns at most 50 pilots. It uses SECURITY INVOKER and does not expose identity IDs.

Replay verification rejects invented scores and impossible game-state outcomes. It does not establish that a human supplied the inputs; automation and tool-assisted play require additional anti-abuse controls for a prize-bearing competition. This demo has no prizes or token payouts.

## Verification before release

Run the local tests, then verify on the configured project: guest leaderboard read; Google redirect/session restoration; Phantom acceptance and rejection; authenticated run start/submission; duplicate/expired/wrong-user rejection; denial of direct table access with anon and authenticated browser credentials; and safe leaderboard fields. Test signing out and reloading. Run Supabase database advisors after applying the schema. Local unit tests do not prove that OAuth credentials or production provider settings are correct.

Official references: [Web3 authentication](https://supabase.com/docs/guides/auth/auth-web3), [JavaScript Web3 API](https://supabase.com/docs/reference/javascript/auth-signinwithweb3), [Google login](https://supabase.com/docs/guides/auth/social-login/auth-google), [redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).
