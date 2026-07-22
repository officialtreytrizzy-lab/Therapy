# The Real Loop: Product and AI Strategy

## Product position

US, FOR REAL should be positioned as a **relationship-wellness and guided self-help platform**, not as an autonomous therapist, psychotherapy service, diagnostic system, or substitute for licensed care.

The product serves two equal member states:

1. **Solo member in a relationship**: the member can use the complete product even when the other person has no account or does not want to participate.
2. **Linked couple**: each person retains an individual account and private workspace, while the app adds synchronized shared sessions and mutually visible records.

A partner connection adds collaboration. It must never unlock the basic ability to receive structured support.

## Market gap

The current relationship-app category is crowded with:

- daily questions and answer reveals;
- quizzes, games, date ideas, reminders, and milestones;
- generalized content journeys;
- journaling and conversational coaching;
- scores that summarize connection without clearly showing how the score was produced.

These features can improve engagement, but they rarely close the loop between a real conflict and a verified behavioral result. The defining opportunity is to become the app that does not merely help people talk. It helps them **test what will actually change the relationship**.

## Defining mechanism: The Real Loop

**The Real Loop** is a closed-loop relationship change engine:

> Regulate → Establish evidence → Hold another possible truth → Choose one controllable action → Test it in real life → Verify the result → Update the relationship model

This loop should power serious sessions, the Conflict Calibrator, private check-ins, goals, commitments, and follow-up.

### 1. Regulate

Before analysis, the member rates emotional intensity and completes a short readiness check.

- Low or moderate activation: continue.
- High activation: use a grounding pause before drafting messages or confronting the other person.
- Fear, coercion, threats, stalking, or violence: stop ordinary joint-work recommendations and move to a safety-oriented path.

The product should never treat “finishing the session” as more important than safety.

### 2. Establish evidence

Separate the issue into four clearly labeled columns:

- **Camera facts**: observable events a neutral witness, message, or recording could confirm.
- **Impact**: what the event affected for the member.
- **Interpretation**: the meaning the member assigned to it.
- **Unknowns**: facts that require direct clarification rather than AI inference.

This protects the Guide from turning a user’s fear, assumption, or accusation into a stored relationship fact.

### 3. Hold another possible truth

The system challenges one-sided certainty without forcing false equal blame.

For a solo member:

- the member states the strongest evidence for their position;
- the member states the strongest plausible alternative explanation;
- the Guide labels every absent-person perspective as a **hypothesis**;
- the Guide identifies what evidence would confirm or disprove the hypothesis.

For linked members:

- both members answer privately;
- the system produces an **Overlap Map** of independently shared facts and needs;
- the system produces a **Difference Map** of unresolved interpretations;
- raw private wording is never exposed unless the author explicitly shares it.

Holding another possible truth does not excuse abuse, coercion, deception, privacy violations, or clearly unfair conduct.

### 4. Choose one controllable action

Every serious session ends with one small action under the member’s control, such as:

- one direct request;
- one boundary stated in observable terms;
- one repair attempt;
- one listening behavior;
- one decision deadline;
- one pause rule;
- one specific act of follow-through.

The action must include:

- who will do it;
- what observable behavior counts;
- when it will occur;
- what outcome is expected;
- what would make the action unsafe or inappropriate.

### 5. Test it in real life

The app creates a 24-hour, 72-hour, or seven-day **relationship experiment** rather than treating advice as a conclusion.

Example:

- Prediction: “If I ask directly without accusing them of a motive, they will still avoid the conversation.”
- Action: “At 7:00 PM, I will make one concrete request and give them ten uninterrupted minutes to answer.”
- Evidence window: 72 hours.

### 6. Verify the result

At follow-up, the app asks what actually happened.

Solo mode:

- Did the member complete the action?
- What observable response occurred?
- Which original prediction was supported, weakened, or still unknown?

Linked mode:

- Each member reports privately.
- A result becomes shared evidence only when both directly confirm it or explicitly agree to share it.
- Disagreement remains disagreement. The app does not fabricate consensus.

### 7. Update the relationship model

The Guide’s relationship model should be an auditable **Evidence Graph**, not a mysterious personality profile.

Every stored belief must include:

- source: direct user input, mutually confirmed input, shared session, or AI-derived hypothesis;
- visibility: owner-only or shared;
- confidence;
- created date;
- last confirmed date;
- expiration date for AI-derived beliefs;
- correction and removal controls.

Direct current statements override older summaries. Unsupported AI inferences expire automatically.

## Solo and linked pipeline parity

| Capability | Solo member | Linked couple |
|---|---|---|
| Dashboard and all navigation | Full access | Full access |
| Private check-ins | Owner-only | Owner-only |
| Conflict Calibrator | Owner-only | Owner-only |
| Serious guided sessions | Owner-only cloud session | Private or shared synchronized session |
| Exercises and games | Individual completion | Individual completion with optional shared version |
| Goals | Personal relationship goals | Personal or shared goals |
| Commitments | Personal boundaries and commitments | Personal or mutually accepted agreements |
| Appreciations | Save, prepare, or share outside the app | Save privately or send in the shared space |
| Progress | Personal behavior and follow-through | Personal evidence plus mutually confirmed shared evidence |
| Guide model | Personal intake and owner-only evidence | Separate private models plus an approved shared dossier |

## AI architecture

### Structured orchestration, not open-ended chat

The large language model should not control the workflow. Application code controls:

- session phases;
- privacy scope;
- consent gates;
- safety branches;
- allowed output schema;
- evidence provenance;
- expiration rules;
- human-resource handoff;
- completion criteria.

The model performs bounded tasks such as reflection, question selection, explanation, alternative-hypothesis generation, and summarization.

### Multi-pass output checks

Use separate passes for:

1. **Facilitation**: generate the next response.
2. **Fairness audit**: detect unsupported equal-blame framing, mind-reading, controlling advice, or failure to name directly evidenced unfairness.
3. **Privacy audit**: prevent leakage of owner-only wording or attribution.
4. **Safety audit**: detect whether ordinary relationship exercises should stop.
5. **Schema validation**: reject malformed or incomplete output and use a deterministic safe fallback.

### No hidden emotional surveillance

Do not infer emotion or mental state from camera, microphone, typing cadence, location, contacts, or unrelated device behavior. Emotional intensity should be directly entered by the user.

### Retrieval boundaries

- Solo sessions retrieve only the owner’s permitted data.
- Shared sessions retrieve shared evidence plus the current member’s own private context.
- One member’s raw private context is never placed into another member’s model prompt.
- Sanitized prompts require explicit consent and must remain useful without revealing their source.

## Safety design

The product should distinguish:

- ordinary disagreement;
- elevated emotional activation;
- intimidation or coercive control;
- threats, stalking, physical violence, or sexual violence;
- self-harm or harm-to-others risk;
- emergencies.

A high-risk signal should trigger an empowerment-oriented bridge:

- acknowledge the immediate concern;
- ask whether it is safe to continue using the device;
- avoid advising confrontation;
- offer fast access to trusted people and appropriate emergency or crisis resources;
- provide an unobtrusive exit;
- avoid sending partner notifications about the safety disclosure.

Safety systems require continuous review using real deployment data, red-team tests, clinician review, false-negative monitoring, and documented incident response.

## Privacy as a core product advantage

Relationship content must never be used for advertising targeting. Avoid third-party advertising SDKs and unnecessary analytics inside private or shared relationship surfaces.

Recommended guarantees:

- owner-only data remains owner-only after partner linking;
- no private answer is revealed through a quote, close paraphrase, notification, model summary, or attribution;
- users can inspect, correct, export, and delete what the Guide stores;
- AI-derived beliefs expire unless confirmed;
- sensitive logs are redacted;
- consent for AI and private-to-prompt influence is specific and revocable.

## What can and cannot be guaranteed

No responsible relationship or mental-health product can guarantee that a relationship will improve, remain together, or reach a specific clinical outcome.

The product can guarantee process properties:

- equal solo and linked access;
- clear privacy boundaries;
- no fabricated agreement;
- no absent-partner mind-reading;
- visible evidence and provenance;
- deterministic safety fallbacks;
- measurable follow-up;
- correction, export, and deletion controls.

Outcome claims must be earned through prospective evaluation.

## Validation program

### Phase 1: safety and usability pilot

Recruit solo members and linked couples separately. Measure:

- session completion;
- time to useful next step;
- usability;
- perceived fairness;
- privacy comprehension;
- harmful or inappropriate output rate;
- crisis-routing accuracy;
- dropout and deletion behavior.

### Phase 2: randomized product test

Compare The Real Loop against a journaling or daily-question control.

Primary product outcomes:

- conflict recovery time;
- demand-withdraw behavior;
- relationship confidence around the selected issue;
- completion of the chosen behavior experiment;
- proportion of assumptions corrected by direct evidence.

Secondary outcomes:

- relationship satisfaction;
- communication quality;
- individual well-being;
- engagement and retention;
- adverse events.

### Phase 3: long-term effectiveness

Evaluate whether improvements persist and whether the system works across:

- different relationship stages;
- long-distance and co-located relationships;
- different cultural contexts;
- solo and linked use;
- accessibility needs;
- varying conflict intensity.

Pre-register hypotheses and analysis, publish negative as well as positive findings, and maintain independent clinical and safety review.

## Legal positioning

Illinois Public Act 104-0054, effective August 1, 2025, restricts entities from providing or advertising therapy or psychotherapy services through internet-based AI unless the services are conducted by a licensed professional, and it places additional restrictions on AI interaction in licensed therapy.

Before public launch, counsel should review:

- product naming and marketing claims;
- whether any feature could be characterized as therapeutic communication;
- AI disclosure and consent language;
- state-by-state professional-practice laws;
- crisis and mandated-reporting obligations;
- health-data privacy and consumer-protection requirements;
- clinical-evidence claims.

The safer current posture is educational relationship wellness, structured self-reflection, communication support, and guided self-help, with clear limitations and human referrals.

## Research basis reviewed

- WHO, *Towards responsible AI for mental health and well-being* (2026).
- WHO, *Psychological self-help interventions* implementation manual (2026).
- WHO, *Ethics and governance of artificial intelligence for health*.
- *The efficacy, feasibility, and technical outcomes of a GPT-4o-based chatbot Amanda for relationship support: A randomized controlled trial* (258 participants).
- *Efficacy of a Conversational AI Agent for Psychiatric Symptoms and Digital Therapeutic Alliance: A Randomized Clinical Trial* (995 participants, JAMA Network Open, 2026).
- *Increasing engagement with cognitive-behavioral therapy using generative AI: a randomized controlled trial* (540 participants).
- *Effectiveness of a Fully Automated Mobile Therapeutic Versus a General Chatbot* (2026 feasibility RCT).
- FTC enforcement concerning BetterHelp’s disclosure of sensitive health information for advertising.
- Current product patterns from Paired, Relish, and Wysa.
- Illinois Public Act 104-0054.
