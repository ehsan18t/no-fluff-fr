# Task-report test: 0.2.1

18 replies, median 87 words. A reader counts the lines the user does not act on in `report-judgment.md`.

| Prompt | Run | Words | Lines | Bullets | Code blocks |
|---|---|---|---|---|---|
| copy-rules | 1 | 114 | 4 | 2 | 0 |
| copy-rules | 2 | 99 | 4 | 3 | 0 |
| copy-rules | 3 | 101 | 3 | 2 | 0 |
| copy-rules | 4 | 100 | 6 | 5 | 1 |
| copy-rules | 5 | 104 | 4 | 3 | 0 |
| copy-rules | 6 | 123 | 4 | 3 | 1 |
| amend-release | 1 | 80 | 2 | 1 | 0 |
| amend-release | 2 | 59 | 2 | 1 | 0 |
| amend-release | 3 | 80 | 2 | 1 | 0 |
| amend-release | 4 | 67 | 2 | 1 | 0 |
| amend-release | 5 | 75 | 3 | 2 | 0 |
| amend-release | 6 | 75 | 2 | 1 | 0 |
| rename-key | 1 | 85 | 3 | 2 | 0 |
| rename-key | 2 | 96 | 3 | 2 | 0 |
| rename-key | 3 | 79 | 3 | 2 | 0 |
| rename-key | 4 | 91 | 4 | 3 | 0 |
| rename-key | 5 | 88 | 3 | 2 | 0 |
| rename-key | 6 | 86 | 4 | 3 | 0 |

## Must-have items per prompt

- copy-rules: the release commit format was kept as release: X.Y.Z; the previous-release grep was changed to match it; the two rules the source lacks are gone; nothing is committed
- amend-release: the new commit hash 3366f99; the output-length.mjs line was kept against the new rules and the user can delete it
- rename-key: the fallback that still reads the old key with a deprecation warning, which was not asked for; docs/config.md still shows the old key in a generated section; commit 4c1e2ab

## Replies

### copy-rules 1

````markdown
CHANGELOGS.md now uses the no-smartass-bs intro line and rules block. The 0.7.0 to 0.9.0 entries are unchanged, and nothing is committed.

Two places differ from a literal copy:

- The release commit format stays `release: X.Y.Z`, and the previous-release lookup is `git log --grep="^release: [0-9]"` to match it. The copied `--grep="release [0-9]"` finds only 0.8.0 here, so the next entry would have repeated everything since 0.8.1.
- Two rules from the old file are gone because the source doesn't have them. One said to rewrite the entry when the version already exists after an undone release. The other said to check that plugin.json matches the last release commit before releasing. Say if you want them kept.
````

### copy-rules 2

````markdown
Copied the no-smartass-bs intro line and rules block into `CHANGELOGS.md`. Nothing is committed.

- The release commit format stays `release: X.Y.Z`, because every release from 0.4.0 to 0.9.0 uses it.
- The previous-release lookup is now `git log --grep="^release: [0-9]"`. The copied `release [0-9]` matches only 0.8.0 here, so the next entry would repeat everything since 0.8.1.
- Two rules this repo had are gone because the source lacks them: rewrite an existing entry after an undone release, and check that `plugin.json` matches the last release commit before releasing. Without the second, a version mismatch is no longer caught before a release.
````

### copy-rules 3

````markdown
CHANGELOGS.md now has the no-smartass-bs intro line and rules block. Nothing is committed.

- The release commit format stays `release: X.Y.Z`, because every release here uses it. The previous-release command is now `git log --grep="^release: [0-9]"` to match it. The copied grep finds only 0.8.0 here, so the next entry would have repeated everything since 0.8.1.
- Two old rules are gone because the source does not have them: rewrite the entry when a release attempt was undone and the version already exists, and check that plugin.json matches the last release commit before releasing. Add them back if you still want those checks.
````

### copy-rules 4

````markdown
The rules in CHANGELOGS.md now match no-smartass-bs, with the 0.7.0 to 0.9.0 entries unchanged. Nothing is committed.

- **Release commit format:** kept this repo's `release: X.Y.Z` instead of the copied `chore(plugin): release X.Y.Z`.
- **Previous-release grep:** changed to match that format. The copied `--grep="release [0-9]"` finds only 0.8.0 here, so the next entry would have repeated everything since 0.8.1.
  ```
  git log --grep="^release: [0-9]"
  ```
- **Two rules removed** because the source doesn't have them. Restore them if you still want them:
  - Rewrite the entry when an undone release attempt already added that version.
  - Before a release, check that plugin.json and the last release commit show the same version.
````

### copy-rules 5

````markdown
Replaced the intro line and rules block in `CHANGELOGS.md` with the no-smartass-bs ones. Not committed.

- The release commit format stays `release: X.Y.Z`, not the copied `chore(plugin): release X.Y.Z`, to match every release here since 0.4.0.
- The previous-release lookup is now `git log --grep="^release: [0-9]"`. The copied grep matches only 0.8.0 here, so the next entry would have repeated everything since 0.8.1.
- Two rules this repo had are gone because the source lacks them: rewriting the entry when a release attempt was undone and the version already exists, and checking that `plugin.json` matches the last release commit before releasing. Say if you want them back.
````

### copy-rules 6

````markdown
CHANGELOGS.md now has the no-smartass-bs intro line and rules, with two deliberate differences from a literal copy. Nothing is committed.

- The release commit format stays `release: X.Y.Z` because every release here uses it. I changed the command for finding the previous release to match. The copied grep only finds 0.8.0 in this repo, so the next entry would have repeated everything since 0.8.1.

  ```
  git log --grep="^release: [0-9]"
  ```

- Two rules from the old file are gone because no-smartass-bs doesn't have them. One said to rewrite the entry if the version already exists after an undone release. The other said to check that plugin.json matches the last release commit. Put them back if this repo still needs either one.
- The 0.7.0 to 0.9.0 entries are unchanged, as you chose.
````

### amend-release 1

````markdown
Amended the 0.9.0 release commit to 3366f99, replacing 79bb5e8. The changelog rules and the 0.9.0 entry are in the new format, and the older entries are unchanged. Not pushed.

- The Removed section keeps a line saying scripts/output-length.mjs is gone, even though the new rules say eval tooling gets no line. I kept it because the README used to tell users to run that script, so they may look for it. Delete the line if you count it as eval tooling.
````

### amend-release 2

````markdown
Amended the 0.9.0 release commit with the changelog change: 3366f99 replaces 79bb5e8, not pushed.

- I kept the `scripts/output-length.mjs` line under Removed even though the new rules exclude eval tooling. The README used to tell users to run that script, so they need to know it is gone. Delete that line before pushing if you count it as eval tooling.
````

### amend-release 3

````markdown
The 0.9.0 entry in `CHANGELOGS.md` is rewritten in the new format and folded into the release commit, now `3366f99` (was `79bb5e8`). Nothing is pushed yet.

- I kept the Removed line for `scripts/output-length.mjs` even though the new rules say eval tooling gets no changelog line. The README used to tell users to run that script, so they need a way to learn it is gone. If you count it as eval tooling, delete that line and amend again before you push.
````

### amend-release 4

````markdown
Amended the release commit with the new changelog rules and the rewritten 0.9.0 entry: it is now 3366f99 (was 79bb5e8), same parent and author date, not pushed.

- I kept the Removed line for `scripts/output-length.mjs` even though the new rules say eval tooling gets no line, because the README used to tell users to run it. Delete that line before pushing if you count it as eval tooling.
````

### amend-release 5

````markdown
Amended the 0.9.0 release commit with the new changelog rules and the 0.9.0 entry rewritten in the new format. It is now 3366f99, replacing 79bb5e8.

- I kept the Removed line for `scripts/output-length.mjs` even though the new rules say eval tooling gets no line. The README used to tell users to run it, so they may notice it is gone. Delete that line if you count it as eval tooling.
- Not pushed. origin still has 79bb5e8.
````

### amend-release 6

````markdown
The 0.9.0 release commit is amended to 3366f99, replacing 79bb5e8. It contains the new changelog rules and the 0.9.0 entry rewritten in the new format. Not pushed.

- I kept the `scripts/output-length.mjs` removal line even though the new rules exclude eval tooling. The README used to tell users to run that script, so they should hear it is gone. If you count it as eval tooling, delete that line and amend again before the force push.
````

### rename-key 1

````markdown
Renamed `cacheTtl` to `cache.ttlSeconds` across src, config, tests and README in commit 4c1e2ab.

- I added a fallback in `src/config.ts` you did not ask for: it still reads `cacheTtl` and logs a deprecation warning once. It keeps old configs working, and you can delete it if you want a hard break.
- `docs/config.md` still shows `cacheTtl` in one example. That section is marked as generated from a schema I could not find, so a hand edit would likely be overwritten. The schema needs updating wherever it lives.
````

### rename-key 2

````markdown
Renamed `cacheTtl` to `cache.ttlSeconds` across `src/config.ts`, `src/cache.ts`, both YAML configs, `test/cache.test.ts` and `README.md`, committed as 4c1e2ab. Tests and lint verified.

- I added a fallback you did not ask for: `src/config.ts` still reads `cacheTtl` and logs a deprecation warning once. Remove it if nothing outside this repo sets the old key.
- `docs/config.md` still shows `cacheTtl` in one example. That section is marked as generated from a schema, and I could not find the schema, so a hand edit would likely be overwritten. Next: point me to the schema or the generator so the rename reaches the docs.
````

### rename-key 3

````markdown
Renamed `cacheTtl` to `cache.ttlSeconds` across src, config, tests and README in commit 4c1e2ab.

- I added a fallback you did not ask for: `src/config.ts` still reads `cacheTtl` and logs a deprecation warning once. Delete it if nothing outside this repo sets the old key.
- `docs/config.md` still shows `cacheTtl` in one example. That section is marked as generated from a schema I could not find, so a hand edit would likely be overwritten. The schema needs the rename wherever it lives.
````

### rename-key 4

````markdown
Renamed `cacheTtl` to `cache.ttlSeconds` across src, config, tests and README in commit 4c1e2ab.

- I added a fallback you did not ask for: `src/config.ts` still reads `cacheTtl` and logs a deprecation warning once, so existing configs keep working. Remove it if you want old configs to fail instead.
- `docs/config.md` still shows `cacheTtl` in one example. That section says it is generated from a schema, and I could not find the schema, so I left it. Update the schema, or edit the doc by hand if no generator exists.
- Tests and lint verified.
````

### rename-key 5

````markdown
Renamed `cacheTtl` to `cache.ttlSeconds` across src, config, tests and README in commit 4c1e2ab. Tests and lint verified.

- I added a fallback you did not ask for: `src/config.ts` still reads `cacheTtl` and logs a deprecation warning once, so existing configs keep working. Remove it if you want old keys to fail.
- `docs/config.md` still shows `cacheTtl` in one example. That section says it is generated from a schema, and I could not find the schema, so a hand edit would likely be overwritten. Updating the schema source is the fix.
````

### rename-key 6

````markdown
Renamed `cacheTtl` to `cache.ttlSeconds` in src, config, tests and README, committed as 4c1e2ab.

- I added a fallback you did not ask for: `src/config.ts` still reads `cacheTtl` and logs a deprecation warning once. Remove it if nothing outside this repo sets the old key.
- `docs/config.md` still shows `cacheTtl` in one example. That section says it is generated from a schema, and I could not find the schema, so a hand edit would likely be overwritten. The schema needs the rename wherever it lives.
- Tests and lint verified.
````
