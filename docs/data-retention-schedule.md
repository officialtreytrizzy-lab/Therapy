# Data retention schedule

This schedule is a product-control baseline, not a substitute for jurisdiction-specific legal advice. The privacy/legal reviewer must confirm the final periods and any preservation obligations before broad public release.

| Data category | Product purpose | Baseline retention | Deletion trigger | Owner / review |
| --- | --- | --- | --- | --- |
| Authentication account and profile | Sign-in, account ownership, workspace operation | While account is active | Completed account deletion | Security and privacy review annually |
| Individual private reflections and assignments | Private wellness features | While account is active or until user deletes the applicable record | User deletion or completed account deletion | Product and privacy review annually |
| Shared couple records | Joint sessions, goals, agreements, memories | While shared workspace is active | Both-member confirmation or completed shared deletion workflow | Product and privacy review annually |
| Pending invites and relationship requests | Voluntary account linking | Until accepted, declined, expired, or withdrawn | State transition or expiry | Product review each release |
| AI request context and generated output stored in product records | Requested Guide features and continuity | According to the private/shared record that contains it | Parent record deletion or completed account/shared deletion | Clinical safety and privacy review each model change |
| Security rate limits | Abuse prevention | Short rolling windows needed for enforcement | Automatic expiry/cleanup | Security review each release |
| Metadata-only audit events | Security, deletion, consent, and abuse accountability | Minimum period approved by privacy/legal reviewers | Scheduled expiry after approved period unless preservation required | Security and legal review annually |
| Safety and abuse reports | Investigation and user protection | Until resolved plus approved follow-up period | Case closure retention expiry | Safety, privacy, and legal review |
| Export and deletion requests | Fulfillment, proof of request, dispute handling | Until fulfilled plus approved accountability period | Scheduled expiry after approved period | Privacy and legal review annually |
| Email delivery metadata | Secure sign-in delivery and troubleshooting | Provider and application minimum necessary period | Provider/app expiry | Security and privacy review annually |
| CSP and operational telemetry | Browser/security diagnostics | Short period sufficient to identify regressions | Log-platform expiry | Security review each release |
| Backups | Availability and disaster recovery | Provider-defined rotating window approved by reviewer | Backup rotation after deletion | Security and privacy review annually |

## Implementation requirements

- Relationship text must not be added to ordinary operational logs.
- Retention jobs must be idempotent and auditable through metadata only.
- A legal preservation decision must identify its authority, scope, owner, and release condition.
- Shared-space deletion must not allow one linked member to silently erase the other member's shared record.
- User-facing notices must distinguish immediate product deletion from provider backup rotation when applicable.
- Every retained category must have a named owner, documented system of record, and tested deletion path.
