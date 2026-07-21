# Public-beta implementation matrix

This matrix maps launch-hardening requirements to reviewable files and tests. No professional legal or clinical review has occurred; external review is required before public launch.

| Requirement area | Files | Tests/checks |
|---|---|---|
| Keyless Firebase/Vercel architecture | `api/firebase-account.js`, `api/_guide-core.js`, `FIREBASE_ARCHITECTURE.md` | `npm run check` |
| Private/shared separation and raw-answer non-disclosure | `firestore.rules`, `api/guide.js`, `api/firebase-account.js` | `tests/privacy.test.mjs` |
| Export/deletion/unlink/block/consent/beliefs | `api/firebase-account.js`, `public/firebase-client.js`, `firestore.rules` | `tests/account-workflows.test.mjs` |
| Rate limits/App Check/correlation/audit | `api/security.js`, `api/firebase-account.js`, `api/_guide-core.js` | `tests/security.test.mjs` |
| CI gates | `.github/workflows/public-beta.yml`, `package.json` | GitHub Actions |
| Incident response/rollback | `docs/runbooks/incident-response.md`, `docs/runbooks/rollback.md` | documentation review |
| Legal/privacy/safety surfaces | `docs/legal-privacy-safety.md`, `public/index.html` | documentation review |
| Live-session governance | `docs/live-session-governance.md`, `api/firebase-account.js`, `api/guide.js` | `npm run test` |
| Notifications | `docs/notifications.md` | provider setup review |
| Cloud exercises/interaction ledger | `docs/cloud-exercises-ledger.md`, `firestore.rules` | security rules review |
| Dossier management | `docs/dossier-management.md`, `api/firebase-account.js` | `npm run test` |
| Admin/support | `docs/runbooks/admin-support.md`, `firestore.rules` | security review |
| Accessibility/auth delivery | `docs/accessibility-auth-delivery.md` | Playwright/axe future gate |
