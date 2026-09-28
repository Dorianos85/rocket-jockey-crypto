# Version 0.2.0 verification — 2026-09-29

This record describes the 3D release with Supabase authentication and replay-verified ranking. The previous 2D browser report is not evidence that the replacement renderer or real identity-provider configuration has passed the same checks.

## Automated checks

Executed against the current source on 2026-09-29:

- `node scripts/check.js`: passed.
- `node --test`: 44 tests passed, 0 failed.
- `pnpm install --frozen-lockfile --ignore-scripts` with pnpm 11.19.0 and the existing store directory: passed.
- Static build and single-file share export: passed.
- `git diff --check` for the documentation/package changes: passed.

The tests cover deterministic seeded simulation, acceleration/braking/boost, towing and extraction, combos, collisions and round completion; local storage validation; account session restoration, Phantom signature cancellation, IP-origin recovery before any wallet prompt, and Google redirect construction; compressed replay round-tripping and invalid/incomplete replay rejection; ranking response sanitization; and static preview file restrictions.

Edge Function handler tests use controlled authentication/database implementations. They cover public leaderboard projection; malformed/oversized/unauthenticated requests; rejection of editable metadata as proof of Google identity; hourly start limits; server-generated seeds; generated pilot aliases; wrong-owner, duplicate, expired, incomplete and accelerated submissions; score recomputation from inputs; replay hashing and atomic single submission; and non-disclosure of database errors. Fake-provider/account tests do not verify real OAuth credentials or extension approvals.

Legacy wallet-adapter tests remain in the suite. The production account UI now uses signed Phantom authentication or Google OAuth rather than treating an address-only connection as an authenticated pilot.

## 3D browser observations

Confirmed against the current 3D build:

- Desktop viewport: 1440 × 1080. Rear-camera screenshots in ready and running states show the rider and rocket, with no browser JavaScript errors observed.
- A controlled live round used the normal input API and public restart seed `20260929`, with no direct game-state mutation. It finished through hull loss after 24.733333 seconds, scoring 300 points and 3 extractions across 1,484 simulation frames.
- Running that round's recorded inputs through `verifyReplay` reproduced the score, extraction count, duration and terminal reason exactly.
- The generated standalone HTML loaded through a `file://` URL with the browser in offline mode. Reload and launch succeeded and the round timer advanced; the artifact contained no module script elements and requested no remote resources. This confirms offline guest play, not online account or ranking support for local-file origins.
- The profile dialog handled missing Phantom with an actionable installation/in-app-browser message. Google sign-in was visibly disabled with “Google · coming soon” while credentials are unavailable.

Responsive/touch checks are still being completed. The prior release's 2D accessibility results are not counted as a fresh audit of this 3D release.

## Deployed backend smoke checks

Supabase project: `ipstzvsjteglrweksidw`.

The deployment session confirmed:

- Public `rocket-ranked` leaderboard request: HTTP 200 with an empty entries array. No test or fabricated ranking rows were published.
- Unauthenticated ranked-run start: HTTP 401.
- Direct browser-role access to the game tables through the REST API: permission denied.

These observations establish endpoint availability and the checked access boundary.

A synthetic Solana authentication probe against the live project also passed using `http://localhost:4173/`. It generated an ephemeral Ed25519 key in memory and authenticated with a signed Web3 message; Supabase returned a `web3` identity. The Edge Function returned a generated pilot alias, classified the provider as Phantom, and issued a valid seeded run with a 20-minute expiration. Sign-out succeeded. No private key or session token was logged, no score was submitted, and no leaderboard entry was published.

The equivalent probe from `http://127.0.0.1:4173/` failed with HTTP 400 because the sign-in message domain was invalid. Use `localhost` as the canonical local authentication origin. The app now catches the IP-origin case before opening the wallet and offers a link to the localhost version. Public Auth settings confirmed Google remains disabled.

Synthetic signature acceptance proves the configured server-side Web3 authentication/profile/start path; it does not exercise a real Phantom extension approval screen or verify the full browser login-to-ranking flow.

## Optional live authentication probe

To reproduce the synthetic probe with the browser SDK bundle:

```sh
pnpm run build
node scripts/verify-live-solana.mjs --create-test-account
```

This explicit opt-in creates a new test Auth user, a profile and an unsubmitted run on the configured project; those records are not deleted automatically. The private key stays in process memory, the session is signed out at completion, and the script never submits a score. Optional overrides are `ROCKET_SUPABASE_URL`, `ROCKET_SUPABASE_PUBLISHABLE_KEY` and `ROCKET_AUTH_TEST_URL`; the default origin is `http://localhost:4173/`.

## Remaining release checks and limits

- **Real Phantom login has not been verified end to end.** The Solana Web3 provider is enabled and two application redirect URLs were saved and confirmed in the dashboard. Verify accepted and rejected signature prompts, session restoration, and sign-out using a real extension or supported wallet browser. Phantom requests a sign-in signature; no transaction is requested.
- **Real Google login has not been verified end to end.** The Google provider is disabled because OAuth credentials have not yet been supplied. Configure the credentials and permitted redirects before testing. Verify redirect return, session restoration, public pseudonym and sign-out with a permitted Google account.
- Complete an authenticated round against the deployed Edge Function and confirm the replay-derived result appears exactly once in the global ranking. Exercise deployed duplicate, expired and wrong-user rejection. Local handler tests are not a substitute for this flow.
- Physical iOS/Android, multi-touch behavior and hardware/GPU compatibility need device testing. WebGL 2 support is required. A procedural 3D render check does not establish performance across devices.
- No fresh full accessibility audit is claimed for the 3D release. The canvas game requires visual interaction.
- Replay verification establishes consistency with the seeded simulation, not human control of the inputs. It does not prevent every form of automation or tool-assisted play.
- Local scores and demo credits are editable browser data. No cash value, token economy, real rewards, multiplayer service or on-chain transactions are implemented.

See [ranking setup](ranking-setup.md) for the deployment and identity-provider checklist.
