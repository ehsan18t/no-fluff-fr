# Changelog

Newest first. 0.1.0 predates this file.

<!--
A release is one commit: this entry plus the version in .claude-plugin/plugin.json, message "chore(plugin): release X.Y.Z". Installed copies update only when the version changes.
Write the entry from git log <previous release>..HEAD, the commit bodies and the task ledgers, never from memory. Find the previous release with git log --grep="release [0-9]".
One sentence per change a plugin user can notice, under Added, Changed, Fixed, Removed in that order, empty headings omitted. A fix to unreleased work folds into its feature. Refactors, tests, the eval harness and docs get no line.
Version: patch for fixes to released behavior, minor for anything added, removed or a reversed decision, major for a break to existing installs.
Never rewrite a released entry, correct it in the next one. No em dashes, no hard wraps.
-->

## 0.2.0 - 2026-09-14

### Changed

- Replies are written for a mid-level engineer: what they already know or can see is left out, the rest is explained plainly with the reason.
- A line stays only if it changes what the reader does or decides, so facts with no consequence are no longer reported as warnings.
- No word or line cap in either direction, the test above sets the length.
- Session-start rules 41% smaller (7,967 to 4,688 bytes), per-prompt reminder 419 to 498 bytes.
