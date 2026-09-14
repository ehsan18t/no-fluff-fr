# One-point test: one-point

1 of 12 replies split a single finding into a heading or labeled parts.

A reply counts as split when it has a heading, a bullet whose bold label names a part of the finding (Evidence, Impact, Fix, ...), or more bullets than the prompt allows (`maxBullets` in split-prompts.json, set only for a prompt with no separate items).

| Prompt | Run | Headings | Bullets | Labeled parts | Split |
|---|---|---|---|---|---|
| version-bump | 1 | 0 | 0 | 0 | no |
| version-bump | 2 | 0 | 0 | 0 | no |
| version-bump | 3 | 0 | 0 | 0 | no |
| version-bump | 4 | 0 | 0 | 0 | no |
| version-bump | 5 | 0 | 0 | 0 | no |
| version-bump | 6 | 0 | 0 | 0 | no |
| cache-ttl | 1 | 0 | 4 | 0 | no |
| cache-ttl | 2 | 0 | 3 | 0 | no |
| cache-ttl | 3 | 0 | 4 | 0 | no |
| cache-ttl | 4 | 0 | 3 | 0 | no |
| cache-ttl | 5 | 0 | 3 | 0 | no |
| cache-ttl | 6 | 0 | 3 | 1 | yes |

## Replies

### version-bump 1

````markdown
Installed copies of the plugin only update when `version` in `.claude-plugin/plugin.json` changes, and the README doesn't mention this. When I changed a file without bumping `version`, `claude plugin update` said the plugin was already at the latest version. Should I add a line about it to the README?
````

### version-bump 2

````markdown
Installed copies of the plugin only update when `version` in `.claude-plugin/plugin.json` changes, and the README doesn't mention this. When I changed a file without bumping it, `claude plugin update` said the plugin was already at the latest version. Should I add a line about it to the README?
````

### version-bump 3

````markdown
Installed copies only update when `version` in `.claude-plugin/plugin.json` changes: after I edited a file without bumping it, `claude plugin update` reported the plugin was already at the latest version, and the README doesn't mention this. Add a line about it to the README?
````

### version-bump 4

````markdown
Installed copies of the plugin only update when `version` in `.claude-plugin/plugin.json` changes, and the README doesn't mention it. When I changed a file without bumping `version`, `claude plugin update` reported the plugin was already at the latest version. Should I add a line about this to the README?
````

### version-bump 5

````markdown
Installed copies of the plugin only update when `version` in `.claude-plugin/plugin.json` changes, and the README doesn't say so. After I changed a file without bumping the version, `claude plugin update` reported it was already at the latest version. Should I add a line about this to the README?
````

### version-bump 6

````markdown
Installed copies of the plugin only update when `version` in `.claude-plugin/plugin.json` changes, and the README doesn't say so. After I changed a file without bumping it, `claude plugin update` reported the plugin was already at the latest version. Add a line about this to the README?
````

### cache-ttl 1

````markdown
Production cache TTL in `config/production.yaml` is 0, so every request skips Redis and goes to Postgres, while staging uses 300 seconds. Should I change production to 300 seconds?

- **Risk:** With a 300 second TTL, users can see data up to 5 minutes old unless writes clear the matching cache keys. Check any data that must stay fresh, such as permissions or balances, before changing it.
- **Risk:** Redis memory use and evictions will go up in production once entries persist. Staging traffic won't show how big that increase is.
- **Assumption:** I'm treating 0 as a mistake. It could be deliberate, for example a way to turn caching off during a past incident. Check the config's commit history or ask the owner before changing it.
- **Unverified:** I haven't measured the Postgres load that comes from these cache misses.

The Canva, Gmail, Google Calendar and Google Drive connectors need authorization in your claude.ai connector settings. They can't be used until then.
````

### cache-ttl 2

````markdown
Production caches nothing: `config/production.yaml` sets the Redis cache TTL to 0, so every request misses the cache and queries Postgres, while staging uses 300 seconds. Should I change production to 300?

- With a 300-second TTL, production can serve data up to 5 minutes stale, so this is unsafe if any cached data must be current.
- I don't know why production is set to 0, so it may be deliberate.
- Redis memory use in production will rise once entries persist, and I haven't checked whether production Redis has room for it.
````

### cache-ttl 3

````markdown
Production sets the Redis cache TTL in `config/production.yaml` to 0, so every request misses the cache and goes to Postgres. Staging uses 300 seconds. Should I change production to 300?

- **Risk:** With a 300 second TTL, production can serve data up to 5 minutes old. Check that no production-only path needs fresh reads, because staging traffic may not have exposed that.
- **Assumption:** The 0 may have been set on purpose, for example to turn caching off during an incident. I found no comment or history explaining it, so check with whoever set it.
- **Not checked:** I haven't confirmed the cache misses with production Redis hit and miss metrics or Postgres load numbers.
- **Rollout risk:** Turning the cache on changes Redis memory use and eviction behavior in production, so watch Redis memory after the deploy.
````

### cache-ttl 4

````markdown
Production caches nothing because `config/production.yaml` sets the Redis TTL to 0, so every request goes to Postgres. Staging uses 300 seconds. Should I change production to 300?

- With a 300-second TTL, production can serve data up to 5 minutes old. Check whether any endpoint needs fresh reads before changing it.
- I haven't checked whether 0 was set on purpose, for example to turn off caching during an incident.
- Once caching is on, Redis becomes part of the production read path. If Redis is short on memory or unavailable, the service will behave differently than it does now.
````

### cache-ttl 5

````markdown
Production sets the Redis cache TTL to 0 in `config/production.yaml`, so every request misses the cache and hits Postgres, while staging uses 300 seconds. Should I change production to 300?

- Cached data could be up to 5 minutes stale. Any data that must be fresh on every read would need its entries cleared when it changes.
- I haven't checked whether 0 was set on purpose, for example to work around a stale-data bug. Check the history on that line before changing it.
- Enabling the cache adds memory load to production Redis that it doesn't carry today. I haven't checked its capacity.
````

### cache-ttl 6 (split)

````markdown
Production caching is effectively off: `config/production.yaml` sets the Redis cache TTL to 0, so every request misses the cache and goes to Postgres. Staging uses 300 seconds.

- **Impact:** Postgres handles all of production's read traffic, and Redis adds a network round trip without saving any work.
- **Risk of changing it:** with 300 seconds, production can serve data up to 5 minutes old. Any endpoint that needs fresh reads would need a shorter TTL or cache invalidation on write.
- **Unknown:** I don't know if 0 was set on purpose, for example to work around a stale-data bug. `git blame` on that line or asking whoever owns the config would settle it.

Should I change the production TTL to 300 seconds?
````
