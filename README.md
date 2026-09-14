# no-smartass-bs

A Claude Code plugin that makes every reply short, skimmable and easy to act on. It injects a set of output rules into context at the start of every session and a one-line reminder on every prompt, so Claude writes the reply that way the first time. No skill to load, no second pass, no runtime, no setup.

## Install and manage

The commands below run in a terminal. The VS Code extension does not put `claude` on your PATH, so in the extension type `/plugins` in the prompt box instead: add the `ehsan18t/no-smartass-bs` marketplace there, then install, enable or disable the plugin.

### Install

```bash
claude plugin marketplace add ehsan18t/no-smartass-bs
claude plugin install no-smartass-bs
```

Inside a Claude Code session: `/plugin marketplace add ehsan18t/no-smartass-bs`, then `/plugin install no-smartass-bs`.

Restart Claude Code after installing. Installing is the only step: there are no settings and nothing else to run.

To try it without installing, start a session with the plugin loaded from a local clone:

```bash
claude --plugin-dir /path/to/no-smartass-bs
```

### Update

```bash
claude plugin marketplace update no-smartass-bs
claude plugin update no-smartass-bs
```

The first command fetches the latest version from GitHub, because third-party marketplaces do not update on their own by default. Restart Claude Code to apply the update.

### Uninstall

```bash
claude plugin uninstall no-smartass-bs
```

Inside a Claude Code session: `/plugin uninstall no-smartass-bs`.

### Disable

```bash
claude plugin disable no-smartass-bs
```

Inside a Claude Code session: `/plugin disable no-smartass-bs`.

## What it does

| Hook               | When                                                | Injects                                                                                 |
| ------------------ | --------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `SessionStart`     | every source: startup, resume, clear, compact, fork | [inject/session-start.md](inject/session-start.md), the full output rules               |
| `UserPromptSubmit` | every prompt                                        | [inject/every-prompt.md](inject/every-prompt.md), one sentence restating the core rules |

The rules come back after `/compact` and `/clear`, which drop or reset earlier context. The reminder keeps them from fading in long sessions.

Both hooks run `cat` on a file in the plugin directory. There is no Node or other runtime, and a failing hook never blocks the session: if `inject/session-start.md` is missing, the session starts and answers normally without the rules.

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

## Measuring the effect

The numbers below are for the shipped rules, measured on Opus 5 in fresh headless sessions isolated from your own settings and other plugins (`--setting-sources ""`, no tools, a temporary working directory), so the plugin is the only difference between the arms. The replies and scores are in [eval/results/0.2.0/](eval/results/0.2.0/). Each run costs real usage on your account.

### Length, structure and dropped caveats

`eval/run.mjs` runs 10 fixed prompts (explain, debug, compare, summarize, plan) 3 times each with the plugin off and on, and `eval/score.mjs` counts words and prose paragraphs. A reader, not the script, judges whether line one answers the question and whether a caveat stated with the plugin off is missing with it on. Those judgments are in `judgment.md` next to `metrics.md`.

```
node eval/run.mjs <label>
node eval/score.mjs <label>
```

| | Plugin off | Plugin on |
|---|---|---|
| Median words per reply | 398 | 284 (-29%) |
| Replies with a prose paragraph | 25/30 | 12/30 |
| Line one answers the question | 15/30 | 29/30 |
| Caveats dropped compared with the off reply | | 42 |

The rules tell the model to keep a line only if it changes what the reader does, so most of the 42 drops are intended. Some are not: "never log raw reset tokens" is missing from all three password-reset plans and CSRF protection from two. Each off/on pair is a single sample, so part of the difference is run-to-run variation.

### One finding, one point

`eval/split.mjs` runs two prompts that each report a single finding and counts the replies that break it into a heading or into separate bullets for its evidence, impact and question:

```
node eval/split.mjs <label>
```

12 of 18 replies split the finding: no headings, but the evidence and the consequence each got their own bullet.

## License

MIT
