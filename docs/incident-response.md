# Privacy and security incident response

This runbook covers suspected account compromise, unauthorized disclosure, abusive access, provider compromise, harmful AI output, deletion failures, and service outages involving relationship-wellness information.

## Severity

- **SEV-1:** active unauthorized access, broad disclosure, destructive account action, credible immediate safety risk, leaked secret, or confirmed production compromise.
- **SEV-2:** limited unauthorized access, repeated security-control failure, deletion/export failure affecting users, or harmful automated behavior without confirmed broad exposure.
- **SEV-3:** isolated defect, suspicious event without evidence of access, or non-sensitive availability degradation.

## Immediate containment

1. Preserve correlation IDs, audit metadata, deployment IDs, affected account IDs, and timestamps. Do not copy private relationship text into chat, tickets, or ordinary logs.
2. Rotate exposed secrets and revoke affected sessions or service credentials.
3. Disable the smallest affected feature or route. Do not weaken authentication, App Check, Firestore rules, or deletion authorization to restore availability.
4. If AI behavior is unsafe, disable Guide actions while preserving account/export/deletion access.
5. If a user may face physical danger or coercive monitoring, avoid contacting a shared email/device without considering the reported safety context.

## Investigation

- Confirm which environment, deployment, account, workspace, and provider are involved.
- Determine data categories accessed, altered, exported, or deleted.
- Distinguish private individual records from intentionally shared couple records.
- Review metadata-only audit events and provider logs using the narrowest necessary time window.
- Record every administrative access to sensitive evidence.
- Preserve relevant records according to counsel and incident requirements without silently extending ordinary product retention.

## Recovery

1. Patch or configure the control in a branch.
2. Add a regression test reproducing the failure.
3. Run unit, Firestore emulator, dependency, browser, accessibility, and deployment checks applicable to the incident.
4. Deploy to preview, then production with an explicit rollback point.
5. Verify health, authentication boundaries, audit logging, export, and deletion behavior after recovery.

## Notification and escalation

The release owner must maintain current internal contacts for security, privacy/legal, clinical safety, hosting, Firebase/Google Cloud, and email delivery. Legal counsel should determine whether and when user, regulator, law-enforcement, insurer, or provider notification is required. Do not promise confidentiality, breach status, or notification timing before the facts and applicable obligations are established.

## Post-incident review

Within the review record, document:

- timeline and detection source;
- root cause and contributing controls;
- affected data and people;
- containment and recovery actions;
- notification decisions;
- test and monitoring changes;
- owner and deadline for every remaining action.

Store the review in an access-controlled location. The public repository should contain only a sanitized summary when disclosure is appropriate.
