# Privacy & lifecycle remediation

Traceability for the pre-public-beta privacy/lifecycle audit. Each item lists what was
changed and where. Items marked **partial** or **needs env** call out what still
requires a live Firebase/Vercel environment to finish or verify.

## P0 — blocking

| # | Finding | Status | Where |
|---|---------|--------|-------|
| P0-1 | Cross-account localStorage isolation | Fixed | `public/app1.js` (`USFRLocal`, UID-scoped keys, `__usfrSetActiveUser`), `public/firebase-client.js` (auth-change switch, sign-out `clearAll`, scoped sync read), `public/app4.js` (`authGate` for private routes) |
| P0-2 | Consent enforcement for bridge prompts | Fixed | `api/guide.js` (`shouldCreateBridgePrompt`, reads `consentControls.sanitizedPromptInfluence`, suppresses on private safety flag) |
| P0-3 | Real account deletion | Fixed | `api/firebase-account.js` (`runScheduledDeletions`, `eraseAccount`, `deleteFirebaseAuthUser`, `cancelAccountDeletion`, `getDeletionStatus`), `api/deletion-worker.js`, `vercel.json` cron |
| P0-4 | Unlink & block enforcement | Fixed | `api/firebase-account.js` (`dissolveCouple`, block checks in `requestPartnerLink`/`respondToPartnerInvite`, `blockMember` auto-unlink, real `requestUnlink`, real `confirmSharedHistoryDeletion`) |
| P0-5 | Live-session completion bug + idempotency | Fixed | `api/firebase-account.js` (`refreshGuideDossier` registered), `api/guide.js` (`completeSession` transactional claim + deterministic IDs) |

## Production hardening

| # | Finding | Status | Where |
|---|---------|--------|-------|
| 1 | App Check enforcement | Fixed (flag-gated) | `api/guide.js`, `api/firebase-account.js` call `verifyAppCheck`; `public/firebase-client.js` sends `x-firebase-appcheck`. Active only when `FIREBASE_APPCHECK_ENFORCE=true` in production. **needs env:** set the enforce flag + reCAPTCHA Enterprise site key. |
| 2 | Rate-limit all Gemini ops | Fixed | `api/guide.js` (`enforceRateLimit` on plan/respond/privateCoach/completeSession) |
| 3 | Shared-memory sync writes nothing | Fixed | `api/firebase-account.js` (`syncRelationshipState` now writes `sharedMemories`; count renamed to `sharedMemoriesWritten`) |
| 4 | Governance doc overstates protections | Fixed | `docs/live-session-governance.md` rewritten to separate enforced vs planned |
| 5 | Production security headers | Fixed | `vercel.json` `headers` (CSP, HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy, COOP). **partial:** CSP keeps `script-src 'unsafe-inline'` because inline handlers remain (see #10). |
| 6 | Pin model + validate schemas + version prompts | Fixed | `api/_guide-core.js` (default `gemini-2.5-flash`), `api/guide-schema.js` (validators), `api/guide.js` (`PROMPT_VERSION` stamped on writes) |
| 7 | Behavioral tests | Partial | `tests/guide-schema.test.mjs`, `tests/api-handlers.test.mjs`. **needs env:** Firestore Emulator rule tests, mocked Vertex handler tests, Playwright, axe are not runnable in this container. |
| 8 | Real CI build | Fixed | `scripts/build.mjs` (syntax-checks all JS, validates index.html asset refs, flags dead assets); `package.json`/CI updated |
| 9 | Accessibility | Partial | `public/firebase-client.js` (focus trap, Escape, focus restoration, labelled close), `public/index.html` (toast live region). **remaining:** form-error association, icon-button labels across the older views |
| 10 | Frontend consolidation | Not done | Large refactor (modules/TS, remove inline handlers, drop `premium*`/`premium-loader.js`). Tracked, not attempted here. |
| 11 | Dependency-aware health check | Fixed | `api/healthz.js` (readiness booleans + `?deep=1` Firestore/auth probe via `probeFirestore`) |
| 12 | Professional launch review | Out of scope | Legal/privacy/safety/clinical review remains outstanding |

## Operator setup required (env)

- `FIREBASE_APPCHECK_ENFORCE=true` and `FIREBASE_APP_CHECK_SITE_KEY` to activate App Check.
- `DELETION_WORKER_SECRET` for manual invocation of `/api/deletion-worker`; the Vercel
  Cron invoker is authorized automatically via the `x-vercel-cron` header.
- Composite Firestore indexes for `deletionRequests` (`status` + `scheduledEraseAfter`)
  may be required by the deletion worker query.
