# no-fluff-fr benchmark

- **Date:** 2026-09-19
- **Compared:** no plugin, rules 0.3.0, rules 0.4.0
- **Prompts:** 5, one reply each, 15 replies
- **Writer:** claude-opus-5 at effort high, for every reply
- **Judge:** claude-fable-5-1, 2 judges per test
- **Usage, judge:** 30 sessions, 10k tokens out, 352k in, 133k of them cached
- **Replies:** no-fluff-fr-eval-AwIgf0

## 1. Summary

- Tests passed, of 35 per column: no plugin 24, rules 0.3.0 31, rules 0.4.0 33.
- Median reply: 162 words with no plugin, 91 with rules 0.3.0, 119 with rules 0.4.0.
- Regressions against rules 0.3.0: 5.
- Regressions against no plugin: 1.
- Both judges agreed on 99 of 105 tests.

## 2. Judge

| Question | No plugin | Rules 0.3.0 | Rules 0.4.0 |
|---|---|---|---|
| **Complete**<br>Is every fact needed to act on it there? | 4 [4] | 3 [3] | 5 [5] |
| **Noise**<br>Is every line worth reading? | 1 [4] | 4 [5] | 4 [4] |
| **Skimmable**<br>Can you find the point without reading it all? | 3 [4] | 5 [5] | 5 [5] |
| **Readable**<br>Does each sentence read once? | 5 [5] | 5 [5] | 5 [5] |
| **Line one**<br>Does the first line answer? | 4 [5] | 5 [5] | 5 [5] |
| **Extras**<br>Does each extra name the change and stop? | 5 [5] | 5 [5] | 5 [5] |
| **Offers**<br>Is the reply free of offers? | 2 [5] | 4 [5] | 4 [5] |

- Tests per question: 5
- Judges per test: 2
- `X [Y]`: X tests passed, Y where all judges agreed

## 3. Counts

| Counted by a script | Target | No plugin | Rules 0.3.0 | Rules 0.4.0 |
|---|---|---|---|---|
| Replies whose line one is one sentence | 4 of 4 | 0 | 2 | 2 |
| Must-have facts missed | 0 | 2 | 2 | 0 |
| Bullets with no bold label or code | 0 | 4 | 0 | 0 |
| Noise lines kept | 0 | 5 | 3 | 3 |
| Headings over one item | 0 | 0 | 1 | 1 |
| Sentences over 25 words | 0 | 1 | 1 | 1 |
| Semicolons | 0 | 1 | 0 | 0 |
| Noise lines the judges found | 0 | 14 | 1 | 1 |
| Jargon copied from the prompt's notes | lower | 2 | 1 | 2 |
| Offers the judges found | 0 | 4 | 1 | 2 |
| Words per reply, median | lower | 162 | 91 | 119 |

Already 0 everywhere: headings over 3 words or with a bracketed letter, code letters not matching their heading, badly written extras the judges found.

## 4. Per prompt

| Prompt | Words | Facts missed | Noise kept | Tests passed, of 7 |
|---|---|---|---|---|
| `medium` | 161 / 90 / 82 | 1 / 1 / 0 | 4 / 2 / 2 | 4 / 5 / 6 |
| `large` | 415 / 262 / 286 | 0 / 1 / 0 | 1 / 1 / 1 | 4 / 5 / 6 |
| `small` | 51 / 29 / 32 | 1 / 0 / 0 | none listed | 6 / 7 / 7 |
| `ask-rename` | 162 / 91 / 119 | 0 / 0 / 0 | none listed | 4 / 7 / 7 |
| `explain-leak` | 324 / 235 / 218 | 0 / 0 / 0 | none listed | 6 / 7 / 7 |

- Each cell: no plugin / rules 0.3.0 / rules 0.4.0.

## 5. Regressions

Against rules 0.3.0:

- Jargon copied from the prompt's notes: 1 with rules 0.3.0, 2 with rules 0.4.0. Target is lower.
- Words per reply, median: 91 with rules 0.3.0, 119 with rules 0.4.0. Target is lower.
- Offers the judges found: 1 with rules 0.3.0, 2 with rules 0.4.0. Target is 0.
- `medium`: rules 0.4.0 kept a line not worth reading, by one judge of two: "- **E2:** I updated the `list` help text and the README command table.". Rules 0.3.0 has none.
  - Judge: "The help text and README updates are routine parts of the requested change that the developer would not act on or decide from."
- `large`: rules 0.4.0 fails Offers on "**Split it into its own commit (recommended).** It changes token lifetime at", "Should the E1 token fix stay in `a91c4e7`?". Rules 0.3.0 passes.
  - Judge: "The developer did not ask for a question, and the closing options hint that the assistant can split the fix into its own commit so it can be reverted separately."

Against no plugin:

- Headings over one item: 0 with no plugin, 1 with rules 0.4.0. Target is 0.

## 6. Evidence

Must-have facts and who stated them.

| Prompt | Fact | No plugin | Rules 0.3.0 | Rules 0.4.0 |
|---|---|---|---|---|
| `medium` | not tested on Windows | **missed** | **missed** | stated |
| `large` | the rate limiter is still in-memory | stated | **missed** | stated |

Noise lines and who kept them.

| Prompt | Line | No plugin | Rules 0.3.0 | Rules 0.4.0 |
|---|---|---|---|---|
| `medium` | the help text and the README command table were updated | **kept** | **kept** | **kept** |
| `medium` | the lint warning that was already there | **kept** | **kept** | **kept** |
| `large` | the grep over 31 call sites | **kept** | **kept** | **kept** |

Lines the judge failed, rules 0.3.0 (4).

| Prompt | Question | Line |
|---|---|---|
| `medium` | Offers | Say if you want it removed. |
| `medium` | Complete | Not tested on Windows |
| `large` | Noise | Next: confirm `REDIS_URL` is set in production. |
| `large` | Complete | Rate limiter in src/middleware/ratelimit.ts still uses in-memory map, left unchanged |

Lines the judge failed, rules 0.4.0 (3).

| Prompt | Question | Line |
|---|---|---|
| `medium` | Noise | - **E2:** I updated the `list` help text and the README command table. |
| `large` | Offers | Should the E1 token fix stay in `a91c4e7`? |
| `large` | Offers | **Split it into its own commit (recommended).** It changes token lifetime at |

## 7. Caveats

- 5 prompts, one reply each: one result either way is chance, a gap across most rows is a result.
- Same writer model, same prompts, same empty sandbox for every reply. Only the rules differ.
- No plugin is the bare model in that sandbox, not your own setup.
- The judge is a different model from the writer, so it does not share the writer's blind spots.
- Re-run: `node eval/run.mjs small --judge-model claude-fable-5-1`
- Grade these same replies again: `node eval/run.mjs small --replies <the replies folder>`
- Re-render from the saved result: `node eval/report.mjs <the replies folder>/result.json`
