# Rocket Jockey

A playable neon rocket-sled arena, built from the original crypto-game concept. Steer an inertia-driven sled, hook runners, tow them into the central extraction ring, and survive three AI rivals for 90 seconds.

**This release is a local single-player MVP. Credits are demonstration points with no cash or token value.** Connecting a Solana wallet only shares a public address. The app never requests a signature, transfers funds, mints tokens, or pays rewards.

## Run

Install Node.js 22 or later. No package installation, API keys, wallet, or backend is required.

```sh
node scripts/server.js
```

Open http://127.0.0.1:4173. Alternatively use `npm run dev`. Set `PORT` and `HOST` to change the local server binding. Serve via HTTP; opening `index.html` as a local file will not load ES modules.

```sh
node scripts/check.js
node --test
node scripts/build.js
```

The build writes a portable static site to `dist/`. Upload the contents to any static HTTPS host. The included Node server is for local preview. No production deployment happens automatically.

## Play

| Control | Action |
| --- | --- |
| W / Up | Thrust |
| A, D / Left, Right | Rotate |
| S / Down | Brake |
| Shift + thrust | Boost; consumes regenerating energy |
| Space | Hook the closest runner in range, or release |
| P / Escape | Pause / resume |

Touch devices have on-screen controls. Hook a runner near your sled and tow them into the cyan center ring. Fast consecutive deliveries build a score multiplier. Collisions with rivals or hard obstacle impacts damage your hull; deliveries restore a little health. Finish when the timer runs out or the hull reaches zero. Restart abandons the current run; only completed runs count.

Sound is opt-in and generated locally. Switching away pauses a live game. Local history retains the last ten completed runs, with a separate all-time best score and total credits. The leaderboard ranks the retained runs on this device. Browser storage can be edited or cleared and is not a trusted source of competitive results.

Demo credits per completed run: `10 × extracted runners + floor(score / 100)`.

## Wallet

Optional address-only connection supports injected Phantom, Solflare, or a compatible Solana provider. Install and unlock your chosen browser wallet, then select **Connect wallet**. Without a provider, the game remains fully playable. Rejecting a connection is handled gracefully. Mobile wallet deep links and WalletConnect are not included.

## Structure

- `src/game-core.js`: deterministic simulation, collisions, AI, tether and scoring rules.
- `src/game.js`: canvas renderer, input, animation and round lifecycle.
- `src/app.js`: HUD, dialogs, sound, touch controls and module integration.
- `src/wallet.js`: address-only wallet lifecycle.
- `src/progress.js`: validated local progress and demo credits.
- `scripts/`: zero-dependency preview, build and syntax checks.
- `tests/`: Node tests for gameplay rules, wallet behavior, storage and preview server.
- `.github/workflows/ci.yml`: syntax, tests and static build on pushes and PRs.

## Scope beyond this MVP

The original concept mentions multi-chain play-to-earn. Real rewards, multiplayer, account ownership authentication, persistent server leaderboards, additional chains and token contracts are **not implemented**. Production rewards require agreed token economics, a server-authoritative simulation and anti-cheat model, audited contracts, transaction UX, and a funded treasury. The local scores in this build must never authorize real payouts.
