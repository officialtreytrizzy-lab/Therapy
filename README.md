# US, FOR REAL — Couple Wellness

A privacy-separated relationship-wellness application for two linked Firebase members or a solo member.

## Core behavior

- Permanent 8-digit member IDs
- Solo or consent-based partner linking
- Separate private member workspaces
- Shared couple interaction ledger and living Guide dossier
- Sanitized middleman prompts that never expose private answers
- Serious synchronized sessions from different locations
- Custom session topics and safety intake
- 30–90 minute session limits with live timer and presence
- Gemini-powered session plans, live facilitation, accountability, homework, and private assignments
- Estimated private-practice cost equivalent at session completion

See [FIREBASE_ARCHITECTURE.md](./FIREBASE_ARCHITECTURE.md) for the privacy boundaries and data model.

## Commands

```bash
npm install
npm run check
npm run build
```

## Production

The app runs on Vercel, uses Firebase Authentication and Firestore, and invokes Gemini through Vertex AI with Vercel OIDC workload identity. No permanent Google service-account key is committed or stored in the client.

## Public-beta launch hardening

This branch adds the first reviewable implementation of the public-beta hardening program. Start with the audit and traceability matrix:

- `docs/audits/public-beta-launch-hardening-audit.md`
- `docs/public-beta-implementation-matrix.md`
- `docs/legal-privacy-safety.md`
- `docs/runbooks/incident-response.md`
- `docs/runbooks/rollback.md`

Production deployment still requires provider setup, Firebase App Check enforcement configuration, email notification provider configuration, security-rule emulator review, accessibility/browser verification, and external legal/privacy/clinical review.
