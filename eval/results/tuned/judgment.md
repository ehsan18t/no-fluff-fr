# Judgment: tuned

Same protocol as [baseline](../baseline/judgment.md): a separate reader compared each plugin-on reply with the plugin-off reply of the same run number (the same 30 off replies as baseline), with the burden set against the plugin. The rules changed between the two runs: warnings are never cut, including the downside of any workaround or alternative suggested.

Result: acceptance item 8 still not met, but improved. On replies dropped 12 caveats (1 high confidence, 6 medium, 5 low), down from 20. Line one answered the question in 28/30 on replies against 15/30 off.

## Dropped caveats

| Prompt | Pair | Caveat | Confidence |
|---|---|---|---|
| explain-index | 1 | an index on a hot, frequently updated column disables HOT updates | medium |
| explain-index | 1 | bulk loads into a heavily indexed table are much slower | medium |
| explain-index | 1 | wrong column order in a composite index | low |
| explain-index | 3 | functions, leading wildcards and implicit casts block index use | medium |
| explain-thread | 3 | a thread cannot be killed safely, a process can | low |
| summarize-retry | 1 | a stream request body cannot be resent on retry | high |
| plan-reset | 1 | do not consume the token on GET, email scanners open links first | medium |
| plan-reset | 2 | CSRF protection for cookie-session endpoints | medium |
| plan-reset | 3 | CSRF interaction with cookie auth | low |
| plan-darkmode | 2 | color transitions animate the whole page on theme switch | medium |
| plan-darkmode | 1 | check WCAG AA contrast | low |
| plan-darkmode | 3 | contrast check and skipping the animation for reduced motion | low |

## Per prompt

| Prompt | Caveats off (sum of 3) | Dropped on, tuned | Dropped on, baseline | Line one answers, off | on |
|---|---|---|---|---|---|
| explain-index | ~26 | 4 | 0 | 0/3 | 3/3 |
| explain-thread | ~17 | 1 | 0 | 0/3 | 3/3 |
| debug-foreach | ~8 | 0 | 0 | 3/3 | 3/3 |
| debug-default-arg | ~6 | 0 | 3 | 2/3 | 3/3 |
| debug-docker | ~10 | 0 | 2 | 3/3 | 3/3 |
| compare-db | ~11 | 0 | 3 | 3/3 | 3/3 |
| compare-rpc | ~9 | 0 | 0 | 3/3 | 3/3 |
| summarize-retry | ~25 | 1 | 4 | 1/3 | 3/3 |
| plan-reset | ~32 | 3 | 4 | 0/3 | 2/3 |
| plan-darkmode | ~26 | 4 | 5 | 0/3 | 2/3 |

## Patterns

- The warnings about workarounds and alternative fixes that baseline dropped (debug-default-arg, debug-docker, compare-db) are all kept now.
- Remaining drops sit in the two densest lists: explain-index failure cases and the plan-reset security checklist. CSRF appears in no plan-reset on reply.
- On replies still add risks the off reply lacked: random UUID keys, fork with threads holding locks, stream body reuse on retry, SSO-only accounts, CSP blocking an inline theme script.
- Both line-one failures on (plan-reset on 3, plan-darkmode on 2) open with a markdown heading before the summary sentence.
- The explain-index drops are new while baseline had none there, so part of the difference between runs is sampling variation, not the rules. Each pair is one sample and no off-vs-off control was run.
- A sentence about authorizing claude.ai connectors leaked into some replies (for example compare-db on 3). It comes from the headless session's own system prompt, which `--setting-sources ""` does not remove, and can appear in either arm.
