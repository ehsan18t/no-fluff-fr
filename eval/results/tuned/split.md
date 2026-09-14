# One-point test: tuned

6 of 6 replies split a single finding into a heading or labeled parts.

A reply counts as split when it has a heading, a bullet whose bold label names a part of the finding (Evidence, Impact, Fix, ...), or more bullets than the prompt allows (`maxBullets` in split-prompts.json, set only for a prompt with no separate items).

| Prompt | Run | Headings | Bullets | Labeled parts | Split |
|---|---|---|---|---|---|
| version-bump | 1 | 3 | 4 | 1 | yes |
| version-bump | 2 | 0 | 4 | 0 | yes |
| version-bump | 3 | 3 | 4 | 0 | yes |
| cache-ttl | 1 | 3 | 5 | 0 | yes |
| cache-ttl | 2 | 4 | 10 | 0 | yes |
| cache-ttl | 3 | 2 | 6 | 0 | yes |

## Replies

### version-bump 1 (split)

````markdown
Installed copies of the plugin only update when `version` in `.claude-plugin/plugin.json` changes. The README doesn't mention this.

## Finding
- I changed a plugin file without bumping `version`, then ran `claude plugin update`. It reported the plugin was already at the latest version, and the installed copy kept the old file.
- **Impact:** If you ship a change without bumping `version`, existing users never get it and nothing warns you.

## Not checked
- Whether a matching `version` in a marketplace entry has the same effect.
- Whether uninstalling and reinstalling picks up the change without a version bump.

## Question
Should I add a line like this to the README?
> Bump `version` in `.claude-plugin/plugin.json` for every release. Installed copies only update when it changes.

Also, the Canva, Gmail, Google Calendar and Google Drive connectors can't be used until you authorize them in your claude.ai connector settings.
````

### version-bump 2 (split)

````markdown
Installed copies of the plugin only update when `version` in `.claude-plugin/plugin.json` changes.

- **Observed:** after I changed a file without bumping `version`, `claude plugin update` reported the plugin was already at the latest version.
- **Risk:** a release that changes files but not `version` never reaches installed copies, and nothing warns about it.
- **Not checked:** whether uninstalling and reinstalling picks up the change without a version bump.
- **Gap:** the README does not mention this.

Should I add a line to the README saying every release must bump `version` in `.claude-plugin/plugin.json`?
````

### version-bump 3 (split)

````markdown
Installed copies of the plugin only update when `version` in `.claude-plugin/plugin.json` changes, and the README does not say so.

## Finding
- I changed a plugin file without bumping `version`, and `claude plugin update` reported the plugin was already at the latest version.
- **Risk:** if a release ships without a version bump, users never receive it and get no warning.

## Not verified
- Tested only with `claude plugin update`. Automatic or marketplace-driven updates may behave differently.
- Did not check whether any other field or git ref also triggers an update.

## Question
Should I add a line to the README telling maintainers to bump `version` in `.claude-plugin/plugin.json` for every release?
````

### cache-ttl 1 (split)

````markdown
Production's Redis cache TTL is 0 in `config/production.yaml`, so every request misses the cache and queries Postgres. Staging uses 300 seconds.

## Impact
- All production read load goes to Postgres, which raises latency and database load.

## Risks of changing to 300
- 0 may be intentional, for example to avoid serving stale data after an incident. I have not checked config history or related tickets.
- Clients may see data up to 5 minutes old unless writes invalidate the cache.
- Redis memory use will rise. Production Redis capacity is not checked.
- Staging traffic may not match production, so 300 seconds is not verified as the right value for production.

## Question
Should I change the production TTL to 300 seconds?
````

### cache-ttl 2 (split)

````markdown
Production's Redis cache TTL is 0 in `config/production.yaml`, so every request skips the cache and hits Postgres. Staging uses 300 seconds.

Should I change production to 300 seconds?

## Impact now
- Every read goes to Postgres, so the cache does nothing.
- Postgres is doing more work than it needs to, and production latency is likely higher than staging's.

## Risks of changing to 300
- **Stale data:** cached values can be up to 5 minutes old. Reads that need fresh data, like permissions, sessions or prices, could return old values unless writes clear the cache.
- **Untested writes:** production has never run with cache hits, so any missing cache clears on write haven't shown up there yet.
- **Redis memory:** Redis will start holding real data. I haven't compared its memory limit and eviction policy to the expected amount of data.
- **Burst on expiry:** when a popular key expires, many requests can hit Postgres at the same moment.
- **Setting may be on purpose:** 0 could have been set to work around a stale-data bug. I haven't checked the file's history.

## Not verified
- I haven't reread `config/production.yaml` in this session. The file tools I have here can't open it.
- I haven't checked how our Redis client treats a TTL of 0. Some clients treat 0 as "never expire," not "don't cache." If ours does, the cause of the misses is something else.

## Unavailable tools
- The Canva, Gmail, Google Calendar and Google Drive connectors need authorization in your claude.ai connector settings. They won't work until then.
````

### cache-ttl 3 (split)

````markdown
Production's Redis cache TTL is 0 in `config/production.yaml`, so every request misses the cache and queries Postgres. Staging uses 300 seconds.

## Impact
- Postgres takes the full read load in production, and Redis does nothing for those requests.
- Production and staging behave differently, so load tests on staging overstate how production will perform.

## Before changing
- **Intent not checked:** the 0 may be deliberate, for example to avoid serving stale data. I found no comment or history explaining it.
- **Stale data:** with 300 seconds, users can see data up to 5 minutes old unless writes clear the cache. I have not checked whether they do.
- **Redis memory:** caching will start filling Redis. Its memory limit and eviction policy in production are not checked.
- **Library behavior not checked:** some clients read a TTL of 0 as "never expire" rather than "don't cache." The value may not be the only reason for the misses.

Should I change the production TTL to 300 seconds?
````
