# Rule-based Grader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace keyword counting in `gradeAnswers` with a deterministic concept-rubric grader that agrees with a hand-labelled benchmark at near-LLM level, at zero API cost.

**Architecture:** Pure modules under `src/domain/grading/` (normalise → negation → concept matching → quality → score) plus per-family rubrics and a generic rubric builder. A `RuleBasedAIProvider` extends `MockAIProvider` and overrides only `gradeAnswers`. A labelled benchmark under `tests/benchmark/` gates agreement in `npm test`.

**Tech Stack:** TypeScript, Next.js 15 app, Vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-29-rule-based-grader-design.md`

## Global Constraints

- No paid APIs, no new runtime or dev dependencies.
- `AIProvider` interface in `src/providers/types.ts` unchanged; services unchanged.
- Deterministic: same input → same score and evidence.
- `model = "rules"`, `promptVersion = "rules-v1"`.
- Each answer truncated to 4,000 characters before matching.
- Pair-pattern window: 6 tokens. Negation span: up to 6 tokens, ends at comma, `but`, `and then`, or sentence end.
- `strongWeight` ≈ 60% of a skill's total concept weight.
- Quality: +0.5 steps, +0.5 concrete detail, +0.25 ownership, −0.5 vague filler, −1 under 8 words; total clamped to [−1, +1].
- `score = clamp(round(4 × min(raw, 1) + quality), 0, 4)`; zero concepts → 0; any red flag → cap 1 (applied last).
- Evidence: ≤ 2 sentences, never a red-flag sentence.
- Benchmark thresholds are exactly those in the spec table; tune only on `split: "tune"`. Holdout entries are never edited after Task 6.
- Imports use the `@/` alias; tests use `import { describe, it, expect } from "vitest"`.

## Review Focus

1. **Curly apostrophes from phone keyboards** (`don’t`, `won’t`): negation must treat `’` like `'`. Test added in Task 2.
2. **One long unpunctuated message** (WhatsApp style, 60+ words, no full stops): a hard 2-concepts-per-sentence cap would wreck it. Cap is `max(2, floor(tokens / 10))` per sentence, and evidence is truncated to 240 chars. Tests in Task 3 and Task 5.
3. **Answers in Devanagari or other non-Latin script:** return score 0 with no evidence and don't throw. Test in Task 5.
4. **The same sentence pasted many times:** concepts count once, so the score doesn't inflate. Test in Task 5.
5. **"Reliability" exists in all four families, and recruiters rename skills:** pick the family by majority of exact skill-name matches across the whole scorecard; anything else falls back to generic. Tests in Task 8.

---

### Task 1: Normaliser

**Files:**
- Create: `src/domain/grading/normalize.ts`
- Test: `tests/unit/grading/normalize.test.ts`

**Interfaces:**
- Produces:
  - `type Token = { text: string; stem: string }`
  - `type Sentence = { raw: string; tokens: Token[]; position: number }`
  - `stem(word: string): string`
  - `normalizeText(text: string): string`: lowercases, turns `’`/`‘` into `'`, applies `SPELLING` and `PHRASE_MAP`
  - `splitSentences(text: string): Sentence[]`: `raw` is the original sentence text (for evidence); tokens come from `normalizeText(raw)`

- [ ] **Step 1: Write failing tests**

```ts
expect(stem("medicines")).toBe(stem("medicine"));
expect(stem("calling")).toBe("call");
expect(stem("called")).toBe("call");
expect(stem("told")).toBe("tell");        // irregular map
expect(stem("gave")).toBe("give");
expect(stem("is")).toBe("is");            // words ≤ 3 chars untouched
expect(normalizeText("I will Organise")).toBe("i will organize");
expect(normalizeText("will tell to madam")).toContain("tell supervisor");
expect(normalizeText("don’t")).toBe("don't");
const s = splitSentences("First I stay calm. Then I call 108!\nDone");
expect(s.map((x) => x.raw)).toEqual(["First I stay calm.", "Then I call 108!", "Done"]);
expect(s[1].tokens.map((t) => t.text)).toEqual(["then", "i", "call", "108"]);
expect(splitSentences("")).toEqual([]);
```

- [ ] **Step 2: Run** `npx vitest run tests/unit/grading/normalize.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement.** Stemmer: an irregular map first (`told→tell, gave→give, kept→keep, took→take, brought→bring, went→go, spoke→speak, bought→buy, felt→feel, left→leave, came→come`), then strip one suffix in order `ing, ed, es, s, ly`, but only if at least 3 chars remain. Collapse a doubled final consonant after stripping (`stopped→stop`). `SPELLING` covers British→American pairs (`organise, prioritise, apologise, colour, behaviour, licence, centre`). `PHRASE_MAP` covers `madam|sir|boss|in-charge|in charge|incharge → supervisor`, `tell to → tell`, `doctor sahab|doctor sir → doctor`, and strips `ji` and `only` as standalone filler. Split sentences on `.`, `!`, `?` and newlines. Tokens are `[a-z0-9']+`.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(grading): text normaliser`

### Task 2: Negation

**Files:**
- Create: `src/domain/grading/negation.ts`
- Test: `tests/unit/grading/negation.test.ts`

**Interfaces:**
- Consumes: `Token`, `splitSentences` (Task 1).
- Produces: `markNegated(tokens: Token[], raw: string): boolean[]`, the same length as `tokens`. `true` means the token is inside a negation span. The negator itself is `false`. `raw` is used to find comma boundaries.

- [ ] **Step 1: Write failing tests**

```ts
const neg = (t: string) => { const [s] = splitSentences(t); return s.tokens.filter((_, i) => markNegated(s.tokens, s.raw)[i]).map((x) => x.text); };
expect(neg("I would never force the medicine")).toEqual(["force", "the", "medicine"]);
expect(neg("I won’t move her, I call 108")).toEqual(["move", "her"]);          // curly apostrophe, comma ends span
expect(neg("I don't argue but I listen")).toEqual(["argue"]);
expect(neg("Without checking the label I would not pack it and then I report")).toContain("checking");
expect(neg("I call the supervisor")).toEqual([]);
expect(neg("not a b c d e f g h")).toEqual(["a", "b", "c", "d", "e", "f"]);    // 6-token cap
```

- [ ] **Step 2: Run** `npx vitest run tests/unit/grading/negation.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Negators: `not, never, no, don't, dont, won't, wont, wouldn't, shouldn't, can't, cant, cannot, without, avoid, nahi, nahin`. A span ends at the first of: 6 tokens, a comma in `raw` after the token, the token `but`, the pair `and then`, or the end of the sentence. Find comma positions by walking `raw` and counting tokens.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(grading): negation spans`

### Task 3: Lexicon and concept matcher

**Files:**
- Create: `src/domain/grading/lexicon.ts`, `src/domain/grading/concepts.ts`
- Test: `tests/unit/grading/concepts.test.ts`

**Interfaces:**
- Consumes: Tasks 1–2.
- Produces:
  - `lexicon.ts`: `SYNONYMS: Record<string, string[]>` (group id → words or multi-word phrases); `ACTION_VERBS: ReadonlySet<string>` (stems); `SEQUENCE_MARKERS: string[]`; `FILLER_PHRASES: string[]`; `expand(word: string): string[]`, which resolves `@group` references to group members and otherwise returns `[word]`.
  - `concepts.ts`:
    ```ts
    type Pattern = { any: string[] } | { pair: [string[], string[]]; window?: number } | { phrase: string };
    type Concept = { id: string; weight: 1 | 2; patterns: Pattern[]; invertsUnderNegation?: boolean };
    type ConceptHit = { conceptId: string; weight: number; sentence: number };
    matchConcepts(sentences: Sentence[], concepts: Concept[]): ConceptHit[]
    ```
    Pattern words may be `@group` references. Matching compares stems, so multi-word entries match as consecutive stems. `pair` uses order `[A, B]` with B starting within `window` (default 6) tokens after A.

- [ ] **Step 1: Write failing tests**

```ts
const C = (id: string, weight: 1 | 2, patterns: Pattern[], inv = false): Concept => ({ id, weight, patterns, invertsUnderNegation: inv });
const escalate = C("escalate", 2, [{ pair: [["@inform"], ["supervisor", "doctor", "family"]] }]);
const calm = C("calm", 1, [{ any: ["calm", "gently", "patient"] }]);
const noMove = C("no-move", 2, [{ any: ["move", "lift"] }], true);
const hits = (t: string, cs: Concept[]) => matchConcepts(splitSentences(t), cs).map((h) => h.conceptId);

expect(hits("I will tell the supervisor at once", [escalate])).toEqual(["escalate"]);
expect(hits("I will inform the head nurse and then the doctor", [escalate])).toEqual(["escalate"]);
expect(hits("supervisor, then I tell", [escalate])).toEqual([]);                  // order matters
expect(hits("I would not tell the doctor", [escalate])).toEqual([]);              // negated
expect(hits("I would not move her", [noMove])).toEqual(["no-move"]);              // inverted
expect(hits("I move her to the bed", [noMove])).toEqual([]);
expect(hits("I stay calm. I stay calm. I stay calm.", [calm])).toHaveLength(1);   // once per skill
expect(hits("calm gently patient", [calm])).toEqual([]);                          // no action verb
// per-sentence cap: max(2, floor(tokens/10)), highest weight first
const many = ["a1","a2","a3","a4"].map((w, i) => C(w, i === 0 ? 2 : 1, [{ any: [w] }]));
expect(hits("I check a1 and then a2 and later a3 and also a4 carefully today", many)).toEqual(["a1", "a2"]);
// a dense list (≥4 concepts matched and ≥40% of tokens are concept words) contributes at most 1
expect(hits("I show a1, a2, a3, a4 always", many)).toEqual(["a1"]);
```

- [ ] **Step 2: Run** `npx vitest run tests/unit/grading/concepts.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** The lexicon has at least these groups: `inform` (inform, tell, call, report, update, notify, message, phone, inform, let know, alert), `check` (check, verify, confirm, double check, recount, scan, cross check), `calm` (calm, patient, gently, softly, polite, kindly, relax), `apologise` (sorry, apologize), `listen` (listen, ask, understand, hear), `wait` (wait, stay, remain), `followup` (follow up, check back, later, again, after, next). `ACTION_VERBS` holds about 80 common job-action stems (tell, call, check, give, take, ask, stay, wait, help, move, lift, report, inform, explain, offer, show, count, scan, keep, write, note, clean, stop, plan, drive, park, deliver, refund, replace, …), plus the pronoun-led `i'd`/`will`/`would` so that "I will stay calm" counts. Process sentences in order. Within each sentence, collect the not-yet-hit concepts that match, sort by weight descending then id, and keep up to the cap. A concept matches only if the sentence contains an `ACTION_VERB` stem that isn't negated, or the concept is `invertsUnderNegation` and its own match is negated.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(grading): lexicon and concept matcher`

### Task 4: Quality signals

**Files:**
- Create: `src/domain/grading/quality.ts`
- Test: `tests/unit/grading/quality.test.ts`

**Interfaces:**
- Consumes: `Sentence` (Task 1), `SEQUENCE_MARKERS`, `FILLER_PHRASES`, `ACTION_VERBS` (Task 3).
- Produces: `qualityModifier(text: string, sentences: Sentence[], conceptSentences: ReadonlySet<number>): { total: number; parts: Record<"steps" | "concrete" | "ownership" | "filler" | "short", number> }`. `total` is clamped to [−1, 1].

- [ ] **Step 1: Write failing tests**

```ts
const q = (t: string, hit = new Set<number>([0])) => qualityModifier(t, splitSentences(t), hit);
expect(q("First I stay calm. Then I call the doctor at 9 pm and note the time.").parts).toMatchObject({ steps: 0.5, concrete: 0.5, ownership: 0.25 });
expect(q("1. Check label 2. Scan again 3. Tell supervisor about it today please").parts.steps).toBe(0.5);
expect(q("I will handle it properly and do the needful as required.", new Set()).parts.filler).toBe(-0.5);
expect(q("I handle it").parts.short).toBe(-1);
expect(q("I handle it").total).toBe(-1);
expect(q("First then next finally I will check 2 boxes and count 3 items and report").total).toBeLessThanOrEqual(1);
```

- [ ] **Step 2: Run** `npx vitest run tests/unit/grading/quality.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Steps: at least 2 distinct `SEQUENCE_MARKERS` (first, then, next, after that, after, finally, second, lastly) or at least 2 `\d+[.)]` list markers in `text`. Concrete: any digit, a time or quantity word (minutes, hours, am, pm, rupees, ₹, boxes, items), or at least 2 distinct `ACTION_VERBS`. Ownership: token `i` or `i'd`/`i'll`. Filler: a `FILLER_PHRASES` match (handle it properly, do the needful, do my best, take care of it, manage it, as required, whatever is needed) in a sentence that is not in `conceptSentences`. Short: fewer than 8 word tokens in `text`.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(grading): quality modifier`

### Task 5: Skill scorer

**Files:**
- Create: `src/domain/grading/grade.ts`
- Test: `tests/unit/grading/grade.test.ts`

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces:
  ```ts
  type Rubric = { skillName: string; concepts: Concept[]; redFlags: Concept[]; strongWeight: number };
  type GradeTrace = { concepts: string[]; redFlags: string[]; quality: Record<string, number>; raw: number };
  type SkillResult = { score: 0 | 1 | 2 | 3 | 4; evidence: string[]; trace: GradeTrace };
  gradeSkill(text: string, rubric: Rubric): SkillResult
  ```

- [ ] **Step 1: Write failing tests** against a small inline rubric: concepts `calm` (w1), `escalate` (w2), `explain` (w1), `no-force` (w2, inverted, `{ any: ["force"] }`); red flag `force-med` (`{ pair: [["force"], ["medicine", "tablet"]] }`); `strongWeight: 4`.

```ts
expect(gradeSkill("", R).score).toBe(0);
expect(gradeSkill("ok", R)).toMatchObject({ score: 0, evidence: [] });
expect(gradeSkill("मैं डॉक्टर को बुलाऊंगी और परिवार को बताऊंगी", R)).toMatchObject({ score: 0, evidence: [] });
const strong = "First I stay calm and explain why the medicine matters. I would never force her. Then I call her daughter and tell the supervisor.";
expect(gradeSkill(strong, R).score).toBe(4);
expect(gradeSkill(strong, R).evidence).toHaveLength(2);
const unsafe = "I stay calm and explain, then I force the medicine into her mouth and tell the supervisor later.";
expect(gradeSkill(unsafe, R).score).toBeLessThanOrEqual(1);
expect(gradeSkill(unsafe, R).evidence.join(" ")).not.toMatch(/force the medicine/);
expect(gradeSkill(unsafe, R).trace.redFlags).toEqual(["force-med"]);
const once = "I stay calm with her and talk to her. ";   // ≥ 8 words so the short penalty doesn't differ
expect(gradeSkill(once.repeat(20), R).score).toBe(gradeSkill(once, R).score);
const blob = "i stay calm and explain to her slowly why the tablet is needed and i would never force her and if she still says no i call her daughter and also tell the supervisor and note the time in the chart so the next shift knows";
expect(gradeSkill(blob, R).trace.concepts).toHaveLength(4);
expect(gradeSkill(blob, R).evidence[0].length).toBeLessThanOrEqual(241);
```

- [ ] **Step 2: Run** `npx vitest run tests/unit/grading/grade.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** following the spec's "Scoring one skill" steps 5–7. Red flags run through `matchConcepts`. Their sentences go into an excluded set for evidence. Evidence ranks sentences by the sum of their concept-hit weights descending, then by position. A sentence longer than 240 chars is truncated to 240 chars plus `…`.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(grading): skill scorer`

### Task 6: Benchmark data, rubric doc and harness (labels before rules)

**Files:**
- Create: `tests/benchmark/RUBRIC.md`, `tests/benchmark/answers/{caregiver,warehouse,retail,driver,generic}.json`, `tests/benchmark/harness.ts`, `tests/benchmark/agreement.test.ts`
- Modify: `vitest.config.mts`, adding `"tests/benchmark/**/*.test.ts"` to `include`

**Interfaces:**
- Consumes: `TEMPLATES` (`src/providers/ai/templates.ts`), `AIProvider` / `GradeInput` / `SkillGrade` (`src/providers/types.ts`).
- Produces (`harness.ts`):
  ```ts
  type Entry = { id: string; split: "tune" | "holdout"; questionIndex: number; answer: string;
                 labels: Record<string, number>; tags: string[]; safetySkill?: string };
  type FamilyFile = { family: string; scorecard?: { skills: { name: string; keywords: string[] }[]; questions: QuestionDraft[] }; entries: Entry[] };
  loadBenchmark(): FamilyFile[]
  inputFor(file: FamilyFile, entry: Entry): GradeInput   // template scorecard unless file.scorecard; the answer goes at questionIndex and the other answers are ""
  type Metrics = { n: number; withinOne: number; exact: number; spearman: number; unsafeOk: number; stuffingOk: number };
  evaluate(files: FamilyFile[], ai: AIProvider, filter: { split?: "tune" | "holdout"; generic?: boolean }): Promise<Metrics>
  formatReport(rows: Record<string, Metrics>): string
  spearman(a: number[], b: number[]): number   // average ranks for ties; 0 when either side is constant
  ```
  Metrics are fractions in [0, 1] over every (entry, labelled skill) pair. `unsafeOk` is the fraction of `unsafe` entries whose score on `safetySkill` is ≤ 1. `stuffingOk` is the fraction of `stuffing` entries whose labelled skills are all ≤ 1. Both are `1` when there are no such entries.

- [ ] **Step 1: Write `RUBRIC.md`.** The 0–4 scale exactly as in the spec, then for each of the 19 template skills, 2–4 bullets saying what a 3 and a 4 must contain (e.g. *Handling emergencies 4: doesn't move the person, checks breathing/consciousness, calls 108/112 or the supervisor, keeps them warm and still, informs family*).
- [ ] **Step 2: Write the holdout entries first, in one pass.** Per template family: 8 entries spread across all 3 questions. Across the four families the holdout set covers every tag at least once. `generic.json` holds a "Kitchen helper" scorecard (skills *Food hygiene*, *Speed in prep*, *Teamwork*, with keywords) and 3 questions, with 5 of its 20 entries in holdout. Label each against `RUBRIC.md`. Don't edit holdout entries after this step.
- [ ] **Step 3: Write the tune entries.** 22 per template family, 15 for generic. Every family covers every tag. `unsafe` entries set `safetySkill`. Labels cover exactly the question's `skillNames`.
- [ ] **Step 4: Write the data-validity test in `agreement.test.ts`**

```ts
it("benchmark data is well-formed", () => {
  const files = loadBenchmark();
  expect(files.map((f) => f.family).sort()).toEqual(["caregiver", "driver", "generic", "retail", "warehouse"]);
  for (const f of files) for (const e of f.entries) {
    const q = inputFor(f, e).questions[e.questionIndex];
    expect(Object.keys(e.labels).sort()).toEqual([...q.skillNames].sort());
    for (const v of Object.values(e.labels)) expect([0, 1, 2, 3, 4]).toContain(v);
    if (e.tags.includes("unsafe")) expect(q.skillNames).toContain(e.safetySkill);
  }
  const ids = files.flatMap((f) => f.entries.map((e) => e.id));
  expect(new Set(ids).size).toBe(ids.length);
  const holdoutTags = new Set(files.flatMap((f) => f.entries.filter((e) => e.split === "holdout").flatMap((e) => e.tags)));
  for (const t of TAGS) expect(holdoutTags).toContain(t);
});
it("spearman handles ties", () => { expect(spearman([1, 2, 3], [1, 2, 3])).toBeCloseTo(1); expect(spearman([1, 1, 1], [1, 2, 3])).toBe(0); });
it("prints the mock baseline", async () => { console.log(formatReport({ "mock/tune": await evaluate(loadBenchmark(), new MockAIProvider(), { split: "tune", generic: false }) })); });
```
`TAGS` is the tag list from the spec, exported from `harness.ts`.

- [ ] **Step 5: Run** `npx vitest run tests/benchmark`. Expected: PASS, with a baseline report printed. Write the baseline numbers down for Task 10.
- [ ] **Step 6: Commit** `test(benchmark): labelled grading benchmark and harness`

### Task 7: Generic rubric

**Files:**
- Create: `src/domain/grading/generic.ts`
- Test: `tests/unit/grading/generic.test.ts`

**Interfaces:**
- Consumes: `Rubric` (Task 5), `expand`/`SYNONYMS` (Task 3), `stem` (Task 1).
- Produces: `buildGenericRubric(skill: { name: string; keywords: string[] }): Rubric`.

- [ ] **Step 1: Write failing tests**

```ts
const r = buildGenericRubric({ name: "Food hygiene", keywords: ["wash", "gloves", "clean"] });
expect(r.redFlags).toEqual([]);
expect(r.concepts.map((c) => c.id)).toEqual(expect.arrayContaining(["kw:wash", "kw:gloves", "kw:clean", "gen:inform", "gen:check", "gen:calm", "gen:followup"]));
expect(r.strongWeight).toBeCloseTo(0.6 * r.concepts.reduce((a, c) => a + c.weight, 0));
expect(buildGenericRubric({ name: "X", keywords: [] }).concepts.length).toBe(4);
expect(gradeSkill("I wash my hands, wear gloves, clean the board and tell the chef.", r).score).toBeGreaterThanOrEqual(3);
```

- [ ] **Step 2: Run** `npx vitest run tests/unit/grading/generic.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Each keyword becomes `kw:<keyword>`, weight 1, `{ any: [keyword, ...lexicon group containing its stem] }`. The `gen:*` concepts are weight 1 and use the `@inform`, `@check`, `@calm` and `@followup` groups. Deduplicate keywords by stem.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(grading): generic rubric for custom skills`

### Task 8: Family rubrics and selection

**Files:**
- Create: `src/domain/grading/rubrics/{caregiver,warehouse,retail,driver,index}.ts`
- Test: `tests/unit/grading/rubrics.test.ts`

**Interfaces:**
- Consumes: `Rubric`, `Concept` (Tasks 3, 5), `buildGenericRubric` (Task 7), `TEMPLATES`.
- Produces:
  - Each family file: `export const CAREGIVER_RUBRICS: Rubric[]` (likewise `WAREHOUSE_`, `RETAIL_`, `DRIVER_`), one per template skill, with `skillName` equal to the template name.
  - `index.ts`: `FAMILY_RUBRICS: Record<string, Rubric[]>`; `selectRubrics(skills: { name: string; keywords: string[] }[]): Map<string, Rubric>`. Pick the family with the most exact (case-insensitive) name matches; ties go to the earlier family in `TEMPLATES`, and 0 matches means no family. Matched skills get the family rubric; all others get `buildGenericRubric`.

- [ ] **Step 1: Write failing tests**

```ts
for (const t of TEMPLATES) expect(FAMILY_RUBRICS[t.family].map((r) => r.skillName).sort()).toEqual(t.skills.map((s) => s.name).sort());
for (const rs of Object.values(FAMILY_RUBRICS)) for (const r of rs) {
  const total = r.concepts.reduce((a, c) => a + c.weight, 0);
  expect(r.strongWeight).toBeGreaterThan(0.5 * total); expect(r.strongWeight).toBeLessThan(0.7 * total);
}
const wh = TEMPLATES.find((t) => t.family === "warehouse")!.skills;
expect(selectRubrics(wh).get("Reliability")).toBe(WAREHOUSE_RUBRICS.find((r) => r.skillName === "Reliability"));
const renamed = [...wh.slice(0, 4), { name: "Shows up on time", keywords: ["punctual"] }];
expect(selectRubrics(renamed).get("Shows up on time")!.concepts[0].id).toBe("kw:punctual");   // generic
expect(selectRubrics([{ name: "Food hygiene", keywords: ["wash"] }]).get("Food hygiene")!.redFlags).toEqual([]);
```

- [ ] **Step 2: Run** `npx vitest run tests/unit/grading/rubrics.test.ts`. Expected: FAIL.
- [ ] **Step 3: Write the rubrics from `RUBRIC.md`'s 3/4 bullets, not from benchmark answers.** Each skill gets 5–8 concepts (key actions at weight 2) and 2–5 red flags. Safety-relevant skills (*Handling emergencies*, *Patient care & dignity*, *Safety awareness*, *Safe driving*, *Cash handling & billing*, *Customer service*) must each have red flags. Shared ideas use lexicon `@groups` rather than copied word lists.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(grading): role-family rubrics and selection`

### Task 9: RuleBasedAIProvider and wiring

**Files:**
- Create: `src/providers/ai/rule-based.ts`
- Modify: `src/providers/ai/mock.ts` (change `readonly model = "mock-ai"` to `readonly model: string = "mock-ai"`, and the same for `promptVersion`, so a subclass can override them), `src/lib/providers.ts` (default `ai: new RuleBasedAIProvider()`)
- Test: `tests/unit/grading/rule-based.test.ts`

**Interfaces:**
- Consumes: `selectRubrics` (Task 8), `gradeSkill` (Task 5), `GradeInput`, `SkillGrade`.
- Produces: `class RuleBasedAIProvider extends MockAIProvider`, with `model = "rules"`, `promptVersion = "rules-v1"`, and `gradeAnswers(input: GradeInput): Promise<SkillGrade[]>`. It returns one grade per input skill, in input order, with `trace` stripped. Text per skill is the linked answers, each truncated to 4,000 chars, joined with `"\n"`.

- [ ] **Step 1: Write failing tests**

```ts
const ai = new RuleBasedAIProvider();
const card = await ai.generateScorecard({ title: "Home Caregiver", location: "Pune", tasks: "", mustHaves: "", payMin: 1, payMax: 2, shifts: "day" });
const g = await ai.gradeAnswers({ skills: card.skills, questions: card.questions, answers: ["I stay calm and explain the medicine, then tell her daughter.", "", ""] });
expect(g.map((x) => x.skillName)).toEqual(card.skills.map((s) => s.name));
expect(Object.keys(g[0]).sort()).toEqual(["evidence", "score", "skillName"]);
expect(g.find((x) => x.skillName === "Handling emergencies")!.score).toBe(0);        // only linked to an empty answer
expect(ai.model).toBe("rules"); expect(ai.promptVersion).toBe("rules-v1");
const long = "I stay calm. ".repeat(1000);
const t0 = performance.now(); await ai.gradeAnswers({ skills: card.skills, questions: card.questions, answers: [long, long, long] });
expect(performance.now() - t0).toBeLessThan(50);
expect(getProviders().ai).toBeInstanceOf(RuleBasedAIProvider);
```

- [ ] **Step 2: Run** `npx vitest run tests/unit/grading/rule-based.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement and wire the default.**
- [ ] **Step 4: Run** `npm test`. Expected: all unit and integration tests PASS. That includes `tests/integration/applications.test.ts`: *flags injection attempts without changing the score*, *ranks the shortlist by score*, and *redacts the candidate's name from evidence*. If a fixture in `tests/setup/fixtures.ts` or the test's `GOOD`/`WEAK` answers relied on mock keyword counts, rewrite the fixture answer as a realistic answer. Don't loosen the assertion.
- [ ] **Step 5: Commit** `feat: rule-based grader as default AI grading provider`

### Task 10: Tune to thresholds, then check the holdout

**Files:**
- Modify: `src/domain/grading/rubrics/*.ts`, `lexicon.ts`, `normalize.ts`, `quality.ts`, and constants in `grade.ts` and `concepts.ts`
- Modify: `tests/benchmark/agreement.test.ts`

**Interfaces:**
- Consumes: `evaluate`, `formatReport` (Task 6), `RuleBasedAIProvider` (Task 9).

- [ ] **Step 1: Add threshold tests** with the spec's values:

```ts
const T = { tune: [0.85, 0.60, 0.75], holdout: [0.85, 0.55, 0.70], generic: [0.75, 0.45, 0.60] } as const;
it.each([["tune", { split: "tune", generic: false }], ["holdout", { split: "holdout", generic: false }], ["generic", { generic: true }]] as const)(
  "rules meet %s thresholds", async (name, filter) => {
    const m = await evaluate(loadBenchmark(), new RuleBasedAIProvider(), filter);
    console.log(formatReport({ [`rules/${name}`]: m }));
    const [w, e, s] = T[name];
    expect(m.withinOne).toBeGreaterThanOrEqual(w); expect(m.exact).toBeGreaterThanOrEqual(e); expect(m.spearman).toBeGreaterThanOrEqual(s);
    if (name !== "generic") { expect(m.unsafeOk).toBe(1); expect(m.stuffingOk).toBe(1); }
  });
```

- [ ] **Step 2: Tune using only `npx vitest run tests/benchmark -t "tune"`** and per-entry traces of the tune split, until the tune row passes. Then run generic and tune generic-only modules (`generic.ts`, the lexicon). Rubric changes must stay general ideas from `RUBRIC.md`; never add a phrase copied from one specific benchmark answer.
- [ ] **Step 3: Run the holdout once:** `npx vitest run tests/benchmark -t "holdout"`. Expected: PASS. If it fails, **stop and report the numbers to the user**. Don't tune against holdout failures or edit holdout entries.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(grading): tune rubrics to benchmark thresholds`, putting the tune, holdout, generic and baseline numbers in the commit body.

### Task 11: Seed check, docs and full verification

**Files:**
- Modify: `README.md` (feature table row for grading, the "Swapping in real providers" paragraph, and a short "Grading" section with the benchmark command and the latest numbers)
- Possibly modify: `prisma/seed.ts` (only if the demo ranking stops making sense)

- [ ] **Step 1: Re-seed and check the order.** Run `npm run db:push && npm run seed`, then run a one-off script from the scratchpad that prints each demo job's shortlist `totalScore` in order. Expected: the seed's strongest answers rank first and the weakest rank last. If they don't, adjust the seed *answers* to match their intended strength.
- [ ] **Step 2: Update the README.**
- [ ] **Step 3: Run** `npm test && npm run build && npm run e2e`. Expected: everything PASS.
- [ ] **Step 4: Commit** `docs: rule-based grader in README`
