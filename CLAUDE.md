# Prompt-writing rules for this project

## The anatomy of a rule that sticks

A behavioral rule in an LLM prompt (flavor steps, ops pipeline, meme-opt
improver) is only reliable when it has ALL of:

1. **A concrete test** the model can run, not an adjective.
   ("Could the poster be this person in this moment? If yes → 'Me'" — not
   "use 'me' for generic speakers.")
2. **A wrong/right example pair** showing the exact failure and the exact fix.
   (WRONG: "Noco bathroom users after walking in for the 100th time" /
   RIGHT: "Me when the Noco bathroom hits me with its signature aroma")
3. **A line in the prompt's fail-checklist** (the ANTI-FAILURE / validation
   section the model checks before output). Prose-only rules drift; checklist
   rules stick. This has been observed repeatedly.
4. **A mechanical backstop where possible** — a code validator or a literal
   string-level rule ("if the speaker phrase is students/users + situation,
   it is ALWAYS the default"), because models rationalize around soft tests.

Why: models imitate examples over instructions, and vivid text elsewhere in
the prompt (schema placeholders, category illustrations) gets copied into
output. Corollaries:
- Never leave a copyable-looking constant in an output schema; placeholders
  must be visibly non-values ("<EXACT string copied VERBATIM from...>").
- Label in-prompt examples as illustrations that must never be copied out.
- When a rule changes, regenerate the examples that demonstrate it in the
  same edit — stale examples silently override new rules.

## Exemplars in this repo

- `scripts/meme-opt/pins/ukulele-apology-GOOD.json` — the reference shape for
  a rich recognize-content JSON (form-rich, content-generic).
- Flavor 1517 steps S3–S5 (in the DB) — rules built to this anatomy.
- `scripts/meme-opt/improve.mjs` — mechanical validators (n-gram
  caption-overlap, growth caps, topics-field ban) enforcing what prose can't.

## Editing discipline

One hypothesis per change. The smallest edit that tests it. Revise or delete
a rule that caused a problem rather than appending a contradicting one.
Golden-test new validators against known-good artifacts before trusting them.
