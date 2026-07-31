# External release blockers

The repository can automate and verify code controls, but it cannot issue third-party credentials or replace independent professional judgment. Broad public release remains blocked until both items below are completed and linked to the exact release record.

## Firebase App Check credential and enforcement

**Owner:** repository/project owner

Completion evidence:

- reCAPTCHA Enterprise App Check Web registration for the Firebase project;
- production hostname registration;
- `FIREBASE_APP_CHECK_SITE_KEY` configured in Vercel;
- `FIREBASE_APPCHECK_ENFORCE=true` configured in Vercel;
- redeployed production health showing App Check ready and enforced;
- legitimate desktop/mobile account, consent, Guide, linking, export, and deletion flows verified;
- invalid or missing App Check tokens rejected.

Runbook: [`app-check-rollout.md`](./app-check-rollout.md)

## Independent professional review

**Owner:** release owner

Completion evidence:

- privacy review;
- legal review;
- licensed clinical-safety review appropriate to the product's relationship-wellness claims and crisis/coercion handling;
- accessibility review including assistive technology and high-zoom/mobile testing;
- security review of the production configuration and incident process.

Record: [`release-safety-review.md`](./release-safety-review.md)

Neither item should be marked complete through a developer self-attestation alone.
