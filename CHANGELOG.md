# Changelog

Newest first. 0.1.0 predates this file.

<!--
A release is one commit: this entry plus the version in .claude-plugin/plugin.json, message "chore(plugin): release X.Y.Z", tagged X.Y.Z (git tag X.Y.Z, numbers and dots, no "v"). The eval finds releases by that tag. Installed copies update only when the version changes.
Write the entry from git log <previous release>..HEAD, the commit bodies and the task ledgers, never from memory. Find the previous release with git log --grep="release [0-9]".
One sentence per change a plugin user can notice, under Added, Changed, Fixed, Removed in that order, empty headings omitted. A fix to unreleased work folds into its feature. Refactors, tests, the eval harness and docs get no line.
Version: patch for fixes to released behavior, minor for anything added, removed or a reversed decision, major for a break to existing installs.
Never rewrite a released entry, correct it in the next one. No em dashes, no hard wraps.
-->

## 0.4.0 - 2026-09-19

### Changed

- The rules speak as you: "I" and "me" in place of "the reader".
- Replies make no offer of any kind, neither more work nor a way to undo something.
- A change you did not ask for is marked once, by an Extras heading or an Extra label, says what changed and stops.
- A task report keeps what was not tested or left undone, and drops confirmations of what stayed unchanged.
- A section holds two items or more, so a single item gets a label and no heading.
- A closing next action is left out when a line above already says it.
- Two sections are renamed to say what they hold: What to keep, what to cut, and When you finish a task.
- The task report example has a new topic, shows an extra and no longer ends in a next line.

## 0.3.0 - 2026-09-18

### Added

- A When you ask section: one question per message, line one is the question, options one per line with what each costs, the recommended one first.

### Changed

- The plugin is renamed to no-fluff-fr.
- Every section and list leads with its most valuable line, in the words a developer already uses.
- One item per line, opened by a bold label or a code, with headings of one or two developer words and checks reported as a single line with its numbers.
- Sentences carry one fact each, name things exactly and in backticks, use the codebase's own names, drop words from the model's working method, and give a reason only where you would ask why.
- Reference codes take their letter from the title of the list they belong to, and one list holds one kind of item.
- The reminder on every prompt speaks as you, not about you.

### Removed

- The aliases scr, eli, foc and ref.

## 0.2.1 - 2026-09-15

### Fixed

- After a task, the reply is what changed and where, then only the calls you did not ask for, anything that failed or was not run, and risks that change the plan: no check narration, no pasted content, no repeated request, no notes of its own, no command you said you would run.
- A single finding is split less often into separate bullets for its evidence and its consequence.

## 0.2.0 - 2026-09-14

### Changed

- Replies are written for a mid-level engineer: what they already know or can see is left out, the rest is explained plainly with the reason.
- A line stays only if it changes what the reader does or decides, so facts with no consequence are no longer reported as warnings.
- No word or line cap in either direction, the test above sets the length.
- Session-start rules 41% smaller (7,967 to 4,688 bytes), per-prompt reminder 419 to 498 bytes.
