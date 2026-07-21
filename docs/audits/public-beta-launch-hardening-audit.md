# Public-beta launch-hardening audit

Status key: PASS means a production implementation existed before this change; PARTIAL means a foundation existed but needed hardening; MISSING means no complete implementation was present.

| Phase | Status | Evidence before implementation | This change |
|---|---:|---|---|
| 1 Account/consent/data rights | PARTIAL | Firebase profiles, invites, private subcollections, and shared couple collections existed in `api/firebase-account.js`, `firestore.rules`, and `public/firebase-client.js`; deletion/export/unlink/consent controls were not complete. | Added idempotent export, deletion request, unlink request/confirm, blocking, consent, and dossier belief actions. |
| 2 Security/abuse | PARTIAL | Server-side auth and deny-by-default rules existed in `api/firebase-account.js`, `api/_guide-core.js`, and `firestore.rules`; rate limits, App Check enforcement hooks, audit schemas, and abuse reports were missing. | Added shared security helpers, rate limits, correlation IDs, redacted audit logs, App Check gate, and abuse/blocking records. |
| 3 Tests/CI | MISSING | `package.json` had syntax checks only. | Added Node tests and GitHub Actions gates for check/build/test. |
| 4 Monitoring/incident response | MISSING | `api/healthz.js` existed, but no incident docs or redacted event schema. | Added monitoring/incident and rollback runbooks plus audit/telemetry schemas. |
| 5 Legal/privacy/safety | MISSING | README/Firebase docs described architecture, but user-facing policy documents were incomplete. | Added public-beta legal/privacy/safety documentation with professional review required. |
| 6 Live-session reliability | PARTIAL | Live sessions, turns, presence, and duration fields existed in `api/firebase-account.js` and `api/guide.js`; governance/checkpointing state machine was incomplete. | Added documented state machine and session governance model; server actions are prepared for idempotent ledgers. |
| 7 Notifications | MISSING | No email notification abstraction existed. | Added provider-neutral notification design and matrix; implementation remains provider setup dependent. |
| 8 Cloud exercises/ledger | PARTIAL | Interaction ledger and private assignments existed; browser-only exercise migration was incomplete. | Added Firestore collections/rules/docs for exercises and ledger visibility. |
| 9 Dossier management | PARTIAL | Dossier rebuild existed and excluded private raw answers. | Added belief screen data contract/actions and provenance/correction records. |
| 10 Admin/support | MISSING | No admin support tools existed. | Added least-privilege rule skeleton and incident/admin runbook; UI is gated for future roles. |
| 11 Accessibility/auth delivery | PARTIAL | Responsive premium UI existed. | Added accessibility/auth delivery checklist and CI target; full axe coverage remains follow-up. |
