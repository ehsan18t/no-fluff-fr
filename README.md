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

`eval/` runs 10 fixed prompts (explain, debug, compare, summarize, plan) several times with the plugin off and on, each in a fresh headless session isolated from your own settings and other plugins, then scores the replies:

```
node eval/run.mjs <label>
node eval/score.mjs <label>
```

Results are written to `eval/results/<label>/`. Each run of the full set costs real usage on your account. A reader, not the script, judges whether line one answers the question and whether any caveat was dropped; those judgments are in `judgment.md` next to the metrics.

Results so far (Opus 5, 3 runs per prompt per arm, the same 30 plugin-off replies for both labels):

|                                             | Plugin off | On, [baseline](eval/results/baseline/) rules | On, [tuned](eval/results/tuned/) rules (shipped) |
| ------------------------------------------- | ---------- | -------------------------------------------- | ------------------------------------------------ |
| Median words per reply                      | 398        | 309 (-22%)                                   | 338 (-15%)                                       |
| Replies with a prose paragraph              | 25/30      | 3/30                                         | 6/30                                             |
| Line one answers the question               | 15/30      | 29/30                                        | 28/30                                            |
| Caveats dropped compared with the off reply |            | 20                                           | 12                                               |

The goal of zero dropped caveats is not met yet. Remaining drops sit in long lists of failure cases and security checks. Each off/on pair is a single sample, so part of the difference is run-to-run variation.

## License

MIT
