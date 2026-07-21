# US, FOR REAL — Firebase Identity, Couple Linking, and Guide Dossier

## Production services

- Firebase project: `us-for-real-therapy`
- Firebase Authentication: passwordless email-link sign-in
- Cloud Firestore: account, couple, progress, and dossier records
- Vercel project: `couple-wellness`
- Production URL: `https://couple-wellness.vercel.app`
- Trusted server operations: Vercel Function `/api/firebase-account`
- Google authorization: Vercel OIDC workload-identity federation; no service-account private key is stored

The Firebase project remains on the Spark plan. Billing-dependent Firebase Cloud Functions are not required for the account and relationship system.

## Account model

Every Firebase Authentication account receives a permanent random 8-digit `memberCode`. This is the public number used for partner linking. It is separate from the Firebase UID and does not expose the member's email.

A new account starts with `relationshipStatus: "solo"`. A member can stay solo indefinitely or enter another member's exact 8-digit code. The receiving member must accept the request before the profiles become a couple.

The acceptance operation runs inside a trusted Firestore transaction. It verifies that both accounts exist, neither account is already linked, and a member is not linking to himself. It then creates one couple document, two membership documents, updates both profiles, and closes the invite atomically.

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

The `memberDirectory` collection is server-only. Firestore rules prevent clients from searching it or resolving a code to a Firebase UID.

## Living Couple Guide Dossier

`couples/{coupleId}/guide/dossier` stores:

- `structured`: normalized JSON for context selection and programmatic checks.
- `markdown`: a readable living couple formulation for the Guide prompt.

The dossier covers:

- member names and anniversary
- where and how the couple met
- first date and first impressions
- favorite memories
- strengths, shared values, rituals, and hopes
- current relationship priorities
- active goals and agreements
- recent shared memories
- recent session summaries, progress signals, and concerns

The browser client watches the app's relationship state. When shared sessions, goals, agreements, or shared memories change, it sends a bounded, sanitized snapshot to the trusted Vercel endpoint. The endpoint replaces the corresponding couple subcollections and immediately regenerates the dossier. Private coaching sessions and private memories are excluded from this shared sync.

## Guide context rules

Before generating a relationship response, the Guide should load context in this order:

1. Current lesson module, active speaker, and recent direct turns
2. Safety state and whether joint facilitation is appropriate
3. Current user's personal intake and explicitly consented private context
4. The living Couple Guide Dossier
5. Relevant active goals, agreements, shared memories, and recent session evidence
6. The unfinished exercise or agreed next step

The Guide must:

- treat the dossier as revisable evidence, not unquestionable truth
- let current direct statements override stale notes
- label and verify inferences
- never reveal one partner's private reflection to the other
- avoid diagnosis and mind-reading
- preserve equal dignity without forcing equal responsibility
- use progress and setback history without shaming either partner

## Trusted server actions

`POST /api/firebase-account` accepts a verified Firebase ID token and one of these actions:

- `provisionProfile`
- `requestPartnerLink`
- `listPendingInvites`
- `respondToPartnerInvite`
- `savePersonalIntake`
- `saveCoupleIntake`
- `syncRelationshipState`
- `getGuideContext`

Firebase ID tokens are verified with Google's rotating Secure Token certificates using Node's built-in RSA verifier. Firestore server access uses short-lived Google credentials exchanged from Vercel's signed OIDC token.

## Security boundaries

- No Firebase Admin private key is committed or stored in Vercel.
- Google workload identity is restricted to the exact Vercel production principal:
  `owner:v-ideo-e-dit:project:couple-wellness:environment:production`
- Only the two linked UIDs can read a couple's shared data.
- Private memories remain owner-only.
- Partner-link requests require explicit acceptance.
- Public web configuration contains only Firebase's normal browser-safe identifiers.
- Firestore rules and indexes are deployed from `firestore.rules` and `firestore.indexes.json`.

## Local verification

```bash
npm install
npm run check
npx firebase-tools deploy --only firestore:rules,firestore:indexes --project us-for-real-therapy
vercel --prod
```

The production end-to-end test verified two real temporary Firebase users, permanent member IDs, invite delivery, acceptance, atomic couple creation, intake storage, relationship-state synchronization, and dossier retrieval. Temporary Auth and Firestore records were deleted after the test.
