# Task-report judgment: 0.2.1

A separate reader scored the 18 replies in `report.md` (3 prompts x 6 runs, `claude-opus-5[1m]`) and the 18 written under the previous rules (0.2.0) from the same prompts. For each reply it counted the lines the user does not act on, by kind, and checked that every must-have item from `report-prompts.json` was stated. The burden was set against the plugin: when unsure whether a line changes what the user does, it counted as noise, and when unsure whether a must-have was stated, it counted as missing.

Result: 1.2 noise lines per reply under 0.2.1 (21 over 18 replies, 4 replies with none), against 5.6 under 0.2.0 (101 over 18, none clean). No must-have item was missing in either arm (0 of 54).

Kinds: A a check that passed or how it was verified, B a restatement of the request or of what matches it, C content the user can open in the file, D the model's own notes or records, E a step the user said they would take or would take anyway, F a fact with no consequence, G an offer or a reason beyond one clause.

## Per prompt

| Rules | Prompt | Noise lines | Per reply | A | B | C | D | E | F | G | Must-haves missing |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 0.2.1 | copy-rules | 8 | 1.3 | 0 | 3 | 0 | 0 | 0 | 0 | 5 | 0/24 |
| 0.2.1 | amend-release | 3 | 0.5 | 0 | 1 | 0 | 0 | 0 | 2 | 0 | 0/12 |
| 0.2.1 | rename-key | 10 | 1.7 | 4 | 0 | 0 | 0 | 0 | 0 | 6 | 0/18 |
| 0.2.0 | copy-rules | 14 | 2.3 | 6 | 1 | 0 | 0 | 0 | 0 | 7 | 0/24 |
| 0.2.0 | amend-release | 61 | 10.2 | 16 | 6 | 12 | 0 | 12 | 15 | 0 | 0/12 |
| 0.2.0 | rename-key | 26 | 4.3 | 6 | 0 | 1 | 0 | 0 | 0 | 19 | 0/18 |

## Noise left under 0.2.1

| Prompt | Run | Kind | Line |
|---|---|---|---|
| copy-rules | 1 | B | "The 0.7.0 to 0.9.0 entries are unchanged" |
| copy-rules | 6 | B | "The 0.7.0 to 0.9.0 entries are unchanged, as you chose." |
| amend-release | 5 | F | "Not pushed. origin still has 79bb5e8." |
| rename-key | 1 | G | "The schema needs updating wherever it lives." |
| rename-key | 3 | G | "The schema needs the rename wherever it lives." |

## Patterns

- Under 0.2.0 the amend-release replies pasted the changelog entry, re-verified the file state and printed the user's own `git push --force-with-lease` command in all six runs. Under 0.2.1 none of the 18 replies pasted content, mentioned the model's own records or repeated a step the user said they would take.
- What remains under 0.2.1 is mostly kind G, an unrequested suggestion about the schema on rename-key, plus a few "older entries unchanged" restatements and "tests and lint verified" lines.
- The copy-rules prompt is close to the Edit task example in the rules, so its result is the weakest evidence. amend-release and rename-key have no example.
- Each prompt hands the model the noise as facts, so the test measures filtering, not what the model volunteers on its own.
