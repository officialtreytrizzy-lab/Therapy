# AI model and prompt change checklist

Use for every model, system-prompt, schema, safety-rule, context-selection, or repair-flow change.

- [ ] State the user-facing purpose and the exact behavior being changed.
- [ ] Identify private, shared, and metadata inputs; prove private raw answers cannot leak into partner/shared output.
- [ ] Re-test coercion, stalking, immediate danger, self-harm, intoxication, forced disclosure, blame assignment, and absent-partner scenarios.
- [ ] Verify the model does not diagnose, certify safety, decide who is truthful, or present itself as a licensed professional.
- [ ] Verify malformed, blocked, empty, quota, timeout, and transport responses fail safely.
- [ ] Validate every structured response against the product schema.
- [ ] Review whether generated text is stored, where it is stored, and which deletion path removes it.
- [ ] Compare behavior across solo and linked workspaces.
- [ ] Run unit and mocked provider-failure tests.
- [ ] Complete a licensed clinical-safety review when the change affects crisis, coercion, escalation, or wellness guidance.
- [ ] Record model name, location, prompt version, reviewer, test evidence, deployment, and rollback point.
