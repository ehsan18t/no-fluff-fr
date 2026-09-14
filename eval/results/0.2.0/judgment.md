# Judgment: 0.2.0

A separate reader compared each plugin-on reply with the plugin-off reply of the same run number (30 pairs, both arms `claude-opus-5[1m]`), listing the caveats and risks the off reply stated and checking whether the on reply stated each one. It also checked whether line one of every reply answers the question. The burden was set against the plugin: when unsure whether an on reply covered a caveat, it counted as dropped.

Result: on replies dropped 42 caveats (4 high confidence, 19 medium, 19 low). Line one answered the question in 29/30 on replies against 15/30 off.

The 0.2.0 rules tell the model to keep a line only if it changes what the reader does, so many drops are by design. The ones that are not: "never log raw reset tokens" is missing from all three password-reset plans, CSRF protection from two, and the summarize-retry reviews lose the missing-tests note, the overwritten cancel signal and the unread 5xx bodies.

## Dropped caveats

| Prompt | Pair | Caveat | Confidence |
|---|---|---|---|
| explain-index | 1 | an index on a frequently updated column disables HOT updates and bloats the table | high |
| explain-index | 2 | index bloat and blocked HOT updates on frequently updated columns | medium |
| explain-index | 3 | a table that fits in a few pages is already nearly free to scan | high |
| explain-index | 3 | functions, leading wildcards, casts and wrong column order make the index unusable | high |
| explain-thread | 3 | a thread cannot be killed safely, a process can | low |
| debug-foreach | 1 | `Promise.all` rejects on the first failure, use `allSettled` to finish every write | low |
| debug-foreach | 3 | `allSettled` when one failure should not stop the others | low |
| debug-default-arg | 3 | the same bug applies to any mutable default such as `{}` or `set()` | low |
| debug-docker | 1 | `tail -f /dev/null` hides nginx crashes and blocks signals | medium |
| debug-docker | 1 | service managers do not fit containers, which run no init system | low |
| debug-docker | 2 | `tail -f /dev/null` keeps the container running while nothing serves requests | medium |
| debug-docker | 2 | log to stdout and stderr or `docker logs` shows nothing | low |
| compare-db | 1 | snapshot prices and addresses onto invoices so later edits do not change them | medium |
| compare-db | 1 | gapless invoice numbers need a transaction-safe counter | low |
| compare-db | 2 | store money as `NUMERIC` or integer cents, never float | medium |
| compare-rpc | 1 | do not run REST and gRPC on the same service boundary | low |
| summarize-retry | 1 | no jitter, so clients failing together retry at the same moments | medium |
| summarize-retry | 1 | `Retry-After` headers are ignored | medium |
| summarize-retry | 1 | the caller's `signal` is overwritten, so a call lasting minutes cannot be cancelled | medium |
| summarize-retry | 1 | a stream body cannot be resent on retry | medium |
| summarize-retry | 2 | unread 5xx bodies hold connections open | medium |
| summarize-retry | 2 | JSON parse errors are neither caught nor retried | medium |
| summarize-retry | 2 | the diff has no tests for the retry logic | high |
| summarize-retry | 3 | 429 is not retried | low |
| plan-reset | 1 | do not consume the token on GET, email scanners open links first | medium |
| plan-reset | 1 | never log raw tokens or reset URLs | medium |
| plan-reset | 1 | serve over HTTPS | low |
| plan-reset | 2 | set up SPF, DKIM and DMARC or the emails land in spam | medium |
| plan-reset | 2 | CSRF protection for cookie-session endpoints | medium |
| plan-reset | 2 | never log tokens, scrub them from request logs and error trackers | medium |
| plan-reset | 2 | do not log the user in automatically after the reset | low |
| plan-reset | 3 | the raw token never appears in logs | medium |
| plan-reset | 3 | CSRF interaction with cookie auth | low |
| plan-reset | 3 | HTTPS only | low |
| plan-reset | 3 | generate the token with `crypto.randomBytes`, never `Math.random` or UUIDv1 | low |
| plan-darkmode | 1 | check WCAG AA contrast for text, borders and focus states | low |
| plan-darkmode | 1 | do not show the state by color alone | low |
| plan-darkmode | 2 | color transitions animate the whole page on theme switch | medium |
| plan-darkmode | 2 | check WCAG AA contrast | low |
| plan-darkmode | 3 | skip the transition for reduced motion and first load | medium |
| plan-darkmode | 3 | check WCAG AA contrast | low |
| plan-darkmode | 3 | shadows, borders and logos often look wrong on dark | low |

## Per prompt

Caveat sums are approximate because the line between a caveat and a recommendation is a judgment call. Dropped and line-one columns are exact.

| Prompt | Caveats off (sum of 3) | Dropped on | Line one answers, off | on |
|---|---|---|---|---|
| explain-index | ~26 | 4 | 0/3 | 3/3 |
| explain-thread | ~16 | 1 | 0/3 | 3/3 |
| debug-foreach | ~12 | 2 | 3/3 | 3/3 |
| debug-default-arg | ~9 | 1 | 2/3 | 3/3 |
| debug-docker | ~9 | 4 | 3/3 | 3/3 |
| compare-db | ~10 | 3 | 3/3 | 3/3 |
| compare-rpc | ~9 | 1 | 3/3 | 3/3 |
| summarize-retry | ~25 | 8 | 1/3 | 3/3 |
| plan-reset | ~32 | 11 | 0/3 | 2/3 |
| plan-darkmode | ~22 | 7 | 0/3 | 3/3 |

## Patterns

- On replies also add risks the off reply lacked: random UUID index keys, fork in a multithreaded process holding locks, a strict CSP blocking an inline theme script, a per-instance rate limiter, email uniqueness.
- Every off line-one failure opens with a heading instead of an answer. The one on failure (plan-reset on 2) opens with a `# Plan:` heading before its summary.
- Each pair is a single sample and no off-vs-off control was run, so some drops are run-to-run variation rather than the rules.
