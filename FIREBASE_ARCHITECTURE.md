# US, FOR REAL — Firebase Identity, Couple Linking, and Guide Dossier

## Account model

Every Firebase Authentication account receives a permanent random 8-digit `memberCode`. This is the public number used for partner linking; it is separate from the Firebase UID and does not expose the user's email.

A new account starts in `relationshipStatus: "solo"`. The member can stay solo indefinitely or enter another member's exact code. The receiving member must accept the request before the profiles become a couple.

The acceptance operation runs inside a trusted Cloud Function transaction. It verifies that both accounts exist, neither is already linked, and the member is not linking to himself. It then creates one couple document, two membership documents, and updates both user profiles atomically.

## Main Firestore paths

```text
users/{uid}
users/{uid}/privateMemories/{memoryId}
memberDirectory/{8-digit-memberCode}
partnerInvites/{inviteId}
couples/{coupleId}
couples/{coupleId}/members/{uid}
couples/{coupleId}/sessions/{sessionId}
couples/{coupleId}/sessions/{sessionId}/messages/{messageId}
couples/{coupleId}/goals/{goalId}
couples/{coupleId}/agreements/{agreementId}
couples/{coupleId}/sharedMemories/{memoryId}
couples/{coupleId}/timeline/{eventId}
couples/{coupleId}/guide/dossier
```

## Living Couple Guide Dossier

`couples/{coupleId}/guide/dossier` stores both:

- `structured`: normalized JSON for programmatic context selection.
- `markdown`: a readable living couple formulation for the Guide prompt.

It is regenerated when the couple profile, members, sessions, goals, agreements, or shared memories change. It covers identity, anniversary, how the couple met, first date, first impressions, shared memories, strengths, values, rituals, hopes, active priorities, agreements, goals, and recent session evidence.

The Guide must treat the dossier as revisable context rather than unquestionable truth. Current direct statements override stale notes. Inferences must be labeled and checked. Private reflections are stored under the individual user and must never be copied into the shared dossier without explicit consent.

## AI context order

Before responding, load:

1. Current session module, active speaker, and recent turns
2. Safety state and whether joint facilitation is appropriate
3. Current user's profile and consented private context
4. The couple Guide dossier
5. Relevant active goals, agreements, and shared memories
6. The latest session summary and unfinished exercise

Use this context to personalize questions, examples, exercises, follow-up, and progress tracking. Never diagnose either person, reveal private material, or present an old interpretation as a settled fact.

## Firebase services

- Firebase Authentication: passwordless email link and Google sign-in
- Cloud Firestore: account, relationship, session, and dossier data
- Cloud Functions: member-code allocation, secure linking, intake updates, and dossier regeneration
- App Check: supported and recommended before public launch
- Emulator Suite: local Auth, Firestore, Functions, and Rules testing

## Activation

1. Create a dedicated Firebase project for Couple Wellness.
2. Register a Web App.
3. Enable Google sign-in and Email link sign-in.
4. Create Cloud Firestore in production mode.
5. Deploy `firestore.rules`, `firestore.indexes.json`, and `functions/` with the Firebase CLI.
6. Add these Vercel environment variables:
   - `FIREBASE_API_KEY`
   - `FIREBASE_AUTH_DOMAIN`
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_STORAGE_BUCKET`
   - `FIREBASE_MESSAGING_SENDER_ID`
   - `FIREBASE_APP_ID`
   - `FIREBASE_MEASUREMENT_ID` (optional)
   - `FIREBASE_FUNCTIONS_REGION=us-central1`
   - `FIREBASE_APP_CHECK_SITE_KEY` (recommended)
7. Redeploy Vercel.
8. Enable Function App Check enforcement with `ENFORCE_APP_CHECK=true` after App Check is configured.
