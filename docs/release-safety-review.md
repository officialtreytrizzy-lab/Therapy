# Public release safety review

This document is the release-control record for US, FOR REAL. Code review cannot substitute for licensed clinical, privacy, or legal review. A broad public launch should not be represented as professionally approved until the named reviewers below have signed the current policy and product version.

## Release identity

- Product: US, FOR REAL
- Policy version: 1.0
- Policy effective date: July 31, 2026
- Repository release commit: _fill at approval_
- Production deployment: _fill at approval_

## Required approvals

| Discipline | Minimum scope | Reviewer | Credentials / organization | Date | Decision | Evidence link |
| --- | --- | --- | --- | --- | --- | --- |
| Privacy | Data map, retention, export/deletion, provider disclosures, incident response | _required_ | _required_ | _required_ | Pending | _required_ |
| Legal | Terms, privacy notice, age eligibility, consumer disclosures, jurisdiction | _required_ | _required_ | _required_ | Pending | _required_ |
| Clinical safety | Crisis language, coercive-control handling, AI boundaries, escalation paths | _required_ | _required_ | _required_ | Pending | _required_ |
| Accessibility | Keyboard, screen reader, zoom, contrast, reduced motion, mobile | _required_ | _required_ | _required_ | Pending | _required_ |
| Security | Auth, App Check, rules, abuse controls, deletion worker, logging | _required_ | _required_ | _required_ | Pending | _required_ |

## Technical evidence required before approval

- [ ] App Check reCAPTCHA Enterprise site key is configured for every production domain.
- [ ] `FIREBASE_APPCHECK_ENFORCE=true` is present in production and preview environments used by external testers.
- [ ] `/api/healthz` reports `appCheckReady: true` and `appCheckEnforced: true`.
- [ ] Firestore emulator authorization tests pass.
- [ ] Browser authentication-gate tests pass on desktop and mobile Chromium.
- [ ] Automated accessibility scans have no serious or critical violations on public, sign-in, gated, legal, and safety routes.
- [ ] Production dependency audit reports no high or critical findings.
- [ ] CSP report-only telemetry has been reviewed and an owner is assigned to remaining legacy inline-handler/style debt.
- [ ] Account export, unlink, deletion request, shared deletion confirmation, and scheduled erasure were manually exercised with test accounts.
- [ ] A coercive-control scenario was reviewed without encouraging joint mediation or forced disclosure.
- [ ] AI transport failure, malformed output, quota failure, and timeout behavior were exercised.
- [ ] Incident contact, escalation owner, and rollback procedure are documented.

## Privacy data map

Reviewers should verify each category against production behavior:

1. Account and authentication identifiers.
2. Individual profile and onboarding data.
3. Private reflections and assignments.
4. Shared couple records, sessions, goals, agreements, and memories.
5. AI prompts, generated responses, corrections, and derived signals.
6. Safety reports and abuse metadata.
7. Export, unlink, deletion, and audit records.
8. Operational logs, correlation IDs, rate limits, and provider telemetry.
9. Email delivery metadata.
10. Backups and provider-level retention.

## Clinical and coercive-control scenarios

The reviewer should test at minimum:

- active threats or immediate danger;
- stalking or device monitoring;
- forced account linking or disclosure;
- retaliation after a shared exercise;
- suicide or self-harm language;
- substance impairment or inability to consent;
- one partner attempting to erase the other's shared history;
- an AI response that wrongly assigns blame or invents intent;
- an LGBTQ+ user whose identity or relationship structure is not safely recognized;
- a user seeking diagnosis, legal judgment, or emergency instruction.

## Approval rule

A reviewer may approve, approve with named conditions, or reject. Conditions must have an owner and deadline. The release owner must not replace a professional reviewer's decision with a self-attestation.
