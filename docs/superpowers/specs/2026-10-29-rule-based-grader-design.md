# Rule-based grader — design

Date: 2026-10-29
Status: approved in brainstorming, awaiting spec review

## Goal

Replace the keyword-counting `MockAIProvider.gradeAnswers` with a deterministic, rule-based grader whose scores come close to what an LLM grader would give, with zero API cost. "Close" is defined by a labelled benchmark checked in CI (see Benchmark).

## Constraints

- No paid APIs and no new runtime dependencies. Plain TypeScript.
- The `AIProvider` interface (`src/providers/types.ts`) and all services stay unchanged.
- Deterministic: the same input always produces the same score and evidence.
- Candidate text is data. The grader only looks for concepts; instructions inside an answer cannot change a score. `detectInjection` keeps flagging separately.

## Architecture

```
src/domain/grading/            pure, deterministic, no I/O
  normalize.ts     tokenise, stem, British/American + Hinglish map, sentence split
  negation.ts      marks tokens inside a negation span
  lexicon.ts       shared synonym groups (inform≈tell≈call≈report …)
  concepts.ts      Concept type + matcher (synonym groups, ordered pairs, fixed phrases)
  rubrics/         one file per role family: concepts + red flags per skill
    caregiver.ts  warehouse.ts  retail.ts  driver.ts
  generic.ts       builds a rubric for unknown skills from keywords + lexicon
  quality.ts       general signals: steps, concrete detail, ownership, filler, length
  grade.ts         gradeSkill(text, rubric) → { score, evidence, trace }
src/providers/ai/rule-based.ts   RuleBasedAIProvider extends MockAIProvider; overrides gradeAnswers only
src/lib/providers.ts             default ai = RuleBasedAIProvider
tests/unit/grading/*.test.ts
tests/benchmark/                 RUBRIC.md, answers/*.json, agreement.test.ts
```

- Rubrics are selected by **skill name** (case-insensitive exact match against the template skill names), because scorecards store skill names, not the role family. Any unmatched skill, including renamed template skills and custom-role skills, uses `generic.ts`.
- `grade.ts` returns a `trace` (concepts and red flags that fired, quality adjustments). The provider drops it before returning `SkillGrade`; tests and tuning use it.
- `RuleBasedAIProvider`: `model = "rules"`, `promptVersion = "rules-v1"`. Scorecard generation, job ads and resume parsing are inherited from the mock unchanged.

## Scoring one skill

Input: the concatenated answers to every question whose `skillNames` include the skill, each answer truncated to 4,000 characters.

1. **Normalise.** Sentences, lowercase tokens, light suffix stemming, spelling and Hinglish variants mapped to canonical forms (e.g. "organise"→"organize", "tell to madam"→"tell supervisor", "take him to hospital"→"hospital").
2. **Concept matching.** A concept has `id`, `weight` (1 basic, 2 key) and one or more patterns:
   - `any`: a synonym group; matches if any member appears.
   - `pair`: two groups in order within 6 tokens.
   - `phrase`: fixed token sequence (e.g. `first aid`, `108`).
   Each concept counts at most once per skill. A match inside a negation span does not count, unless the concept is marked `invertsUnderNegation`, in which case only the negated form counts (e.g. "I would not move her" credits *do not move an injured person*).
   Negation span: from a negator (`not`, `never`, `no`, `don't`, `won't`, `wouldn't`, `shouldn't`, `can't`, `without`, `avoid`) to the end of the clause (comma, `but`, `and then`, sentence end), at most 6 tokens.
3. **Red flags.** Concepts describing unsafe or disrespectful actions (force medicine, leave client alone, move an injured person immediately, skip the scan, argue with customer, drive while on phone, …). A negated red flag does not fire. Any fired red flag caps the skill score at 1, and its sentence is never quoted as evidence.
4. **Anti-stuffing.** A concept only counts in a sentence containing a verb or action pattern (from a closed verb list in `lexicon.ts`), and each sentence contributes at most 2 concepts.
5. **Quality modifier** (clamped to [−1, +1]):
   - +0.5 clear steps (≥2 sequence markers such as first/then/after/next/finally, or a numbered list)
   - +0.5 concrete detail (a time, quantity, number, or ≥2 distinct specific action verbs)
   - +0.25 ownership ("I would / I will / I'd / I")
   - −0.5 vague filler (filler phrases such as "handle it properly" in a sentence with no concept)
   - −1 answer text under 8 words
6. **Score.**
   `raw = Σ matched concept weights / rubric.strongWeight` (strongWeight per skill ≈ 60% of its total concept weight)
   `score = clamp(round(4 × min(raw, 1) + quality), 0, 4)`; zero matched concepts → 0; red-flag cap applied last.
7. **Evidence.** Up to 2 sentences ordered by matched concept weight desc, then position; red-flag sentences excluded.

All numbers (6-token window, 60%, quality values) are starting points tuned **only on the tune split**.

## Generic rubric (custom roles)

For a skill with no rubric, each keyword becomes a weight-1 concept whose synonym group is the keyword plus its `lexicon.ts` group (if any). Generic action concepts (inform/escalate, check/verify, stay calm, follow up) are added at weight 1. `strongWeight` = 60% of total. Quality signals and anti-stuffing apply unchanged; no red flags.

## Benchmark

- `tests/benchmark/RUBRIC.md` defines the 0–4 scale for all skills — 0 nothing relevant or harmful; 1 touches it vaguely; 2 one correct action; 3 several correct actions in a sensible order; 4 complete, specific, safe, and checks back afterwards — plus each family's key points for 3–4.
- `tests/benchmark/answers/{caregiver,warehouse,retail,driver}.json`: 30 answers each (120 total, ≈340 skill labels). `generic.json`: ≈20 answers for a non-template role ("Kitchen helper") with its own scorecard defined in the file.
- Entry shape:
  ```json
  { "id": "cg-017", "split": "tune", "questionIndex": 0,
    "answer": "…",
    "labels": { "Patient care & dignity": 3, "Medication & routines": 2 },
    "tags": ["paraphrase", "negation"] }
  ```
- Tags: `strong`, `average`, `weak`, `paraphrase`, `negation`, `unsafe`, `stuffing`, `vague`, `short`, `hinglish`, `off-topic`. Split ≈75/25, fixed in the file, with every family and tag present in the holdout split.
- Labels are written against `RUBRIC.md` **before** any rubric file exists. Holdout answers are written in one pass before tuning and never edited afterwards.
- `tests/benchmark/agreement.test.ts` runs in `npm test`, prints a per-family/per-tag report including the `MockAIProvider` baseline, and fails if any threshold is missed:

| Metric | Tune | Holdout | Generic |
|---|---|---|---|
| Within ±1 of label | ≥ 85% | ≥ 85% | ≥ 75% |
| Exact match | ≥ 60% | ≥ 55% | ≥ 45% |
| `unsafe`: score on the tagged safety skill ≤ 1 | 100% | 100% | — |
| `stuffing`: all labelled skills ≤ 1 | 100% | 100% | — |
| Spearman rank correlation | ≥ 0.75 | ≥ 0.70 | ≥ 0.60 |

For `unsafe` entries, the entry names its safety skill in a `safetySkill` field.

Known limitation: the same author writes labels and rules; the holdout split is the overfitting check. A later independent re-label of ~30 holdout answers would measure label reliability.

## Integration

- Default `ai` provider becomes `RuleBasedAIProvider`. `MockAIProvider` is kept and still unit-tested.
- Existing evaluations are not re-scored and keep `model: "mock-ai"`.
- `npm run seed` re-grades demo applicants; verify the demo shortlist order is still sensible.

## Errors and edge cases

- Empty or <8-word answers: score 0–1, no evidence, no throw.
- A skill with no linked question: score 0, no evidence.
- Answers truncated to 4,000 characters each; grading is synchronous, target < 5 ms per applicant.

## Testing

- TDD unit tests for normalize, negation, concepts, quality, grade, generic and the provider.
- Benchmark agreement test in `npm test`.
- Existing integration and e2e tests must keep passing on the default provider; adjust fixtures that relied on mock keyword counts rather than weakening assertions.
- Done means `npm test`, `npm run build` and `npm run e2e` all pass.

## Out of scope

Ollama/local LLMs, rule-based scorecard or job-ad generation changes, re-scoring old applicants, and the rest of sub-project A (Postgres, free email provider, retention job).
