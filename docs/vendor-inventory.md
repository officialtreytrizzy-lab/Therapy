# Production service provider inventory

The privacy/legal reviewer must verify contracts, data locations, retention, subprocessor terms, and incident contacts for each enabled production service.

| Provider / system | Product role | Data categories potentially processed | Required review |
| --- | --- | --- | --- |
| Firebase Authentication | Account authentication and session identity | Email, account ID, provider identity, session metadata | Account security, retention, deletion, data location |
| Cloud Firestore | Product database | Profiles, private records, shared records, consent, safety/deletion/audit metadata | Rules, encryption, retention, backup, deletion, access logging |
| Google Cloud workload identity | Server-to-server authorization | Service identity and operational metadata | Least privilege, audience/provider restrictions, rotation |
| Vertex AI | AI-assisted Guide processing | Minimum request context needed for requested Guide action | Training/data-use terms, retention, regional processing, safety controls |
| Firebase App Check / reCAPTCHA Enterprise | App attestation and abuse prevention | Attestation token, device/browser risk metadata, request metadata | Notice, hostname registration, metrics, false-positive handling |
| Vercel | Static hosting and serverless execution | Requests, headers, function logs, deployment metadata | Log controls, regions, retention, incident process, access control |
| SMTP/email provider | Secure sign-in-link delivery | Recipient email, delivery metadata, message template | Authentication, suppression/bounce handling, retention, incident process |
| GitHub | Source, CI, pull requests, release evidence | Code, test logs, sanitized operational evidence | Secret scanning, permissions, branch protection, artifact retention |

Relationship text should not be copied into vendor support tickets, source-control issues, CI logs, or ordinary operational logs. Any new provider must be added here before production use.
