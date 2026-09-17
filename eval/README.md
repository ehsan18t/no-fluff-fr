# Testing the rules

One command compares the rules in the working tree with the rules of the last release, on the same prompts, in fresh headless sessions, and prints one result. Nothing is stored in the repo: run it, read it, and if you want to verify a claim, run it again.

```bash
node eval/run.mjs small
```

## What is being tested

The plugin injects `inject/session-start.md` and `inject/every-prompt.md` into every session. The only thing it can change is how Claude writes its replies. So the test generates replies with the old rules and with the new rules and compares them. The prompts hand the model a situation and the facts it knows, the way a real session would, and ask for the message to the user. Five kinds:

| Kind | Prompts | What a good reply does |
|---|---|---|
| task | small, medium, large, copy-rules, amend-release, rename-key | Line one says what changed and where. Then only what the user did not ask for, what was skipped or failed, and risks. Nothing else. |
| question | ask-rename | Line one is the question. Options one per line with their cost, the recommended one first with its reason. |
| explanation | explain-leak | The cause first, then the fix, in sentences read once, with the exact names. |
| finding | version-bump, cache-ttl | One finding reported as one item, not chopped into Evidence, Impact and Fix parts. |
| general | ten explain, debug, compare, summarize and plan questions | Answer first, no padding, the caveats that change what the reader does. |

The task prompts carry the noise a real session produces (checks it ran, its own notes, a step the user said they would take), so the test measures what gets filtered out, and each has a must-have list, so the test also measures what must not be filtered out.

## Why two versions and not a score

A number for one version means nothing on its own. What matters is whether a rule change made replies better or worse, so every run generates both arms with the same prompts, the same model and the same isolation (`--tools ""`, `--setting-sources ""`, an empty working directory), and only the rules differ. The old arm is the last commit whose message starts with `chore(plugin): release`, checked out into a temporary git worktree. `--base <ref>` compares against any other commit.

## How the replies are scored

Two ways, because each catches what the other cannot.

**Counts.** A script counts what a script can count, so anyone gets the same number from the same replies: words, must-have facts found by keyword, whether line one is one sentence, sentences over 25 words, bullets without a bold label or code, headings over three words or with a letter in brackets, code letters that do not match their heading, semicolons, offer phrases, jargon copied from the prompt's notes. These measure form. They cannot tell whether a line is worth reading.

**Judge.** A second headless Claude gets the request, the facts, the must-have list and the two replies labeled A and B, without knowing which is old, and names the better one on five criteria: complete, no noise, skimmable, readable, line one does its job. Each pair is judged twice with the labels swapped, and a disagreement counts as a tie, which removes the judge's habit of favoring the first reply. It quotes the missing facts and the noise lines it saw, so a verdict can be checked in seconds. A judge's verdict can move by one between runs. The counts do not. That is why both are printed.

## Which model runs, and how it is reported

Both arms run on the same writer model, so the model is never a variable in an old-versus-new comparison. The default is `claude-opus-5`, because the plugin exists to improve Opus 5's output, so the eval measures replies on Opus 5. Pass `--model <id>` to test another model, and `--judge-model <id>` to judge with a different one. The judge defaults to the writer model. Reasoning effort is pinned to `high` for every session, so the model reasons the same in each. Pass `--effort <level>` (low, medium, high, xhigh, max) to change it.

Every `claude` session also bills a small fixed background model (Haiku) for internal work, which is not the writer. The result header prints the writer separately from that background model, choosing the writer as the model that produced the reply text (the most output tokens). Each saved reply file begins with a `<!-- writer: <id> -->` line, so opening a reply tells you which model wrote it. If the writer is ever not the same across all sessions, for example an Opus overload fell back to a smaller model, the run prints a WARNING, because a mixed-model comparison is invalid.

## Levels

| Level | Prompts | Runs each | Replies per version | Cost, both versions, judge on |
|---|---|---|---|---|
| tiny | the three task reports | 1 | 3 | about $0.70 |
| small | + the question and the explanation | 1 | 5 | about $1.10 |
| medium | + the three older task reports | 2 | 16 | about $3.50 |
| large | + the two single-finding prompts | 3 | 30 | about $6.60 |
| xl | + the ten general prompts | 3 | 60 | about $13 |

Each prompt in `prompts.json` has a tier, and a level runs every prompt whose tier is at or below its own. Costs are estimates from earlier runs on Opus 5. `--dry-run` prints the plan and the estimate without running anything.

## Reading the result

- Every counts row says which direction is good. Words should drop only if no fact went missing.
- The judge table is wins per criterion. Five prompts at one run each is five samples: one win either way is chance, a sweep across prompts is a signal.
- The quoted missing facts and noise lines are where the next rule change comes from. A missing fact means a rule cuts too much. A noise line that survives means a rule does not bite. A count that regresses (semicolons, unlabeled bullets) usually means an example in the rules file contradicts the rule, because the model copies examples harder than it obeys rules.
- Replies are written to the temp folder printed in the header. Read a pair side by side when a verdict surprises you.

## Improving the rules

1. Change the rule file, keep the gate green (`node scripts/check.mjs`).
2. Run `tiny` or `small` and read the replies, not just the numbers. If they look wrong to you, fix the rule before spending on a bigger level.
3. Run `medium` or larger before a release.
4. If a metric matters and nothing counts it, add a count here rather than trusting the judge with it. If a prompt kind you use every day is missing, add a prompt with a must-have list.

## Options

```text
--base <ref>        compare against this commit instead of the last release
--model <id>        writer model (default: claude-opus-5)
--effort <level>    reasoning effort: low, medium, high, xhigh, max (default: high)
--judge-model <id>  judge model (default: same as the writer)
--no-judge          counts only
--reps N            runs per prompt
--only id,id        a subset of the level's prompts
--out file.md       also write the result as Markdown
--dry-run           plan and cost only
--replies <dir>     rescore a previous run's replies (the folder it printed) without generating
```
