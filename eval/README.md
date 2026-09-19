# Testing the rules

One command runs the same prompts with no plugin, with the old rules and with the new rules, in fresh headless sessions, and prints one result.

```bash
node eval/run.mjs small
```

Two things are kept. `result.json` lands beside the replies in the temp folder and holds every number the run measured. `RESULT.md` in this folder is the committed record of the latest whole judged level, and it is what the main README links to. A partial run leaves it alone and says so: a subset via `--only`, an unjudged rescore, or any run with a failed session would otherwise replace the headline numbers with something narrower.

The terminal always prints the real path to the replies, so you can open them or paste the rescore command straight back in. Files are different: `RESULT.md`, `--out` and `result.json` carry the folder name only, because an absolute temp path has the username of whoever ran it in it and those files get committed and shared. `--paths` puts the real path into them too, and warns you when it writes `RESULT.md`.

`node eval/report.mjs <result.json>` re-renders a saved run in the current format without starting a session. That is what keeps old runs comparable after the report changes.

## What is being tested

The plugin injects `inject/session-start.md` and `inject/every-prompt.md` into every session. The only thing it can change is how Claude writes its replies. So the test generates replies with no plugin, with the old rules and with the new rules, and compares the new rules against each of the other two. The prompts hand the model a situation and the facts it knows, the way a real session would, and ask for the message to the user. Five kinds:

| Kind | Prompts | What a good reply does |
|---|---|---|
| task | small, medium, large, copy-rules, amend-release, rename-key | Line one says what changed and where. Then only what the user did not ask for, what was skipped or failed, and risks. Nothing else. |
| question | ask-rename | Line one is the question. Options one per line with their cost, the recommended one first with its reason. |
| explanation | explain-leak | The cause first, then the fix, in sentences read once, with the exact names. |
| finding | version-bump, cache-ttl | One finding reported as one item, not chopped into Evidence, Impact and Fix parts. |
| general | ten explain, debug, compare, summarize and plan questions | Answer first, no padding, the caveats that change what the reader does. |

The task prompts carry the noise a real session produces (checks it ran, its own notes, a step the user said they would take), so the test measures what gets filtered out, and each has a must-have list, so the test also measures what must not be filtered out, and a noise list, so what should be filtered out is counted the same way on every run.

## Why three versions and not a score

A number for one version means nothing on its own. What matters is whether a rule change made replies better or worse, and what the rules change at all. So every run generates three sets of replies with the same prompts, the same model and the same isolation (`--tools ""`, `--setting-sources ""`, an empty working directory): no plugin, the old rules, the new rules. The no-plugin replies are the bare model's, the reference the other two are measured against; a count where the new rules do worse than no plugin is a rule that backfires, and the report lists it under Regressions. Which two sets of rules those are depends on `inject/`. While a file in it differs from the last release, committed or not, the old rules are that release and the new rules are the working tree, named by the short HEAD hash because the next version has no number yet. While nothing in it differs, the working tree has nothing new to measure, so the old rules are the release before the last one and the new rules are the last release, both named by version. A release is a tag `X.Y.Z`, or, for the releases from before tags, a commit whose message starts with `chore(plugin): release`. Every set that is a commit is checked out into a temporary git worktree. `--base <ref>` takes the old rules from any other commit and the new ones from the working tree. `--no-baseline` skips the no-plugin replies for a cheap rules iteration; a run without it never replaces `RESULT.md`.

## How the replies are scored

Two ways, because each catches what the other cannot.

**Counts.** A script counts what a script can count, so anyone gets the same number from the same replies: words, must-have facts found by keyword, noise lines kept, whether line one is one sentence, headings over a single item, sentences over 25 words, bullets without a bold label or code, headings over three words or with a letter in brackets, code letters that do not match their heading, semicolons, jargon copied from the prompt's notes. A noise line is the mirror of a must-have fact: each task prompt lists, under `noise` in `prompts.json`, the lines from its own facts that the rules say must go (a check that found nothing, the assistant's own notes, a step the user said they would take), each with keywords, and the script counts the ones a reply kept. A heading over a single item is a heading whose section is exactly one top-level bullet. These measure form and known lines. They cannot tell whether any other line is worth reading.

**Judge.** A second headless Claude gets the request, the facts, the must-have list and one reply, without knowing which rules wrote it, and passes or fails it on seven criteria: complete, no noise, skimmable, readable, line one does its job, each extra names the change and stops, no offers. It is told who the reader is (a developer who reads for under a minute and may stop at any line), and its noise criterion is built from the rules' What goes in section: what is noise (the story of how the work was checked, a restated request, a confirmation that something is unchanged, a closing next action that repeats a line above) and what is not (a check result with its numbers, a risk, anything not run, the reason for a decision, the downside of a workaround, a heading, a label, a code), so a line the rules require is never scored as noise. An extra is a change made without being asked. How one is written is its own criterion, not a script count, because a phrase list cannot read meaning: it fails when it says again that it was not asked for. Those ways are one list, `EXTRA_FAILS` in `run.mjs`, so a new one is one more line and the report keeps its shape. Offers are a criterion of their own, wherever they sit: an offer of more work at the end, or an offer or hint inside an item that something can be undone, reverted, split or dropped. The judge gets examples, not a list to match, because a phrase list misses the next wording. Every offer goes to Offers, any other fault of an extra to Extras, the rest to Noise, so one line never costs two tests. The script then counts the lines the judges quoted under those three, once per reply even when both judges quote the same line, and prints them as rows of the Counts table: the judge decides what an offer is, the script only counts. A fail must quote the line that breaks the criterion (the first 12 words, verbatim) or name the missing fact; a fail with nothing quoted is turned into a pass, so every fail in the report can be checked in seconds. Each reply is graded alone, so there is nothing to tie and no label order to bias the judge, and every version gets the same unit: replies that passed, out of the replies graded. Each reply is graded by two judges, two sessions of the same model with the same prompt, and a test (one reply on one question) passes only when both judges pass it, so a disagreement between them is a fail. The table cell is `X [Y]`: X tests passed, Y where both judges agreed, which is how often the judge model agrees with itself. A low Y means the question is unclear to the judge, not that the version did badly. Every grade is saved in `result.json` with the judge's reason and quotes, and the report lists each test the new rules fail where the old rules pass, with the quote. A judge's grade can move by one between runs. The counts do not. That is why both are printed.

## Which model runs, and how it is reported

Every reply comes from the same writer model, so the model is never a variable in the comparison. The default is `claude-opus-5`, because the plugin exists to improve Opus 5's output, so the eval measures replies on Opus 5. Pass `--model <id>` to test another model, and `--judge-model <id>` to judge with a different one. The judge defaults to the writer model. Reasoning effort is pinned to `high` for every session, so the model reasons the same in each. Pass `--effort <level>` (low, medium, high, xhigh, max) to change it.

Every `claude` session also bills a small fixed background model (Haiku) for internal work, which is not the writer. The result header prints the writer separately from that background model, choosing the writer as the model that produced the reply text (the most output tokens). Each saved reply file begins with a `<!-- writer: <id> -->` line, so opening a reply tells you which model wrote it. If the writer is ever not the same across all sessions, for example an Opus overload fell back to a smaller model, the run prints a WARNING, because a mixed-model comparison is invalid.

## Levels

| Level | Prompts | Runs each | Replies per version | Sessions, three versions, judge on |
|---|---|---|---|---|
| tiny | the three task reports | 1 | 3 | 9 writer, 18 judge |
| small | + the question and the explanation | 1 | 5 | 15 writer, 30 judge |
| medium | + the three older task reports | 2 | 16 | 48 writer, 96 judge |
| large | + the two single-finding prompts | 3 | 30 | 90 writer, 180 judge |
| xl | + the ten general prompts | 3 | 60 | 180 writer, 360 judge |

Each prompt in `prompts.json` has a tier, and a level runs every prompt whose tier is at or below its own. Every session spends usage on your account. When the run is done it prints what it used in tokens, per role, output apart from input with the cached share, and keeps the same numbers in `result.json`. Tokens rather than dollars because they hold their meaning whether you pay per token or by subscription.

## Reading the result

- Every counts row says which direction is good. Words should drop only if no fact went missing.
- The no-plugin column is the size of the effect: what the same model writes with no rules at all. The gap between the old and the new column is what the last rule change did.
- The judge table is one cell per version, `X [Y]`: X tests passed, Y where both judges agreed. Five prompts at one run each is five samples: one pass either way is chance, a gap across most rows is a signal. A low Y means the criterion itself is unclear to the judge.
- The quoted lines under Regressions and Evidence are where the next rule change comes from. A missing fact means a rule cuts too much. A noise line that survives means a rule does not bite. A count that regresses (semicolons, unlabeled bullets) usually means an example in the rules file contradicts the rule, because the model copies examples harder than it obeys rules.
- Replies are written to the temp folder printed in the header. Read two versions' replies side by side when a grade surprises you.

## Improving the rules

1. Change the rule file, keep the gate green (`node scripts/check.mjs`).
2. Run `tiny` or `small` and read the replies, not just the numbers. If they look wrong to you, fix the rule before spending on a bigger level.
3. Run `medium` or larger before a release.
4. If a metric matters and nothing counts it, add a count here rather than trusting the judge with it. If a prompt kind you use every day is missing, add a prompt with a must-have list.

## Options

```text
--base <ref>        take the old rules from this commit and the new ones from the working tree
--no-baseline       skip the no-plugin replies
--model <id>        writer model (default: claude-opus-5)
--effort <level>    reasoning effort: low, medium, high, xhigh, max (default: high)
--judge-model <id>  judge model (default: same as the writer)
--no-judge          counts only
--reps N            runs per prompt
--only id,id        a subset of the level's prompts
--out file.md       also write the result as Markdown
--json              print the result object instead of the report
--paths             put the real replies path into the files this writes, not just the terminal
--label <text>      what to call the new rules (default: the version when they are a release, else the short HEAD hash)
--replies <dir>     rescore a previous run's replies (the folder it printed) without generating
```

`node eval/report.mjs <result.json>` renders a saved result on its own. It reads no files but the one you name, runs no sessions, and computes nothing, so changing how the report reads can never change what it says.
