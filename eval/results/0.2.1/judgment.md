# Judgment: 0.2.1

A separate reader compared each plugin-on reply with the plugin-off reply of the same run number (30 pairs, both arms `claude-opus-5[1m]`), listing the caveats and risks the off reply stated and checking whether the on reply stated each one. It also checked whether line one of every reply answers the question. The burden was set against the plugin: when unsure whether an on reply covered a caveat, it counted as dropped, and a strictly narrower version counted as dropped.

Result: on replies dropped 51 caveats. Line one answered the question in 29/30 on replies against 15/30 off.

The rules tell the model to keep a line only if it changes what the reader does, so many drops are by design. The reader found no critical safety caveat dropped: host-header spoofing, timing and enumeration, hash-only token storage, session logout, non-idempotent retries and worst-case latency survive in every matched on reply. The drops that matter most: CSRF protection is missing from two of the three password-reset plans, "never log raw tokens" from one, and the downside of the `tail -f /dev/null` workaround from all three Docker answers.

## Dropped caveats

| Prompt | Pairs | Caveat | Confidence |
|---|---|---|---|
| explain-index | 2, 3 | functions, implicit casts and leading wildcards make the index unusable | medium |
| explain-index | 3 | a table that fits in a few pages is already nearly free to scan | medium |
| explain-index | 1 | queries returning most of the table, and bulk loads into an indexed table | low |
| explain-thread | 3 | a thread cannot be killed safely, a process can | low |
| explain-thread | 2 | free-threaded builds still meet an ecosystem that assumes the GIL | low |
| debug-foreach | 1 | `await saveAll(items)` resolves before the files are written | low |
| debug-foreach | 2 | `for...of` to cap how many files are open at once | low |
| debug-default-arg | 3 | a list the caller passes in is still mutated, copy it first | medium |
| debug-default-arg | 1, 2 | the same bug applies to any mutable default such as `{}` or `set()` | low |
| debug-docker | 1, 2, 3 | `tail -f /dev/null` keeps the container running while nginx is dead and blocks signals | medium |
| debug-docker | 1 | `STOPSIGNAL SIGQUIT` for graceful shutdown | low |
| debug-docker | 1, 3 | service managers do not fit containers | low |
| compare-db | 1, 2, 3 | snapshot prices and addresses onto the invoice so later edits do not change it | medium |
| compare-db | 2 | invoices must be immutable, sequentially numbered and auditable | medium |
| compare-db | 2 | MongoDB fits when writes must scale horizontally from the start | medium |
| compare-db | 1 | gapless invoice numbers where the jurisdiction requires them | low |
| summarize-retry | 2, 3 | unread 5xx bodies hold connections open | medium |
| summarize-retry | 2 | the caller's `signal` is overwritten, so callers cannot cancel | medium |
| summarize-retry | 1 | a stream body cannot be resent on retry | medium |
| summarize-retry | 1, 2, 3 | the diff has no tests | low |
| summarize-retry | 2 | `Retry-After` is ignored | low |
| plan-reset | 2, 3 | CSRF protection for cookie-session endpoints | medium |
| plan-reset | 1 | do not consume the token on GET, email scanners open links first | medium |
| plan-reset | 1 | never log raw tokens or reset URLs | medium |
| plan-reset | 1, 3 | serve over HTTPS | low |
| plan-reset | 3 | generate the token with `crypto.randomBytes`, never `Math.random` or UUIDv1 | low |
| plan-reset | 2 | do not log the user in automatically after the reset | low |
| plan-darkmode | 1, 2, 3 | check WCAG AA contrast in dark mode | low |
| plan-darkmode | 2 | color transitions animate the whole page on theme switch | medium |
| plan-darkmode | 3 | skip the transition for reduced motion and first load | low |
| plan-darkmode | 1 | update `meta theme-color`, keep the focus ring, do not signal state by color alone | low |

## Per prompt

Caveat sums are approximate because the line between a caveat and a recommendation is a judgment call. Dropped and line-one columns are exact.

| Prompt | Caveats off (sum of 3) | Dropped on | Line one answers, off | on |
|---|---|---|---|---|
| explain-index | ~26 | 5 | 0/3 | 3/3 |
| explain-thread | ~16 | 2 | 0/3 | 3/3 |
| debug-foreach | ~9 | 2 | 3/3 | 3/3 |
| debug-default-arg | ~9 | 3 | 2/3 | 3/3 |
| debug-docker | ~11 | 6 | 3/3 | 3/3 |
| compare-db | ~12 | 6 | 3/3 | 3/3 |
| compare-rpc | ~9 | 1 | 3/3 | 3/3 |
| summarize-retry | ~25 | 8 | 1/3 | 3/3 |
| plan-reset | ~31 | 8 | 0/3 | 2/3 |
| plan-darkmode | ~25 | 10 | 0/3 | 3/3 |

## Patterns

- On replies also add risks the off reply lacked: random UUID keys causing page splits, index builds locking or lagging replication, trusting the proxy behind a load balancer, mixed-case duplicate emails, the Decimal128 pitfall for money.
- Drops cluster in the off replies' checklist tails, which the on reply compresses away: the Docker workaround, the retry review's body-drain and no-tests notes, the reset plan's CSRF, HTTPS and logging lines, dark mode's contrast and theme-color lines.
- Every off line-one failure opens with a heading or a "could not read your code" disclaimer. The one on failure (plan-reset on 1) opens with that disclaimer.
- Each pair is a single sample and no off-vs-off control was run, so some drops are run-to-run variation rather than the rules. Different reader passes also count differently, so the total is comparable only within one pass.
