# no-fluff-fr rules benchmark

```
  OLD   ee12074 chore(plugin): release 0.2.1
  NEW   0.3.0

  sample   8 prompts x 2 per arm  =  32 replies, 80 blind judgments
  writer   claude-opus-5, effort high   (both arms, same model)
  judge    claude-fable-5-1, blind, both label orders
  replies  no-fluff-fr-eval-nE2gze
  ran      2026-09-18
```

**New wins 36 blind judgments, loses 13, ties 31. Replies are 7% longer. No fact the old rules stated went missing. 4 counts got worse: offer phrases, headings over 3 words or with a bracketed letter, code letters not matching their heading, words per reply, median.**

## 1. Quality: what a blind judge picked

| The judge's question | Old won | New won | Both judges agreed |
|---|---|---|---|
| **Skimmable**<br>Can you find the point without reading it all? | 0 of 16 | 12 of 16 | 12 of 16 |
| **Complete**<br>Is every fact needed to act on it there? | 0 of 16 | 5 of 16 | 8 of 16 |
| **Line one**<br>Does the first line answer? | 2 of 16 | 6 of 16 | 13 of 16 |
| **Readable**<br>Does each sentence read once? | 3 of 16 | 6 of 16 | 11 of 16 |
| **Noise**<br>Is every line worth reading? | 8 of 16 | 7 of 16 | 16 of 16 |

## 2. Form: what a script counted

| What is counted | Target | Old | New | |
|---|---|---|---|---|
| Line one is a single sentence | 14 of 14 | 2 of 14 | 3 of 14 | `+1` |
| Bullets with no bold label or code | 0 | 34 | 0 | `-34` |
| Must-have facts missed | 0 | 3 | 0 | `-3` |
| Jargon copied from the prompt's notes | lower | 9 | 6 | `-3` |
| Sentences over 25 words | 0 | 7 | 5 | `-2` |
| Headings over 3 words or with a bracketed letter | 0 | 0 | 1 | `+1 worse` |
| Code letters not matching their heading | 0 | 0 | 2 | `+2 worse` |
| Words per reply, median | lower | 66.5 | 71 | `+7% worse` |
| Offer phrases | 0 | 4 | 9 | `+5 worse` |

Already 0 in both arms, unchanged: semicolons.

## 3. Prompt by prompt

| Prompt | Words | Facts missed | Line one | Judge, old / new |
|---|---|---|---|---|
| `small-1` | 24 -> 19 `-21%` | 1 -> 0 | yes -> no | 0 / 5 |
| `ask-rename-2` | 100 -> 70 `-30%` | 0 -> 0 | no -> yes | 0 / 4 |
| `amend-release-2` | 56 -> 64 `+14% worse` | 0 -> 0 | no -> no | 0 / 4 |
| `ask-rename-1` | 101 -> 81 `-20%` | 0 -> 0 | no -> yes | 0 / 3 |
| `small-2` | 30 -> 19 `-37%` | 0 -> 0 | no -> no | 0 / 2 |
| `explain-leak-1` | 228 -> 189 `-17%` | 0 -> 0 | n/a -> n/a | 1 / 3 |
| `copy-rules-1` | 47 -> 93 `+98% worse` | 0 -> 0 | no -> no | 1 / 3 |
| `copy-rules-2` | 46 -> 113 `+146% worse` | 0 -> 0 | no -> no | 1 / 3 |
| `medium-1` | 48 -> 66 `+38% worse` | 1 -> 0 | yes -> no | 1 / 2 |
| `medium-2` | 64 -> 60 `-6%` | 1 -> 0 | no -> yes | 1 / 2 |
| `explain-leak-2` | 221 -> 187 `-15%` | 0 -> 0 | n/a -> n/a | 1 / 2 |
| `rename-key-1` | 69 -> 69 `same` | 0 -> 0 | no -> no | 1 / 1 |
| `rename-key-2` | 70 -> 72 `+3% worse` | 0 -> 0 | no -> no | 1 / 1 |
| `large-1` | 206 -> 208 `+1% worse` | 0 -> 0 | no -> no | 1 / 0 |
| `amend-release-1` | 61 -> 61 `same` | 0 -> 0 | no -> no | 2 / 1 |
| `large-2` | 187 -> 215 `+15% worse` | 0 -> 0 | no -> no | 2 / 0 |

## 4. Regressions

- **Offer phrases**: 4 -> 9 across all replies. Target is 0.
- **Headings over 3 words or with a bracketed letter**: 0 -> 1 across all replies. Target is 0.
- **Code letters not matching their heading**: 0 -> 2 across all replies. Target is 0.
- **Words per reply, median**: 66.5 -> 71 across all replies. Target is lower.
- **`large-1`**: the old rules won 1 criteria to 0.
- **`amend-release-1`**: the old rules won 2 criteria to 1.
- **`large-2`**: the old rules won 2 criteria to 0.

## 5. Evidence

Facts a reply should have stated.

| Prompt | Fact | Old | New |
|---|---|---|---|
| `small-1` | README.md line 13 now says install | **missed** | kept |
| `medium-1` | tests: 212 pass, 3 new | **missed** | kept |
| `medium-2` | tests: 212 pass, 3 new | **missed** | kept |

Noise the old rules left in (5 of 27).

| Prompt | Line |
|---|---|
| `small-2` | since changelog entries usually stay frozen |
| `small-1` | since you asked about the README |
| `medium-2` | No other command has a --json flag, so this sets the convention |
| `medium-2` | Help text and README command table updated. |
| `large-1` | D3 Used ioredis, already a dependency for the queue. |

Noise the new rules left in (5 of 44).

| Prompt | Line |
|---|---|
| `medium-1` | Help text and README command table updated. |
| `medium-1` | no other command has --json, so this sets the shape |
| `medium-1` | one pre-existing warning in src/cli/format.ts, untouched |
| `medium-1` | Lint: one pre-existing warning in src/cli/format.ts, untouched. |
| `medium-1` | Revert if you want the two views identical. |

## 6. Before you act on this

- 8 prompts at 2 replies each. A margin of 1 is a coin flip. A margin of 2 or more in the same direction is a result.
- Both arms ran the same writer model, the same prompts and the same isolation. Only the rules differ.
- claude-fable-5-1 judged, claude-opus-5 wrote. Different models, so a shared blind spot is not scoring itself.
- Re-run it: `node eval/run.mjs medium --judge-model claude-fable-5-1`. Score these same replies again without regenerating them: `node eval/run.mjs medium --replies <the replies folder>`.
- Re-render this report from the saved result: `node eval/report.mjs <the replies folder>/result.json`.
