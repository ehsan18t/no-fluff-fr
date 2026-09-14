# Judgment: baseline

A separate reader compared each plugin-on reply with the plugin-off reply of the same run number (30 pairs), listing the caveats and risks the off reply stated and checking whether the on reply stated each one. It also checked whether line one of every reply answers the question. The burden was set against the plugin: when unsure whether an on reply covered a caveat, it counted as dropped.

Result: acceptance item 8 not met. On replies dropped 20 caveats (1 high confidence, 11 medium, 8 low). On replies also added risks their off counterparts lacked, and line one answered the question in 29/30 on replies against 15/30 off.

## Dropped caveats

| Prompt | Pair | Caveat | Confidence |
|---|---|---|---|
| debug-default-arg | 1 | `tags or []` replaces an empty list the caller passed in; use `is None` | medium |
| debug-default-arg | 2 | same `if not tags` pitfall | medium |
| debug-default-arg | 3 | same `if not tags` pitfall | medium |
| debug-docker | 2 | `tail -f /dev/null` workaround hides nginx crashes and blocks signals | medium |
| debug-docker | 3 | same workaround warning | medium |
| compare-db | 1 | snapshot prices, addresses and tax rates onto invoices so past invoices do not change | medium |
| compare-db | 1 | gapless invoice numbers need a transaction-safe counter | low |
| compare-db | 2 | copy prices onto the invoice instead of referencing the current price | medium |
| summarize-retry | 1 | `Retry-After` headers are ignored | medium |
| summarize-retry | 2 | unread 5xx bodies can hold connections open | medium |
| summarize-retry | 2 | the diff has no tests for the retry logic | medium |
| summarize-retry | 3 | the caller's `options.signal` is overwritten, so callers cannot cancel | high |
| plan-reset | 1 | do not consume the token on GET, email scanners open links first | low |
| plan-reset | 2 | CSRF protection for cookie-session endpoints | medium |
| plan-reset | 3 | CSRF interaction with cookie auth | medium |
| plan-reset | 3 | generate the token with a crypto RNG, never `Math.random` | low |
| plan-darkmode | 2 | color transitions animate the whole page on theme switch | low |
| plan-darkmode | 2 | update `meta theme-color` on theme change | low |
| plan-darkmode | 3 | skip the transition for reduced motion and first load | low |
| plan-darkmode | 3 | check WCAG AA contrast | low |

## Per prompt

Caveat sums are approximate because the line between a caveat and a recommendation is a judgment call. Dropped and line-one columns are exact.

| Prompt | Caveats off (sum of 3) | Dropped on | Line one answers, off | on |
|---|---|---|---|---|
| explain-index | ~26 | 0 | 0/3 | 3/3 |
| explain-thread | ~15 | 0 | 0/3 | 3/3 |
| debug-foreach | ~9 | 0 | 3/3 | 3/3 |
| debug-default-arg | ~6 | 3 | 2/3 | 3/3 |
| debug-docker | ~11 | 2 | 3/3 | 3/3 |
| compare-db | ~12 | 3 | 3/3 | 3/3 |
| compare-rpc | ~13 | 0 | 3/3 | 3/3 |
| summarize-retry | ~27 | 4 | 1/3 | 3/3 |
| plan-reset | ~30 | 4 | 0/3 | 2/3 |
| plan-darkmode | ~21 | 5 | 0/3 | 3/3 |

## Patterns

- On replies often added risks the off reply lacked: random UUID index keys, fork in a multithreaded process, browsers cannot call gRPC directly, stream body reuse on retry, case-insensitive email index, CSP blocking an inline theme script.
- Off replies failed line one by opening with a heading or a disclaimer. The one on failure (plan-reset on 3) opened with a `# Plan:` heading.
- Drops cluster where the off reply had a long risk list (summarize-retry, plan-reset) and in warnings about a workaround or an alternative fix (debug-default-arg, debug-docker).
- Pairs are single samples, so some drops are run-to-run variation rather than the rules; no off-vs-off control was run.
