# US, FOR REAL — Firebase Relationship Architecture

## Identity and linking

Every Firebase Authentication account is provisioned with a permanent random 8-digit `memberCode`.

A new member must complete relationship setup:

- **Solo:** keeps an individual account with no couple record.
- **Partner on the app:** enters the partner's 8-digit code and creates a pending invitation.

The profiles are not linked until the invited member accepts. Acceptance atomically creates one `couples/{coupleId}` record, adds both membership records, and updates both user profiles. The two people retain independent Firebase accounts and devices.

## Data-source policy

The application starts empty. It contains no seeded relationship facts, sample scores, sample sessions, or assumed personal details.

Data is classified by source:

- `user-input`: direct information entered by a member.
- `shared-session`: content deliberately entered during a joint live session.
- `ai-generated`: Guide responses and session plans.
- `ai-derived`: temporary sanitized themes used for middleman prompts.
- `shared-metadata` / `private-metadata-only`: audit events that an interaction occurred without exposing private wording.

Direct current user input is always primary. AI-derived information is a revisable hypothesis and expires unless later supported by new activity.

## Private member space

Private content is stored under the member who created it:

- `users/{uid}/privateInteractions`
- `users/{uid}/secretAssignments`
- `users/{uid}/bridgePrompts`

The other member cannot read these collections. Firestore Security Rules restrict reads to the owning UID and all writes to trusted server APIs.

Private interactions include check-ins, reflections, game answers, individual exercises, task progress, and assignment reflections.

## Middleman behavior

The Guide may convert a useful private theme into a neutral prompt for the partner. It may not:

- quote or closely paraphrase the private response;
- identify the partner as the source;
- hint that the partner complained;
- reveal a private assignment;
- encourage surveillance, tests, deception, or manipulation.

Bridge prompts are stored only under the target member, carry an `ai-derived` label, and expire after 90 days. They are excluded from the shared couple dossier.

## Shared couple space

Shared couple data lives below `couples/{coupleId}`:

- `members`
- `liveSessions`
- `goals`
- `agreements`
- `interactionLedger`
- `guide/dossier`

The interaction ledger records deliberate in-app activity and sanitized metadata. The application does not collect unrelated device activity, background location, contacts, messages, browsing, or other surveillance data.

## Live remote sessions

A live session can last 30, 45, 60, 75, or 90 minutes. Both members can join from different locations.

`couples/{coupleId}/liveSessions/{sessionId}` stores:

- custom or selected topic;
- scenario and desired outcome;
- emotional intensity and safety intake;
- synchronized participant readiness;
- structured Guide plan;
- session phase and resolution status;
- start/end time and duration ceiling;
- educational therapy-cost estimate.

Subcollections:

- `turns`: shared member and Guide turns;
- `presence`: last-seen state and current module;
- `sharedHomework`: activities both people may view.

The timer begins when both members are ready. The client sends a presence heartbeat every 15 seconds during an active session.

## Guide context order

The Guide evaluates context in this order:

1. current topic and current direct input;
2. current shared-session turns;
3. relevant direct shared intake;
4. recent shared-session evidence, active goals, and agreements;
5. the current user's own private context;
6. sanitized prompts specifically addressed to the current user.

Historical context informs safety, patterns, relevance, and follow-up. It does not predetermine the answer to the current issue.

## Accountability and resolution

The Guide is instructed to be fair without forcing equal blame. When direct evidence supports it, the Guide should respectfully say that an approach is unfair, controlling, deceptive, dismissive, unsafe, or unreasonable, explain why, distinguish intention from impact, and offer a better alternative.

A valid session conclusion can be:

- resolved;
- partially resolved;
- paused with a concrete next step;
- redirected to safety or outside professional support.

The Guide must never invent agreement merely to report a resolution.

## Session completion

At completion, the Guide generates:

- honest resolution status and summary;
- unresolved items;
- fairness/accountability notes;
- shared homework;
- one private assignment for each member;
- a neutral future observation question for the other member;
- follow-up topic;
- estimated private-practice cost equivalent.

The default educational rate range is configurable through Vercel environment variables and currently uses $150–$400 per hour. This display is an estimate, not a charge or claim that the application provided licensed therapy.

## Living Guide dossier

`couples/{coupleId}/guide/dossier` contains Markdown and structured JSON. It includes only:

- direct shared couple intake;
- active user-entered goals and agreements;
- completed shared-session evidence;
- sanitized interaction metadata.

It excludes:

- private raw answers;
- secret assignments;
- partner bridge prompts;
- empty placeholder fields;
- stale demo content;
- unsupported AI assumptions.

## Infrastructure

- Firebase Authentication: passwordless email-link accounts.
- Cloud Firestore: identity, private member records, shared couple records, and real-time sessions.
- Vercel Functions: trusted account transactions and Guide endpoints.
- Google Vertex AI: Gemini session planning, live facilitation, private coaching, and completion summaries.
- Google authentication: Vercel OIDC workload identity; no permanent service-account key is stored.
