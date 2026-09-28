# Rocket Jockey 3D

Ride a rocket through a 3D arena with a rear chase camera, grapple runners, tow them into the cyan extraction ring, and survive three AI rivals for 90 seconds. The mounted pilot, rockets, arena and effects are procedural Three.js geometry and textures.

**Version 0.2.0 includes guest practice and an online ranking backed by Supabase replay verification.** Demo credits have no cash or token value. Phantom authentication requests a sign-in message signature, never a transaction or spending approval. Google sign-in uses a public pilot pseudonym rather than publishing an email address.

The backend is deployed to Supabase project `ipstzvsjteglrweksidw`. Real Phantom and Google sign-in have **not yet been verified end to end**. The Solana Web3 provider is enabled, application redirect URLs are configured, and synthetic signed authentication has reached profile/run creation. Google is disabled until OAuth credentials are supplied. Guest play remains available independently of authentication.

## Run locally

Use Node.js 22 or later and pnpm 11.19.0:

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm run dev
```

Open [the local arena](http://localhost:4173). Set `PORT` and `HOST` to change the preview server binding. The dev command builds the browser vendor modules before starting. Use `localhost` for local Solana sign-in: the tested `127.0.0.1` origin is rejected by Web3 domain validation. A browser with WebGL 2 is required. Serve the application over HTTP rather than opening the source `index.html` directly.

Runtime dependencies are pinned versions of Three.js and the Supabase JavaScript SDK; esbuild prepares local browser bundles. No externally hosted fonts, models or image assets are required. Guest gameplay does not require a wallet or account; online authentication and ranking require the configured backend.

```sh
pnpm run check
pnpm test
pnpm run build
pnpm run share
```

`build` writes the static application and bundled vendor modules to `dist/`. Publish that directory to an HTTPS static host and configure its exact login redirect URL in Supabase. Building does not deploy the frontend or configure identity providers.

`share` writes `artifacts/telegram-3d/Rocket-Jockey-3D.html` and a Polish quick-start text file. This single HTML file embeds the client code and styles and can be opened directly for a 3D guest-play preview. Treat its ranking and sign-in features as online-only: use the hosted HTTPS application for authenticated runs. WebGL 2 is still required.

## Play

| Control | Action |
| --- | --- |
| W / Up | Thrust |
| A, D / Left, Right | Steer |
| S / Down | Brake |
| Shift + thrust | Boost; consumes regenerating energy |
| Space | Hook the closest runner in range, or release |
| P / Escape | Pause / resume |

Touch devices have on-screen controls. Use the fullscreen button for a larger arena. Hook runners rather than rival rockets, then tow them into the extraction ring. Consecutive deliveries build a score multiplier. Collisions damage your hull; deliveries restore a little health. A round ends at 90 seconds or when hull health reaches zero. Restart abandons the current run.

Sound is opt-in. Switching away pauses a live game. Local history retains ten completed runs, an all-time personal best and cumulative demo credits. Credits per completed run are `10 × extracted runners + floor(score / 100)`. Local browser data can be edited or cleared; it is not a verified ranking result.

## Accounts and ranked runs

Select **Sign in / Pilot profile** and choose Phantom or Google. Phantom needs its browser extension or supported in-app browser and asks for a signed login message. Google redirects through Supabase Auth and restores the browser session on return. A generated `Pilot-` handle appears publicly; leaderboard responses exclude emails, wallet addresses and authentication IDs. The two providers normally produce separate accounts; automatic account linking is not included.

After signing in, enable **Ranked run** before launching. The server issues a run ID and random seed. The game records inputs at a fixed simulation step; on completion it submits that input replay. The Edge Function checks the authenticated owner, expiration and elapsed time, runs the same simulation, and computes the score itself. The browser does not submit a trusted score or choose a ranked seed. The UI reports submission success or failure separately from local results.

The shared leaderboard lists up to 50 pilots using each pilot's best verified run. Runs expire after 20 minutes, and the current start limit is 20 ranked runs per account per hour. A completed run can be verified only once. Guest practice remains local and can continue when ranking is unavailable.

See [ranking setup](docs/ranking-setup.md) for provider settings, redirect URLs, schema and deployment. Browser configuration in `src/config.js` contains only the public project URL and publishable key. Service-role and Google OAuth secrets belong in the backend/provider settings.

Replay verification rejects invented scores and impossible simulation results; it does not prove that a human supplied the inputs. This release has no financial prizes, token payouts, on-chain game actions or multiplayer networking.

## Project structure

- `src/game-core.js`: deterministic simulation, AI, collisions, towing and scoring.
- `src/scene3d.js`: Three.js world, mounted rider, rockets, lighting, effects and rear chase camera.
- `src/game.js`: input, fixed-step lifecycle, scene integration and replay recording.
- `src/replay.js`: compressed input recording and shared replay verification.
- `src/app.js`: HUD, dialogs, sound, touch/fullscreen controls, accounts and ranking integration.
- `src/accounts.js`: Phantom/Google Supabase authentication and session lifecycle.
- `src/ranking.js`: profile, leaderboard and ranked-run Edge Function client.
- `src/progress.js`: local history and demo credits.
- `src/wallet.js`: legacy address-connection adapter retained for compatibility tests; it is not the ranked authentication flow.
- `supabase/schema.sql`: protected profile/run tables and leaderboard query.
- `supabase/functions/rocket-ranked/`: authentication, seeded run issuance and replay verification.
- `scripts/`: vendor preparation, preview server, syntax checks, static build and shareable HTML export.
- `tests/`: simulation, replay, authentication, ranking handler/client, storage and server tests.
- `.github/workflows/ci.yml`: pinned dependency installation, syntax checks, tests and static build.

[Verification notes](docs/verification.md) distinguish automated checks, observed browser/backend behavior and remaining release checks.
