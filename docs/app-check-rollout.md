# Firebase App Check production rollout

The application code is ready for Firebase App Check with reCAPTCHA Enterprise. The remaining credential is a public site key issued through the Firebase/Google Cloud project. Do not invent, reuse, or commit a key from another project.

## 1. Provision

1. Open the Firebase project `us-for-real-therapy`.
2. Register the Web app for App Check using reCAPTCHA Enterprise.
3. Add every production hostname and any externally shared preview hostname that must pass enforcement.
4. Copy the public site key. Do not copy a private reCAPTCHA API credential into the browser configuration.

## 2. Configure Vercel

Add these values to Production and to any Preview environment used by external testers:

- `FIREBASE_APP_CHECK_SITE_KEY=<public site key>`
- `FIREBASE_APPCHECK_ENFORCE=true`

The browser reads the public site key from `/api/firebase-config`, initializes `ReCaptchaEnterpriseProvider`, and attaches `x-firebase-appcheck` to authenticated API calls. The server rejects protected requests when enforcement is requested but the client key is missing.

## 3. Stage before broad release

1. Deploy to a protected preview with the site key and enforcement flag.
2. Test email-link and Google authentication on desktop and mobile.
3. Test account provisioning, policy consent, Guide requests, partner linking, export, unlink, and deletion controls.
4. Confirm legitimate requests contain valid App Check tokens.
5. Confirm missing or invalid tokens receive `401` and do not create partial records.
6. Review App Check metrics for unexpected rejection rates.

## 4. Verify readiness

Check:

- `/api/firebase-config` reports `appCheckReady: true`.
- `/api/healthz` reports:
  - `appCheckRequested: true`
  - `appCheckClientConfigured: true`
  - `appCheckEnforced: true`
  - `appCheckReady: true`
  - `releaseReady: true` when all other dependencies are configured.
- `/api/healthz?deep=1` reports Firestore and Google authentication as healthy.

## 5. Rollback

If legitimate users are blocked, set `FIREBASE_APPCHECK_ENFORCE=false` and redeploy while preserving the site key. Investigate hostname registration, browser privacy controls, token initialization, and provider metrics before re-enabling enforcement. Do not remove server-side authentication or Firestore rules as a workaround.
