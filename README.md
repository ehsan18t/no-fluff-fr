# no-fluff-fr

A Claude Code plugin that makes every reply short, skimmable and easy to act on. It injects a set of output rules into context at the start of every session and a one-line reminder on every prompt, so Claude writes the reply that way the first time. No skill to load, no second pass, no runtime, no setup.

## Install and manage

The commands below run in a terminal. The VS Code extension does not put `claude` on your PATH, so in the extension type `/plugins` in the prompt box instead: add the `ehsan18t/no-fluff-fr` marketplace there, then install, enable or disable the plugin.

### Install

```bash
claude plugin marketplace add ehsan18t/no-fluff-fr
claude plugin install no-fluff-fr
```

Inside a Claude Code session: `/plugin marketplace add ehsan18t/no-fluff-fr`, then `/plugin install no-fluff-fr`.

Restart Claude Code after installing. Installing is the only step: there are no settings and nothing else to run.

To try it without installing, start a session with the plugin loaded from a local clone:

```bash
claude --plugin-dir /path/to/no-fluff-fr
```

### Update

```bash
claude plugin marketplace update no-fluff-fr
claude plugin update no-fluff-fr
```

The first command fetches the latest version from GitHub, because third-party marketplaces do not update on their own by default. Restart Claude Code to apply the update.

### Uninstall

```bash
claude plugin uninstall no-fluff-fr
```

Inside a Claude Code session: `/plugin uninstall no-fluff-fr`.

### Disable

```bash
claude plugin disable no-fluff-fr
```

Inside a Claude Code session: `/plugin disable no-fluff-fr`.

## What it does

| Hook               | When                                                | Injects                                                                                 |
| ------------------ | --------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `SessionStart`     | every source: startup, resume, clear, compact, fork | [inject/session-start.md](inject/session-start.md), the full output rules               |
| `UserPromptSubmit` | every prompt                                        | [inject/every-prompt.md](inject/every-prompt.md), one sentence restating the core rules |

The rules come back after `/compact` and `/clear`, which drop or reset earlier context. The reminder keeps them from fading in long sessions.

Both hooks run `cat` on a file in the plugin directory. There is no Node or other runtime, and a failing hook never blocks the session: if `inject/session-start.md` is missing, the session starts and answers normally without the rules.

## Does it work

The rules of 0.2.1 against the rules of 0.3.0, same prompts, same model, same isolation, 8 prompts x 2 replies per side. Every pair is judged twice with the labels swapped, and the judge is never told which side is which.

| | 0.2.1 | 0.3.0 |
|---|---|---|
| Blind judgments won | 13 | **36** |
| Replies you can skim to the point | 0 of 16 | **12 of 16** |
| Bullets with no label or code | 34 | **0** |
| Facts the reply had to state and did not | 3 | **0** |
| Phrases offering to do more | 4 | **9** |

The last row is a regression and it is here because hiding it would make the rest worth less. Replies also came out 7% longer, driven by two prompts. Neither the length nor the noise score separates the two versions: the judge split 8 to 7 on whether every line was worth reading, with both passes agreeing on all 16 pairs.

Written by `claude-opus-5` at reasoning effort `high` on both sides, so the model is never the variable. Judged by `claude-fable-5-1`, a different model from the writer, so a blind spot the writer has is not grading itself. Both are defaults you can change with `--model`, `--effort` and `--judge-model`.

Full result, including the quoted lines behind every number: [eval/RESULT.md](eval/RESULT.md). It is one run, so read a margin of 1 as a coin flip.

## Requirements and platform status

No runtime. Claude Code (CLI or VS Code extension) is the only requirement. On Windows, Claude Code runs the hooks in PowerShell 5.1 or later, or in Git Bash when Git for Windows is installed. On macOS and Linux it uses your default shell. All of them have `cat`.

| Setup                     | Status                                                                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Windows, CLI              | Verified: new session, resume, fork, clear, compact, reminder on every prompt, Node absent from PATH, and the same hook under PowerShell 7 |
| macOS, CLI                | Not verified                                                                                                                                |
| Linux, CLI                | Not verified                                                                                                                                |
| VS Code extension, any OS | Not verified                                                                                                                                |

If the rules seem missing on your setup, run `claude --debug` and look for the `SessionStart` hook result, or open `/hooks`.

## Editing the rules

- `inject/session-start.md` must stay under 8,000 bytes. Claude Code cuts a single hook's output above roughly 10 KB down to a short preview, so a larger file would arrive incomplete without any error.
- `inject/every-prompt.md` must stay under 500 bytes, because it is paid for on every prompt.
- Both files must be ASCII only, so Windows PowerShell cannot mis-decode them.

The gate checks all of this, plus that the manifests and `hooks/hooks.json` parse and every file the hooks reference exists. It runs in CI on every push:

```
node scripts/check.mjs
node --test scripts/check.test.mjs
```

## Testing a rule change

One command runs the same prompts with the last release's rules and with the working tree's rules, in fresh headless sessions, counts what a script can count, lets a blind judge compare each pair, and prints one result. It writes `result.json` beside the replies and, after a whole judged level, replaces [eval/RESULT.md](eval/RESULT.md). Each run spends real usage on your account, so `--dry-run` prints the plan first.

```bash
node eval/run.mjs small        # tiny | small | medium | large | xl
node eval/run.mjs small --dry-run
node eval/report.mjs <result.json>   # re-render any past run, no sessions
```

`node eval/run.mjs <level> --json` prints the measurement as an object instead of a report. Every number lives in that object, and [eval/report.mjs](eval/report.mjs) only formats it, so changing how the report reads can never change what it says.

What is tested, why, how to read the result and where the next improvement comes from: [eval/README.md](eval/README.md).

## License

MIT
