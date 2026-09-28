# MVP verification — 2026-09-28

## Automated checks

- `node scripts/check.js`: passed for browser modules, scripts and tests.
- `node --test`: 22 tests passed, 0 failed.
- `node scripts/build.js`: static `dist/` generated successfully.
- `git diff --check`: passed.

Tests cover deterministic simulation, acceleration and braking, boost energy, tether range and key edges, extraction and combos, collisions, invulnerability, time/hull round completion, local persistence and corrupt storage, wallet rejection/account changes/disconnection races, and restricted static-file serving.

## Chromium browser checks

Verified with agent-browser 0.38.1 and Chromium 154 on a local HTTP preview:

- Desktop 1440 × 1080 and narrow 393px viewport render successfully; no browser JavaScript errors.
- Launch, pause/resume, restart, instructions and result dialogs operate.
- Opening instructions pauses the game; pressing P while the dialog is open does not resume it.
- Keyboard thrust moves the sled and Shift consumes boost energy.
- On-screen thrust responds to pointer down and releases on pointer up.
- Missing wallet provider shows an actionable message without blocking play.
- An organically completed hull-loss round opened the results and saved history.
- A controlled integration run placed a runner near extraction, then used the real Space handler and simulation: 100 points, 1 extraction, 11 demo credits. Expiring the clock opened results and saved exactly one history entry; Play Again started another run. Arena state was instrumented only in the test browser, with no production debug API.
- Narrow viewport has no horizontal overflow after the arena width fix; help remains available and touch controls are visible.
- axe-core 4.12.1 reports 0 automatic violations after contrast fixes. Gradient/transparent decorative and overlay elements remain manual-review items; this is not a full accessibility certification. The canvas action game requires visual interaction.

## Limits

- Device emulation verified narrow layout and mouse-generated pointer controls, not physical iOS/Android hardware or multi-touch behavior.
- Real wallet extension approval was not exercised in the test browser. Injected provider behavior is covered by fake-provider unit tests; no signatures, RPC or on-chain transactions occur.
- No multiplayer service, trusted server scores, real token economy, deployed contracts or cash payouts exist in this MVP.
- Local scores and credits are editable browser data and must never authorize financial rewards.
