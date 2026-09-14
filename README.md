# no-smartass-bs

A Claude Code plugin that makes every reply short, skimmable and easy to act on. It injects a set of output rules into context at the start of every session and a one-line reminder on every prompt, so Claude writes the reply that way the first time. No skill to load, no second pass, no runtime, no setup.

## Install

```
/plugin marketplace add ehsan18t/no-smartass-bs
/plugin install no-smartass-bs@no-smartass-bs
```

Restart Claude Code after installing. Installing is the only step: there are no settings and nothing else to run.

To try it without installing, start a session with the plugin loaded from a local clone:

```
claude --plugin-dir /path/to/no-smartass-bs
```

## Turn it off

```
/plugin disable no-smartass-bs
```

Or from a terminal: `claude plugin disable no-smartass-bs`. There are no per-project settings; the plugin is either enabled or disabled.

## What it does

| Hook | When | Injects |
|---|---|---|
| `SessionStart` | every source: startup, resume, clear, compact, fork | [rules.md](rules.md), the full output rules |
| `UserPromptSubmit` | every prompt | [reminder.md](reminder.md), one sentence restating the core rules |

The rules come back after `/compact` and `/clear`, which drop or reset earlier context. The reminder keeps them from fading in long sessions.

Both hooks run `cat` on a file in the plugin directory. There is no Node or other runtime, and a failing hook never blocks the session: if `rules.md` is missing, the session starts and answers normally without the rules.

## Requirements and platform status

No runtime. Claude Code (CLI or VS Code extension) is the only requirement.

| Setup | Status |
|---|---|
| Windows with Git for Windows, CLI | Verified: new session, resume, fork, clear, compact, reminder on every prompt, Node absent from PATH |
| Windows with the hook run by PowerShell | Verified that the same `cat` command works when a hook runs under PowerShell 7 (Claude Code rewrites `${CLAUDE_PLUGIN_ROOT}` for PowerShell). Not verified on a machine with no Git for Windows installed |
| macOS, CLI | Not verified, expected to work (`cat` is built in) |
| Linux, CLI | Not verified, expected to work |
| VS Code extension, any OS | Not verified. Hooks run the same way as in the CLI |

If the rules seem missing on your setup, run `claude --debug` and look for the `SessionStart` hook result, or open `/hooks`.

## Editing the rules

- `rules.md` must stay under 8,000 bytes. Claude Code cuts a single hook's output above roughly 10 KB down to a short preview, so a larger file would arrive incomplete without any error.
- `reminder.md` must stay under 500 bytes, because it is paid for on every prompt.
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

Results are written to `eval/results/<label>/`. Each run of the full set costs real usage on your account.

## Known limits

- The ~10 KB per-hook output limit is not documented. A Claude Code update could lower it, so rerun a marker check after major updates.
- A hook that fails (for example, a shell that cannot run `cat`) is silent: no rules and no visible error.
- The lean-orchestration plugin injects similar output rules. With both installed, the rules are paid for twice and the two copies can differ in wording.
- Shorter replies are only better if they keep every warning. The measurement checks that no reply drops a caveat or risk that the plugin-off reply stated.

## License

MIT
