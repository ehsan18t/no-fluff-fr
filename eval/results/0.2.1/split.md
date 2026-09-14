# One-point test: 0.2.1

7 of 18 replies split a single finding into a heading or labeled parts.

A reply counts as split when it has a heading, a bullet whose bold label names a part of the finding (Evidence, Impact, Fix, ...), or more bullets than the prompt allows (`maxBullets` in split-prompts.json, set only for a prompt with no separate items).

| Prompt | Run | Headings | Bullets | Labeled parts | Split |
|---|---|---|---|---|---|
| version-bump | 1 | 0 | 2 | 0 | yes |
| version-bump | 2 | 0 | 2 | 0 | yes |
| version-bump | 3 | 0 | 1 | 0 | no |
| version-bump | 4 | 0 | 2 | 0 | yes |
| version-bump | 5 | 0 | 2 | 0 | yes |
| version-bump | 6 | 0 | 1 | 0 | no |
| version-bump | 7 | 0 | 3 | 0 | yes |
| version-bump | 8 | 0 | 1 | 0 | no |
| version-bump | 9 | 0 | 2 | 0 | yes |
| cache-ttl | 1 | 0 | 3 | 0 | no |
| cache-ttl | 2 | 0 | 2 | 0 | no |
| cache-ttl | 3 | 0 | 2 | 0 | no |
| cache-ttl | 4 | 0 | 1 | 0 | no |
| cache-ttl | 5 | 0 | 3 | 0 | no |
| cache-ttl | 6 | 0 | 4 | 0 | no |
| cache-ttl | 7 | 0 | 3 | 0 | no |
| cache-ttl | 8 | 0 | 2 | 0 | no |
| cache-ttl | 9 | 0 | 3 | 1 | yes |

## Replies

### version-bump 1 (split)

````markdown
Installed copies of the plugin ignore file changes unless `version` in `.claude-plugin/plugin.json` changes. After I edited a file without bumping it, `claude plugin update` reported the plugin as already at the latest version.

- Anyone who pushes a fix without a bump will think it shipped, but existing installs keep the old files.
- The README does not mention this.

Should I add a line to the README saying every change meant for users needs a `version` bump in `plugin.json`?
````

### version-bump 2 (split)

````markdown
Installed copies of the plugin only update when `version` in `.claude-plugin/plugin.json` changes. File changes alone do not reach users.

- I changed a file without bumping the version, and `claude plugin update` reported the plugin was already at the latest version.
- The README does not mention this, so a contributor could ship a fix that no installed copy ever receives.

Should I add a line about this to the README?
````

### version-bump 3

````markdown
Installed copies of the plugin only update when `version` in `.claude-plugin/plugin.json` changes, and the README does not say so.

- I changed a file without bumping the version, and `claude plugin update` reported the plugin was already at the latest version. Users on an installed copy would keep the old files with no error.

Should I add a line to the README saying every change you want users to receive needs a `version` bump in `.claude-plugin/plugin.json`?
````

### version-bump 4 (split)

````markdown
Installed copies of the plugin only update when `version` in `.claude-plugin/plugin.json` changes. File changes alone are ignored.

- After I changed a file without bumping `version`, `claude plugin update` reported the plugin was already at the latest version.
- Anyone releasing a fix without a bump would ship nothing to existing installs, and the README does not say this.

Should I add a line about this to the README?
````

### version-bump 5 (split)

````markdown
Installed copies of the plugin only update when `version` in `.claude-plugin/plugin.json` changes. I changed a file without bumping it, and `claude plugin update` reported the plugin was already at the latest version.

- If a release ships without a version bump, users never get it.
- The README does not mention this.

Should I add a line about it to the README?
````

### version-bump 6

````markdown
Installed copies of the plugin do not pick up changes unless `version` in `.claude-plugin/plugin.json` changes, and the README does not say so.

- I changed a file without bumping the version, and `claude plugin update` reported the plugin was already at the latest version. Users who update will not get fixes shipped under an unchanged version number.

Should I add a line to the README saying every change needs a `version` bump to reach installed copies?
````

### version-bump 7 (split)

````markdown
`claude plugin update` only picks up changes when `version` in `.claude-plugin/plugin.json` changes. Changed files alone do not reach installed copies.

- In testing, I edited a file without bumping `version`, and `claude plugin update` reported the plugin was already at the latest version.
- This means every release must bump `version`, even a small file fix. Otherwise existing users silently stay on the old files.
- The README does not mention this.

Should I add a line about this to the README?
````

### version-bump 8

````markdown
Installed copies of the plugin only pick up changes when `version` in `.claude-plugin/plugin.json` changes. After I edited a file without bumping it, `claude plugin update` reported the plugin as already at the latest version.

- Anyone editing a local or forked copy will see their changes ignored by `claude plugin update` unless they also bump `version`, and the README does not say so.

Should I add one line to the README saying that `claude plugin update` only applies changes after `version` in `.claude-plugin/plugin.json` is bumped?
````

### version-bump 9 (split)

````markdown
Installed copies of the plugin update only when `version` in `.claude-plugin/plugin.json` changes. Content changes alone are ignored.

- I changed a file without bumping the version, and `claude plugin update` reported the plugin was already at the latest version.
- The README does not mention this, so a contributor could push a fix that never reaches installed copies.

Should I add a line about this to the README?
````

### cache-ttl 1

````markdown
The Redis cache TTL in `config/production.yaml` is `0`, so every production request misses the cache and hits Postgres. Staging uses `300`.

- Postgres is taking the full read load in production that the cache is meant to absorb.
- A TTL of 0 may have been set on purpose, for example to disable caching during an incident, so it's worth checking the file's history or asking the owner before changing it.
- At `300`, production reads can be up to 5 minutes stale, the same as staging. That matters for any path that needs fresh data.

Should I change production to `300` seconds?
````

### cache-ttl 2

````markdown
Production `config/production.yaml` sets the Redis cache TTL to 0, so every request misses the cache and hits Postgres directly. Staging uses 300 seconds.

- A TTL of 0 may have been set on purpose to turn off caching, for example for data that must never be stale. If so, check the reason before changing it.
- At 300 seconds, production reads can be up to 5 minutes stale, the same as staging.

Should I change the production TTL to 300 seconds?
````

### cache-ttl 3

````markdown
Production's Redis cache TTL is 0 in `config/production.yaml`, so every request skips the cache and hits Postgres. Staging uses 300 seconds.

- Production is getting no benefit from Redis, and Postgres takes the full read load.
- Moving to 300 seconds means cached data can be up to 5 minutes out of date. That is fine unless some production reads need fresher data than staging does.

Should I change production to 300 seconds?
````

### cache-ttl 4

````markdown
Production's Redis cache TTL is `0` in `config/production.yaml`, so every request misses the cache and queries Postgres directly. Staging uses `300` seconds.

- Production data served from cache could be up to 5 minutes stale after the change. Confirm no production reads need fresher data than that.

Should I change the production TTL to `300` seconds?
````

### cache-ttl 5

````markdown
Production's Redis cache TTL is 0 in `config/production.yaml`, so every request misses the cache and queries Postgres directly. Staging uses 300 seconds.

- Production Postgres is taking the full read load that the cache should absorb.
- Setting 300 means production can serve data up to 5 minutes stale. Staging already runs that way, but check that no production-only path needs fresher reads.
- The 0 may have been set on purpose, for example to work around a stale-data bug. Nothing in the config says why.

Should I change production's TTL to 300 seconds?
````

### cache-ttl 6

````markdown
Production has caching turned off: `redis.ttl` is `0` in `config/production.yaml`, so every request misses Redis and hits Postgres. Staging uses `300`.

- Postgres is taking the full read load in production. That adds latency and leaves no headroom during traffic spikes.
- Cached data can be up to 5 minutes out of date with a 300 second TTL. Find out whether any endpoint needs fresh reads before applying it to everything.
- The `0` may have been set on purpose, for example to hide a stale-data bug. Check the history of that line before changing it.
- I did not re-read either file in this session, so these values come from the earlier review.

Should I change production to `300`?
````

### cache-ttl 7

````markdown
Production caches nothing: `redis.ttl` (or equivalent) in `config/production.yaml` is `0`, so every request misses Redis and hits Postgres. Staging uses `300`.

- **Load:** Postgres takes the full read load in production, which staging does not show. That likely explains any gap in latency or DB load between the two.
- **Intent unknown:** I did not find why it is `0`. It may have been set on purpose, for example to rule out stale data during an incident. Check the file history or ask the owner before changing it.
- **Risk of 300:** readers can see data up to 5 minutes old after a write, unless writes invalidate the cache. Redis memory in production will also grow from near zero, and I have not checked its capacity.

Should I change production to 300 seconds?
````

### cache-ttl 8

````markdown
Production has caching turned off in practice: `config/production.yaml` sets the Redis cache TTL to 0, so every request misses the cache and queries Postgres. Staging uses 300 seconds.

- Postgres takes the full read load that the cache should absorb, so production latency and database load are higher than staging.
- Setting 300 seconds means production can serve data up to 5 minutes old. Staging's traffic may not reveal whether any endpoint depends on fresh reads.

Should I change the production TTL to 300 seconds?
````

### cache-ttl 9 (split)

````markdown
Production is not caching anything. `config/production.yaml` sets the Redis cache TTL to `0`, so every request misses the cache and goes to Postgres. Staging uses `300`.

- **Impact:** production Postgres carries the full read load that the cache should absorb. Latency is higher, and a traffic spike goes straight to the database.
- **Downside of 300:** cached data can be up to 5 minutes stale. Any endpoint that needs fresh reads, such as balances or permissions, would need a shorter TTL or cache invalidation on write.
- **Not checked:** whether `0` was set on purpose, for example to work around a stale-data bug.

Should I change production to 300 seconds to match staging?
````
