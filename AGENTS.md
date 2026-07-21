# Repository agent notes

- Preserve the keyless Firebase/Vercel architecture: server access uses Vercel OIDC and Google workload identity; do not add service-account JSON keys.
- Treat relationship text as sensitive. Do not log private answers, session messages, prompts, scenarios, reflections, or dossier free text in normal logs.
- Keep private owner-only records under `users/{uid}` subcollections and shared couple records under `couples/{coupleId}`. Raw private answers must never enter partner-visible UI, shared dossier fields, or shared logs.
- Public-beta legal, privacy, safety, clinical, and compliance surfaces require external professional review before launch claims.
