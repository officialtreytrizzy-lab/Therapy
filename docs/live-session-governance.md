# Live-session reliability and governance

This document describes the intended reliability model and, explicitly, which parts
are enforced in code today versus still planned. It must not overstate protections.

## Meaningful states

- **Modules:** intake, readiness, facts, perspective-a, perspective-b, cycle,
  accountability, repair, follow-up, completion.
- **Presence states:** online, backgrounded, reconnecting, stale, left, refused, ended.
  (Presence is written by `heartbeatLiveSession`; only `online`/`away` are produced by
  the current client. The richer state set is aspirational until the client emits it.)

## Enforced today

- **Idempotent completion.** `completeSession` atomically claims the session
  (`status: 'completing'`) in a transaction. A second call — including a client retry
  after a failed `refreshGuideDossier` — returns the already-persisted resolution,
  homework, and cost estimate instead of regenerating them. All completion writes use
  **deterministic document IDs** (`<sessionId>_hw_<n>`, `session_<sessionId>`,
  `obs_<sessionId>_<uid>`, `complete_<sessionId>`) so retries merge rather than
  duplicate homework, secret assignments, bridge prompts, and ledger entries.
- **No writes to completed sessions.** `respond` refuses turns once a session is
  `completed`.
- **Owner departure does not delete shared history.** Unlink severs the live link and
  retains shared records; shared-history deletion requires both members to confirm.
- **Structured-output validation.** Every Guide response (plan, respond, privateCoach,
  completeSession) is validated against a strict schema before persistence; malformed
  or hallucinated payloads fall back to the deterministic structured fallback.
- **Rate limiting.** plan/respond/privateCoach/completeSession are per-user rate limited.

## Planned / not yet enforced

- **Writer leases.** Duplicate tabs are not yet constrained to a single active writer
  lease per member. Idempotent, deterministic writes reduce the blast radius, but a
  formal lease is still to be built.
- **Rich reconnection state machine.** The presence states above are not all emitted
  or acted upon yet.
- **Mutual extension of session duration.** Duration is fixed at creation; a mutual
  consent extension flow is not implemented.
- **In-session safety conversion.** The Guide prompt instructs safety-first handling,
  and private safety flags suppress partner-facing bridge prompts, but automatic
  conversion of a joint session into separate safety guidance is not yet a server
  state transition.

Keep this list in sync with `api/guide.js`. Do not describe a planned control as if it
were enforced.
