# One-point test: 0.2.0

12 of 18 replies split a single finding into a heading or labeled parts.

A reply counts as split when it has a heading, a bullet whose bold label names a part of the finding (Evidence, Impact, Fix, ...), or more bullets than the prompt allows (`maxBullets` in split-prompts.json, set only for a prompt with no separate items).

| Prompt | Run | Headings | Bullets | Labeled parts | Split |
|---|---|---|---|---|---|
| version-bump | 1 | 0 | 3 | 0 | yes |
| version-bump | 2 | 0 | 2 | 0 | yes |
| version-bump | 3 | 0 | 2 | 0 | yes |
| version-bump | 4 | 0 | 2 | 0 | yes |
| version-bump | 5 | 0 | 2 | 0 | yes |
| version-bump | 6 | 0 | 3 | 1 | yes |
| version-bump | 7 | 0 | 2 | 0 | yes |
| version-bump | 8 | 0 | 2 | 0 | yes |
| version-bump | 9 | 0 | 3 | 0 | yes |
| cache-ttl | 1 | 0 | 3 | 1 | yes |
| cache-ttl | 2 | 0 | 4 | 0 | no |
| cache-ttl | 3 | 0 | 4 | 0 | no |
| cache-ttl | 4 | 0 | 4 | 0 | no |
| cache-ttl | 5 | 0 | 3 | 0 | no |
| cache-ttl | 6 | 0 | 3 | 0 | no |
| cache-ttl | 7 | 0 | 3 | 1 | yes |
| cache-ttl | 8 | 0 | 3 | 1 | yes |
| cache-ttl | 9 | 0 | 3 | 0 | no |

## Replies

### version-bump 1 (split)

````markdown
`claude plugin update` only picks up a new release when `version` in `.claude-plugin/plugin.json` changes. Changed files alone do not reach installed copies.

- In testing, I changed a plugin file without bumping `version`, and `claude plugin update` reported the plugin was already at the latest version. The installed copy kept the old file.
- This means any fix shipped without a version bump never reaches existing users, and nothing warns them or you.
- The README doesn't mention this, so contributors could push fixes that never reach anyone.

Should I add a line to the README saying every change meant for users needs a `version` bump in `.claude-plugin/plugin.json`?
````

### version-bump 2 (split)

````markdown
Installed copies of the plugin only update when `version` in `.claude-plugin/plugin.json` changes, and the README doesn't say so.

- I changed a file without bumping `version`, and `claude plugin update` said the plugin was already at the latest version. The change never reached the installed copy.
- This matters most for contributors testing their own edits, and for any release where someone forgets the bump. The update command reports success, so nobody would see that the new files were skipped.

Should I add a line about this to the README?
````

### version-bump 3 (split)

````markdown
Installed copies of the plugin only update when `version` in `.claude-plugin/plugin.json` changes, and the README doesn't say so.

- I changed a file without bumping `version`, and `claude plugin update` reported the plugin was already at the latest version. The changed file did not reach the installed copy.
- Anyone who edits the plugin and skips the bump will ship a change that installed users never receive, and nothing warns them.

Should I add a line to the README saying every change must bump `version` in `.claude-plugin/plugin.json`?
````

### version-bump 4 (split)

````markdown
Installed copies of the plugin only update when `version` in `.claude-plugin/plugin.json` changes. File changes alone never reach users who already have it installed.

- While testing, I changed a file without bumping `version`, and `claude plugin update` said it was already at the latest version. It doesn't check whether the contents changed, so users get no warning that they're on stale files.
- The README doesn't mention this. Anyone who contributes a fix without bumping `version` will think it shipped when it didn't.

Should I add a line about this to the README?
````

### version-bump 5 (split)

````markdown
Installed copies of the plugin only update when `version` in `.claude-plugin/plugin.json` changes, and the README doesn't mention this.

- When I changed a file without bumping `version`, `claude plugin update` reported the plugin as already at the latest version and did not pull the change. It gave no warning, so anyone who ships a fix without a bump will think users have it when they don't.
- I only tested changing a file with no version bump. I didn't test whether a bump alone, with no file changes, triggers an update.

Should I add a line to the README saying that every change meant for users needs a `version` bump in `.claude-plugin/plugin.json`?
````

### version-bump 6 (split)

````markdown
Installed copies of the plugin only update when `version` in `.claude-plugin/plugin.json` changes, and the README doesn't say so.

- **What I saw:** I changed a file without bumping `version`, and `claude plugin update` said the plugin was already at the latest version. The change never reached the installed copy.
- **Why it matters:** if a fix ships without a version bump, users who run `claude plugin update` stay on the old code and get no warning.
- **Not checked:** I didn't test whether reinstalling the plugin picks up the change without a bump.

Should I add a line to the README saying every release that changes plugin files needs a `version` bump in `.claude-plugin/plugin.json`?
````

### version-bump 7 (split)

````markdown
Installed copies of the plugin only pick up changes when `version` in `.claude-plugin/plugin.json` changes, and the README doesn't say so.

- I changed a file without bumping `version`, and `claude plugin update` reported the plugin was already at the latest version. The changed file did not reach the installed copy.
- For this release, every change you ship after people install needs a `version` bump, or they keep the old files with no error.

Should I add a line about this to the README?
````

### version-bump 8 (split)

````markdown
Installed copies of the plugin only update when `version` in `.claude-plugin/plugin.json` changes, and the README does not say so.

- I changed a file without bumping `version`, and `claude plugin update` reported the plugin was already at the latest version. So users will not get a change until the version is bumped, even if the files differ.
- This matters for your release: if you ship a fix after the first release without bumping `version`, nobody who installed it gets the fix.

Should I add a line about this to the README?
````

### version-bump 9 (split)

````markdown
Installed copies of the plugin only update when `version` in `.claude-plugin/plugin.json` changes. File changes alone do not reach users who already have it installed.

- I changed a file without bumping the version, and `claude plugin update` reported the plugin was already at the latest version.
- If you push a fix under the same version, existing installs keep the old files and nothing tells you or them.
- The README does not mention this.

Should I add a line to the README saying every change you want installed copies to get needs a `version` bump in `plugin.json`?
````

### cache-ttl 1 (split)

````markdown
Production caching is effectively off. `config/production.yaml` sets the Redis cache TTL to 0, so every request misses the cache and queries Postgres. Staging uses 300 seconds.

- **Impact:** Postgres handles all the read load in production. That adds latency and cuts how much traffic the database can absorb before it struggles.
- **Risk of changing it:** with a 300-second TTL, production can serve data up to 5 minutes old. Setting it to 0 may have been a deliberate way to avoid stale reads, so check that before changing it.
- **Not checked:** whether Redis in production has enough memory for the extra keys this will add.

Should I change the production TTL to 300 seconds to match staging?
````

### cache-ttl 2

````markdown
Production's Redis cache TTL is 0 in `config/production.yaml`, so every request misses the cache and queries Postgres. Staging uses 300 seconds.

- **Load:** Postgres takes the full read load in production, so the cache does nothing there.
- **Before changing it:** someone may have set 0 on purpose to avoid stale data. With 300, reads can be up to 5 minutes out of date. Check whether any endpoint needs fresh reads, like balances, permissions or inventory.
- **After changing it:** Redis memory use will go up once keys start being stored. Staging traffic is likely lower, so it doesn't tell you what production memory use will be.
- **Not checked:** I have no file tools here, so I haven't reopened `config/production.yaml` to confirm the value or searched the git history for why it was set to 0.

Should I change production's TTL to 300 seconds?
````

### cache-ttl 3

````markdown
Production Redis cache TTL is 0 in `config/production.yaml`, so every request misses the cache and hits Postgres. Staging uses 300 seconds.

- Postgres takes the full read load that staging offloads to Redis. That raises latency and database load and leaves less headroom during traffic spikes.
- Setting 300 means production reads can be up to 5 minutes stale. Staging already runs this way, but production may have flows staging doesn't exercise.
- The 0 may have been set on purpose, for example to work around a stale-data bug. I haven't checked the file history.
- Redis memory use in production will rise once entries persist. I haven't checked current Redis capacity.

Should I change the production TTL to 300 seconds?
````

### cache-ttl 4

````markdown
Production caching is effectively off: `config/production.yaml` sets the Redis cache TTL to 0, so every request misses the cache and queries Postgres. Staging uses 300 seconds.

- Postgres takes the full read load in production, which adds latency and database pressure that staging does not show.
- Setting 300 means production reads can return data up to 5 minutes old, which staging already accepts.
- Redis memory use in production will grow once keys start being kept. I have not checked current Redis capacity.
- I don't know why production is set to 0. If someone chose it on purpose, for example to avoid stale data, check with them before changing it.

Should I change the production TTL to 300 seconds?
````

### cache-ttl 5

````markdown
Production's Redis cache TTL is `0` in `config/production.yaml`, so every request misses the cache and goes to Postgres. Staging uses `300`.

- **Load:** Postgres takes all the read traffic the cache should absorb. That raises latency and connection use at peak.
- **Risk of the change:** with a 300-second TTL, production can serve cached data up to 5 minutes old. Any code path that needs fresh reads, and still depends on the cache expiring rather than being invalidated on write, would start returning outdated results.
- **Unverified:** I don't know if `0` was set on purpose, for example to turn caching off during an incident. The file history or whoever last changed it can confirm.

Should I change production to 300 seconds?
````

### cache-ttl 6

````markdown
Production's Redis cache TTL in `config/production.yaml` is `0`, so every request misses the cache and hits Postgres. Staging uses `300`.

- Setting production to 300 means reads can be up to 5 minutes stale. Staging already runs that way, but production traffic may include data that needs to be fresher.
- The `0` may have been set on purpose, for example to work around a cache invalidation bug. I have not checked the file history or config comments for a reason.
- Postgres load should drop once the cache is on. The first minutes after deploy will still be mostly misses while the cache warms.

Should I change production's TTL to 300 seconds?
````

### cache-ttl 7 (split)

````markdown
Production never uses the Redis cache: `config/production.yaml` sets the TTL to `0`, so every request misses the cache and queries Postgres. Staging uses `300`.

- **Impact:** Postgres gets the full read load in production, and the cache does no work.
- **Risk of changing it:** with `300`, production can serve data up to 5 minutes old. Staging already runs that way, but check whether anything in production needs fresh reads, such as permissions, pricing or inventory.
- **Not checked:** whether `0` was set on purpose, for example as a quick fix for stale data. Git history or the config owner can confirm that before the change.

Should I change the production TTL to 300 seconds?
````

### cache-ttl 8 (split)

````markdown
Production caching is effectively off: `config/production.yaml` sets the Redis cache TTL to `0`, so every request misses the cache and queries Postgres. Staging uses `300` seconds.

- **Impact:** Production Postgres carries the full read load that the cache should absorb. Staging load tests will not reflect this, since staging caches.
- **Risk of changing it:** With `300`, production can serve data up to 5 minutes stale. If `0` was set on purpose, for example to hide a stale-data or invalidation bug, raising it brings that bug back.
- **Not checked:** whether Redis memory in production is sized for a populated cache, and whether the git history or a ticket explains the `0`.

Should I change the production TTL to `300` seconds?
````

### cache-ttl 9

````markdown
Production Redis cache TTL is 0 in `config/production.yaml`, so every request misses the cache and queries Postgres directly. Staging uses 300 seconds.

- Postgres takes the full read load in production, and staging does not show this because its cache works.
- Setting 300 means production can serve data up to 5 minutes stale. Check whether any cached reads, such as permissions or prices, need fresher data.
- 0 may have been set on purpose to work around a stale-data bug. Check the history of that line before changing it.

Should I change the production TTL to 300 seconds?
````
