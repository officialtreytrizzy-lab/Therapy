# Production release owner checklist

Complete this checklist for the exact commit and deployment being promoted. Attach links to evidence rather than relying on verbal confirmation.

## Code and CI

- [ ] Pull request is conflict-free and approved under repository policy.
- [ ] Node runtime, lockfile, CI, and Vercel project use the same major version.
- [ ] Production dependency audit has no high or critical findings.
- [ ] Unit and regression tests pass.
- [ ] Firestore emulator authorization tests pass.
- [ ] Desktop and mobile browser tests pass.
- [ ] Automated accessibility tests have no serious or critical violations on covered routes.
- [ ] Vercel preview is READY and uses no more than the plan's function limit.

## Production configuration

- [ ] Firebase public web configuration is present.
- [ ] Google workload identity and Firestore deep health checks pass.
- [ ] Vertex configuration and failure handling are verified.
- [ ] SMTP sign-in delivery is verified with a test account.
- [ ] `CRON_SECRET` is present and the deletion worker rejects unauthorized requests.
- [ ] Firebase App Check site key is present and enforcement is enabled.
- [ ] `/api/healthz` reports `releaseReady: true`.
- [ ] `/api/healthz?deep=1` reports healthy dependencies.

## Product flows

- [ ] Landing and sign-in routes render on desktop and mobile.
- [ ] Private routes fail closed while signed out and while auth is unresolved.
- [ ] New adult users must accept the current policy version.
- [ ] Declining policy consent signs the user out.
- [ ] Individual/private and intentionally shared records remain separated.
- [ ] Partner linking is voluntary and can be declined or withdrawn.
- [ ] Account export, unlink, deletion request, cancellation, shared-history confirmation, and scheduled erasure are manually tested.
- [ ] Crisis and coercive-control language does not encourage unsafe joint mediation.

## Governance

- [ ] Privacy, legal, clinical safety, accessibility, and security reviews are recorded in `docs/release-safety-review.md`.
- [ ] Incident contacts and escalation ownership are current.
- [ ] Retention periods are approved and implemented for every data category.
- [ ] Rollback deployment and environment-variable rollback steps are confirmed.
- [ ] Release commit, deployment ID, approval evidence, and release time are recorded.
