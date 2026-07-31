# Production smoke test

Run against the canonical production domain after deployment. Use dedicated test accounts and avoid entering real sensitive relationship information.

## Public routes

- `/` returns the app shell and restrictive security headers.
- `/sign-in` presents the public sign-in screen.
- `/privacy.html`, `/terms.html`, and `/wellness-safety.html` return standalone documents.
- `/crisis` returns the immediate-support experience.

## API boundaries

- GET `/api/firebase-account` returns 405.
- GET `/api/guide` returns 405.
- GET `/api/deletion-worker` returns 401 or 405 and never performs work.
- GET `/api/healthz?cspReport=1` returns 405 with `Allow: POST`.
- POST `/api/healthz?cspReport=1` with a small synthetic CSP payload returns 204.
- `/api/healthz` reports the exact configuration readiness state.
- `/api/healthz?deep=1` reports Firestore and Google authentication as healthy.

## Signed-out browser

- `/dashboard` fails closed to sign-in.
- No private workspace data flashes before authentication resolves.
- Keyboard focus starts predictably and the skip link reaches the main app region.
- No serious or critical automated accessibility violations appear on covered public routes.

## Signed-in test account

- Profile provisioning succeeds.
- Current policy consent blocks the workspace until accepted.
- Decline signs out; accept records the current policy version.
- Private reflection is visible only to its owner.
- Partner invitation can be created, declined, accepted, and withdrawn.
- Guide requests require authentication and App Check when enforcement is enabled.
- Export, unlink, deletion request, deletion cancellation, and shared-history confirmation behave as documented.

## Operational verification

- Vercel runtime logs show no new error or fatal events from the smoke window.
- CSP telemetry contains metadata only and strips URL query strings.
- No relationship text appears in operational logs.
- The deployed commit and health response are attached to the release record.
