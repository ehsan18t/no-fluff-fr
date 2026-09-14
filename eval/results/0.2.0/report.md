# Task-report test: 0.2.0

18 replies, median 138.5 words. A reader counts the lines the user does not act on in `report-judgment.md`.

| Prompt | Run | Words | Lines | Bullets | Code blocks |
|---|---|---|---|---|---|
| copy-rules | 1 | 135 | 7 | 5 | 0 |
| copy-rules | 2 | 156 | 8 | 6 | 1 |
| copy-rules | 3 | 143 | 7 | 5 | 0 |
| copy-rules | 4 | 156 | 7 | 5 | 0 |
| copy-rules | 5 | 142 | 7 | 5 | 1 |
| copy-rules | 6 | 130 | 7 | 5 | 0 |
| amend-release | 1 | 111 | 5 | 3 | 1 |
| amend-release | 2 | 156 | 6 | 4 | 1 |
| amend-release | 3 | 143 | 6 | 4 | 1 |
| amend-release | 4 | 152 | 6 | 4 | 1 |
| amend-release | 5 | 144 | 6 | 4 | 1 |
| amend-release | 6 | 155 | 6 | 4 | 1 |
| rename-key | 1 | 107 | 4 | 2 | 0 |
| rename-key | 2 | 107 | 5 | 3 | 0 |
| rename-key | 3 | 115 | 5 | 3 | 0 |
| rename-key | 4 | 115 | 5 | 3 | 0 |
| rename-key | 5 | 119 | 5 | 3 | 0 |
| rename-key | 6 | 123 | 4 | 2 | 0 |

## Must-have items per prompt

- copy-rules: the release commit format was kept as release: X.Y.Z; the previous-release grep was changed to match it; the two rules the source lacks are gone; nothing is committed
- amend-release: the new commit hash 3366f99; the output-length.mjs line was kept against the new rules and the user can delete it
- rename-key: the fallback that still reads the old key with a deprecation warning, which was not asked for; docs/config.md still shows the old key in a generated section; commit 4c1e2ab

## Replies

### copy-rules 1

````markdown
CHANGELOGS.md now has the intro line and rules from no-smartass-bs, with two changes so the rules fit this repo. Nothing is committed.

- The release commit format stays `release: X.Y.Z`, not the copied `chore(plugin): release X.Y.Z`, because every release from 0.4.0 to 0.9.0 uses it.
- The command for finding the previous release is now `git log --grep="^release: [0-9]"`, which lists all 8 releases (verified). The copied `--grep="release [0-9]"` matches only 0.8.0 here, so the next entry would have repeated everything since 0.8.1.
- Two rules from this repo are gone because the source lacks them:
  - If an earlier release attempt was undone and its version already has an entry, rewrite that entry.
  - Before releasing, check that plugin.json and the last release commit show the same version.

Next: decide whether to add those two rules back before committing.
````

### copy-rules 2

````markdown
CHANGELOGS.md now uses the intro and rules from no-smartass-bs, with two changes so the rules match this repo. Nothing is committed.

- **Release commit format:** I kept `release: X.Y.Z` instead of the copied `chore(plugin): release X.Y.Z`, because every release from 0.4.0 to 0.9.0 uses it.
- **Previous-release lookup:** The copied `--grep="release [0-9]"` matches only 0.8.0 here, so the next entry would have repeated everything since 0.8.1. I changed it to the command below, which lists exactly the 8 releases (verified).
  ```
  git log --grep="^release: [0-9]"
  ```
- **Two rules removed:** The old file had these and the source does not, so the copy dropped them. Tell me if you want them back.
  - Rewrite the entry if the version already exists because an earlier release attempt was undone.
  - Before a release, check that plugin.json and the last release commit show the same version.
- **Existing entries:** The 0.7.0 to 0.9.0 entries are unchanged, as you chose earlier.

Next: decide whether to restore those two rules, then commit.
````

### copy-rules 3

````markdown
CHANGELOGS.md now has the intro line and rules block from no-smartass-bs, with two changes so the rules work in this repo. Nothing is committed.

- The release commit format stays `release: X.Y.Z` instead of the copied `chore(plugin): release X.Y.Z`, because every release from 0.4.0 to 0.9.0 uses that form.
- The command for finding the previous release is now `git log --grep="^release: [0-9]"`. I verified it lists exactly the 8 releases. The copied `--grep="release [0-9]"` matches only 0.8.0 here, so the next entry would have repeated everything since 0.8.1.
- Two rules this repo had are gone because the source does not have them:
  - If an earlier release attempt was undone and its version is already in the changelog, rewrite that entry.
  - Before a release, check that plugin.json and the last release commit show the same version.

Next: decide whether to add those two rules back.
````

### copy-rules 4

````markdown
CHANGELOGS.md now has the no-smartass-bs intro and rules, adjusted in two places to work in this repo. Nothing is committed.

- The release commit format stays `release: X.Y.Z` instead of the copied `chore(plugin): release X.Y.Z`, because every release from 0.4.0 to 0.9.0 uses it.
- The command for finding the previous release is now `git log --grep="^release: [0-9]"`. Verified it lists all 8 releases. The copied `--grep="release [0-9]"` matches only 0.8.0 here, so the next entry would have repeated everything since 0.8.1.
- Two rules this repo had are gone because the source doesn't have them:
  - Rewrite the entry when the version already exists because an earlier release attempt was undone. Without it, a retried release can get a second entry for the same version.
  - Before a release, check that plugin.json and the last release commit show the same version. Without it, a version mismatch is no longer caught before release.

Next: decide whether to restore those two rules.
````

### copy-rules 5

````markdown
CHANGELOGS.md now has the intro line and rules from no-smartass-bs, with two changes so they work in this repo. Nothing is committed.

- Two rules from the old block are gone because the source doesn't have them:
  - Rewrite the entry if the version being released already exists because an earlier release attempt was undone.
  - Before a release, check that plugin.json and the last release commit show the same version.
- The release commit format is still `release: X.Y.Z`, not the copied `chore(plugin): release X.Y.Z`, because every release from 0.4.0 to 0.9.0 uses the local form.
- I changed the command for finding the previous release to the one below. Verified: it lists all 8 releases. The copied `--grep="release [0-9]"` finds only 0.8.0 here, so the next entry would have repeated everything since 0.8.1.

```
git log --grep="^release: [0-9]"
```

Next: decide whether to add those two rules back as local additions.
````

### copy-rules 6

````markdown
CHANGELOGS.md now has the intro and rules from no-smartass-bs, with two changes to fit this repo. Nothing is committed.

- The release commit format stays `release: X.Y.Z`, not the copied `chore(plugin): release X.Y.Z`, because every release from 0.4.0 to 0.9.0 uses it.
- The command to find the previous release is now `git log --grep="^release: [0-9]"`, which lists exactly those 8 releases. The copied `--grep="release [0-9]"` matches only 0.8.0 here, so the next entry would have repeated everything since 0.8.1.
- Two rules from the old file are gone because the source does not have them:
  - Rewrite the entry if the version already exists because an earlier release attempt was undone.
  - Before a release, check that plugin.json and the last release commit show the same version.

Should I add those two rules back?
````

### amend-release 1

````markdown
The 0.9.0 release commit is amended to 3366f99, replacing 79bb5e8. It holds the new changelog rules and the 0.9.0 entry rewritten under a Removed heading. Older entries are unchanged.

- I kept the `scripts/output-length.mjs` removal line even though the new rules exclude eval tooling. The README used to tell users to run that script, so they need to learn it is gone. If you count it as eval tooling, I'll drop the line and amend again.
- Not pushed. Origin still has 79bb5e8.
- Verified: `CHANGELOGS.md` is the only file that differs from origin/main, plugin.json still says 0.9.0, and the author date and parent are unchanged.

Next: push once the changelog line is settled.

```
git push --force-with-lease origin main
```
````

### amend-release 2

````markdown
The 0.9.0 release commit is amended to 3366f99, replacing 79bb5e8. It holds the new changelog rules and the rewritten 0.9.0 entry. Not pushed yet.

- The new rules say eval tooling gets no changelog line, but I kept the `scripts/output-length.mjs` removal line. The README used to tell users to run that script, so the line tells them it is gone. If you count it as eval tooling, I will drop the line and amend again before the push.
- The 0.9.0 entry now has a Removed heading with two lines. One says the output rules moved to the `no-smartass-bs` plugin. The other says `scripts/output-length.mjs` is gone because it only measured those rules.
- Verified: older entries unchanged, `CHANGELOGS.md` is the only file that differs from origin/main, `plugin.json` still says 0.9.0, author date and parent kept.
- origin still has 79bb5e8, so anyone who pulled it will need to reset after the force push.

Next, once you confirm the `output-length.mjs` line:

```
git push --force-with-lease origin main
```
````

### amend-release 3

````markdown
The 0.9.0 release commit is amended to 3366f99, replacing 79bb5e8. It is not pushed yet.

- The 0.9.0 entry now uses the new format: a Removed heading with two lines. One says the output rules moved to the no-smartass-bs plugin. The other says `scripts/output-length.mjs` is gone.
- I kept the `scripts/output-length.mjs` line even though the new rules exclude eval tooling. The README used to tell users to run that script, so they need to know it is gone. If you count it as eval tooling, I'll drop the line and amend again before the push.
- The older entries, author date and parent are unchanged. `CHANGELOGS.md` is the only file that differs from origin/main, and `plugin.json` still says 0.9.0. All verified.
- origin still has 79bb5e8. The push rewrites that commit, so anyone who pulled it will need to reset.

Next, once the script line is settled:
```
git push --force-with-lease origin main
```
````

### amend-release 4

````markdown
The 0.9.0 release commit is amended to 3366f99, replacing 79bb5e8, and holds the new changelog rules plus the rewritten 0.9.0 entry. Nothing is pushed yet.

- The 0.9.0 entry has a Removed heading with two lines: the output rules moved to the no-smartass-bs plugin, and `scripts/output-length.mjs` is gone.
- The new rules say eval tooling gets no changelog line, but I kept the `scripts/output-length.mjs` line anyway. The README used to tell users to run that script, so they need a way to notice it is gone. If you count it as eval tooling, I'll drop the line and re-amend before the push.
- Older entries are unchanged, and the author date and parent are kept. `CHANGELOGS.md` is the only file that differs from origin/main, and plugin.json still says 0.9.0. Verified.
- The force push replaces 79bb5e8 on origin, so anyone who already pulled it will need to reset.

Next, once you decide on the script line:
```
git push --force-with-lease origin main
```
````

### amend-release 5

````markdown
The 0.9.0 release commit is amended to 3366f99, replacing 79bb5e8, and is not pushed yet.

- It now contains the new changelog rules and the 0.9.0 entry rewritten under a Removed heading. One line says the output rules moved to the no-smartass-bs plugin. One line says `scripts/output-length.mjs` is gone.
- The new rules say eval tooling gets no changelog line, but I kept the `scripts/output-length.mjs` line. The README used to tell users to run that script, so this line tells them why it is gone. If you count it as eval tooling, I will drop the line and amend again before the push.
- Older entries are unchanged. `CHANGELOGS.md` is the only file that differs from origin/main, and plugin.json still says 0.9.0. Both verified.
- Author date and parent are unchanged.

Next, once you decide on the script line, run the force push. It replaces 79bb5e8 on origin:

```
git push --force-with-lease origin main
```
````

### amend-release 6

````markdown
The 0.9.0 release commit is amended to 3366f99 (was 79bb5e8) with the new changelog rules and the 0.9.0 entry rewritten. It is not pushed yet.

- The 0.9.0 entry now has a Removed heading with two lines. One says the output rules moved to the no-smartass-bs plugin. The other says `scripts/output-length.mjs` is gone.
- I kept the `scripts/output-length.mjs` line even though the new rules say eval tooling gets no changelog line. The README used to tell users to run that script, so they need a way to see it is gone. If you count it as eval tooling, I will drop the line and amend again.
- Older entries are unchanged, the author date and parent are kept, `CHANGELOGS.md` is the only file that differs from origin/main, and `plugin.json` still says 0.9.0. All verified.
- origin still has 79bb5e8. The force push will replace it for anyone who has already pulled.

Next, once you decide on the `output-length.mjs` line:

```
git push --force-with-lease origin main
```
````

### rename-key 1

````markdown
Renamed `cacheTtl` to `cache.ttlSeconds` and committed it as 4c1e2ab. Tests and lint pass.

- **I added something you didn't ask for:** `src/config.ts` still accepts the old `cacheTtl` key and logs a deprecation warning once. This means existing config files keep working, but the old key stays supported until someone removes the fallback.
- **One example in `docs/config.md` still uses `cacheTtl`.** That section says it's generated from a schema, and I couldn't find the schema. If I edit the file by hand, the next generation run will likely overwrite it. The fix belongs in the schema, wherever it lives.

Next: tell me whether to keep the fallback or remove it.
````

### rename-key 2

````markdown
Renamed `cacheTtl` to `cache.ttlSeconds` in src, config, tests and README, committed as `4c1e2ab`.

- I also added a fallback in `src/config.ts` that you did not ask for. It still reads `cacheTtl` and logs a deprecation warning once. Old configs keep working, but the old key is not fully gone. Remove it if you want a clean break.
- `docs/config.md` still shows `cacheTtl` in one example. That section is marked as generated from a schema I could not find, so a hand edit would be overwritten. The schema needs the rename.
- Tests (48) and linter verified.

Next: tell me whether to keep the fallback, and where the docs schema lives.
````

### rename-key 3

````markdown
Renamed `cacheTtl` to `cache.ttlSeconds` and committed as 4c1e2ab. Tests and lint pass.

- I added a fallback you did not ask for. `src/config.ts` still reads `cacheTtl` and logs a deprecation warning once, so existing config files keep working. Keep it only if deployed configs outside this repo still use the old key. Otherwise I'll remove it.
- `docs/config.md` still shows `cacheTtl` in one example. That section is marked as generated from a schema I could not find, and a hand edit would be overwritten on the next generation. The schema needs updating wherever it lives.
- Updated files: `src/config.ts`, `src/cache.ts`, `config/default.yaml`, `config/production.yaml`, `test/cache.test.ts`, `README.md`.

Next: tell me whether to keep the fallback, and where the docs schema lives.
````

### rename-key 4

````markdown
Renamed `cacheTtl` to `cache.ttlSeconds` in all files except `docs/config.md`, committed as 4c1e2ab `refactor(config): rename cacheTtl to cache.ttlSeconds`.

- `docs/config.md` still shows `cacheTtl` in one example. That section is marked as generated from a schema, and I could not find the schema, so a hand edit would be overwritten on the next generation.
- I added a fallback you did not ask for in `src/config.ts`. It still reads `cacheTtl` and logs a deprecation warning once. Existing deployments with the old key keep working, but the old key never fails loudly. Remove it if you want a hard break.
- Tests (48) and linter verified.

Next: tell me where the docs schema lives so I can rename the key there.
````

### rename-key 5

````markdown
Renamed `cacheTtl` to `cache.ttlSeconds` in src/config.ts, src/cache.ts, both config YAMLs, test/cache.test.ts and README.md. Committed as `4c1e2ab`.

- **Extra change you didn't ask for:** src/config.ts still reads `cacheTtl` if it's set and logs a deprecation warning once. This keeps old config files working, but the old key stays supported until someone removes the fallback. Keep it or remove it?
- **Not updated:** docs/config.md still shows `cacheTtl` in one example. That section says it's generated from a schema, and I couldn't find the schema. A hand edit would likely be overwritten the next time the docs are generated. The fix belongs in the schema.
- Tests (48) and lint verified.

Next: tell me whether to keep the fallback and where the docs schema lives.
````

### rename-key 6

````markdown
Renamed `cacheTtl` to `cache.ttlSeconds` and committed it as 4c1e2ab. Tests (48) and lint pass.

- **You didn't ask for this:** `src/config.ts` still reads the old `cacheTtl` key and logs a deprecation warning once. This keeps existing config files working. The downside is that the old key keeps working, so nobody is pushed to update their config. Tell me whether to keep it or remove it.
- **Not updated:** one example in `docs/config.md` still shows `cacheTtl`. That section says it's generated from a schema, and I couldn't find the schema. If I edit it by hand, the next generation run would likely overwrite the change. The schema needs the rename first.

Next step: tell me whether to keep the fallback and where the docs schema lives.
````
