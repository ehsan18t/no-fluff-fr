# Replies: 0.2.0

## explain-index

Prompt:

````text
Explain what a database index is and when adding one makes performance worse.
````

### explain-index off 1

````markdown
## What a database index is

An index is a separate data structure that the database keeps alongside a table so it can find rows without reading the whole table. It works like the index at the back of a book: instead of reading every page to find "B-tree," you look it up and jump to page 212.

Most relational databases use a **B-tree** (usually a B+tree) by default. It stores the indexed column values in sorted order, and each entry points to the row (or, in a clustered index, *is* the row). Because the structure is sorted and balanced, finding a value takes O(log n) steps instead of O(n).

```sql
CREATE INDEX idx_users_email ON users (email);

-- Without the index: full table scan, checks every row
-- With the index:    tree lookup, then fetch the matching row
SELECT * FROM users WHERE email = 'a@example.com';
```

A sorted index also helps with range queries (`WHERE created_at > ...`), `ORDER BY`, `MIN`/`MAX`, and joins on the indexed column. Other index types exist for other access patterns, such as hash (equality only), GIN/inverted (full-text, arrays, JSON), GiST/R-tree (geospatial), and BRIN (very large, naturally ordered tables).

## When an index makes performance worse

An index is not free. It speeds up some reads and adds cost elsewhere. Here are the cases where that cost wins:

### 1. Write-heavy workloads
Every `INSERT`, `DELETE`, and `UPDATE` that touches an indexed column must also update every relevant index. A table with 8 indexes does about 9 structure modifications per insert, plus page splits when B-tree pages fill up. On ingest-heavy tables (logs, events, metrics), extra indexes can significantly reduce write throughput and increase lock contention.

### 2. Low-selectivity columns
Indexing a column like `is_active` (true/false) or `status` with 3 values rarely helps. If a query matches 40% of the table, walking the index and then jumping to each row in random order is slower than reading the table sequentially. The planner will usually ignore the index, so you pay the write and storage cost and get nothing back. Sometimes, with stale statistics, the planner *does* use it, and the query gets slower.

A **partial index** can rescue this case when the value you care about is rare:
```sql
CREATE INDEX idx_orders_pending ON orders (created_at) WHERE status = 'pending';
```

### 3. Small tables
If a table fits in a few pages, a full scan is already cheap. An index adds an extra lookup step with no real benefit.

### 4. Queries that return most of the table
Even on a selective column, a query that returns a large fraction of rows is faster as a sequential scan. Each index hit means a random I/O to fetch the row. Covering indexes (`INCLUDE` columns, or index-only scans) avoid that fetch, but they make the index larger.

### 5. Memory and cache pressure
Indexes take disk space and, more importantly, buffer-pool or cache memory. Too many large indexes push hot table and index pages out of memory, which increases disk reads for *everything*, including queries that never use those indexes.

### 6. Redundant and overlapping indexes
An index on `(a)` is usually redundant if `(a, b)` already exists, because the composite index can serve queries on `a` alone. Duplicates double the write cost for no read benefit, and they give the planner more options to choose badly between.

### 7. Wrong column order in composite indexes
An index on `(last_name, first_name)` helps `WHERE last_name = ?` but generally not `WHERE first_name = ?`. A poorly ordered composite index costs as much as a good one to maintain and gets used far less often.

### 8. Indexes that queries can't use
Functions and type mismatches can silently prevent index use:
```sql
WHERE LOWER(email) = '...'        -- needs an expression index on LOWER(email)
WHERE phone = 5551234             -- phone is VARCHAR; implicit cast may skip the index
WHERE name LIKE '%smith'          -- leading wildcard can't use a B-tree
```

### 9. Update-in-place optimizations lost
In PostgreSQL, updating a column that isn't indexed can use a **HOT update**, which avoids touching indexes at all. Adding an index on a frequently updated column (e.g. `last_seen_at`) disables that optimization and causes more table and index bloat plus more vacuum work. MySQL/InnoDB has a similar cost, since secondary index changes go through the change buffer and purge.

### 10. Bulk loads
Loading millions of rows into a heavily indexed table is much slower than loading into a bare table and building the indexes afterward. For large imports, a common approach is to drop or disable non-essential indexes, load the data, and then recreate them.

## Practical rule of thumb

- Index columns used in selective `WHERE`, `JOIN`, and `ORDER BY` clauses of frequent queries.
- Check your actual query plans with `EXPLAIN ANALYZE` rather than guessing.
- Review index usage periodically (`pg_stat_user_indexes` in PostgreSQL, `sys.schema_unused_indexes` in MySQL) and drop indexes that are never used.
- Treat every index as a trade: faster specific reads in exchange for slower writes, more storage, and more memory use.
````

### explain-index off 2

````markdown
## What an index is

An index is a separate data structure the database maintains alongside a table so it can find rows without scanning the whole table. It works like a book's index: instead of reading every page to find "B-tree," you look it up and jump to the page.

Most indexes are **B-trees** (or B+trees). They store the indexed column values in sorted order, with pointers back to the rows. Lookups, range scans (`BETWEEN`, `<`, `>`), `ORDER BY`, and joins on the indexed column then take O(log n) instead of O(n). Other types exist for specific cases: hash (equality only), GIN/inverted (full-text, arrays, JSON), GiST/R-tree (geospatial), and BRIN (very large, naturally ordered data).

```sql
CREATE INDEX idx_orders_customer ON orders (customer_id);
-- Now this avoids a full table scan:
SELECT * FROM orders WHERE customer_id = 42;
```

## When an index makes things worse

**1. Write-heavy workloads**
Every `INSERT`, `DELETE`, and every `UPDATE` that touches an indexed column must also update each index. A table with 8 indexes does roughly 9 writes per insert. On high-ingest tables (logs, events, metrics), extra indexes can cut write throughput significantly and increase lock contention.

**2. Low-selectivity columns**
An index on `is_active` (true/false) or `status` with three values rarely helps. If a query matches 40% of rows, following index pointers means a random I/O per row, which is slower than a sequential scan. Planners usually ignore such indexes, so you pay the write cost for nothing. Exception: *partial indexes* on a rare value, e.g. `WHERE status = 'failed'`, can work well.

**3. Small tables**
If the table fits in a few pages, a sequential scan is already cheap, and an index only adds overhead.

**4. Queries that can't use it**
The index sits unused (but still costs writes) when:
- A function wraps the column: `WHERE LOWER(email) = ...` won't use an index on `email` (use an expression index instead).
- A composite index is queried without its leading column: an index on `(last_name, first_name)` doesn't help `WHERE first_name = 'Ana'`.
- There's a leading wildcard: `LIKE '%smith'`.
- There's an implicit type cast, e.g. comparing a `varchar` column to a number.

**5. Redundant or overlapping indexes**
An index on `(a)` is mostly redundant if `(a, b)` exists. Duplicates double the maintenance cost and can confuse the planner.

**6. Planner picks it wrongly**
With stale statistics or skewed data, the optimizer may choose an index path that turns out far slower than a scan, e.g. a nested-loop join over millions of index lookups. A newly added index can cause a regression in a query that was previously fine.

**7. Storage and memory pressure**
Indexes take disk space and, more importantly, buffer cache / RAM. If indexes push hot data out of memory, overall performance falls, even for queries that don't use them.

**8. Bloat and maintenance**
In MVCC databases like PostgreSQL, frequently updated indexed columns cause index bloat and can block HOT updates, which increases vacuum work. Building an index on a large live table can also lock writes unless you use `CREATE INDEX CONCURRENTLY` or an equivalent.

## Rule of thumb

Index columns that appear in selective `WHERE` clauses, `JOIN` conditions, and `ORDER BY` for frequent queries. Check with `EXPLAIN ANALYZE` that the index actually gets used, and look for unused indexes periodically (`pg_stat_user_indexes` in Postgres, `sys.dm_db_index_usage_stats` in SQL Server). Every index is a trade: faster reads in exchange for slower writes and more storage. Add one only when a real query needs it.
````

### explain-index off 3

````markdown
## What an index is

An index is a separate data structure the database maintains alongside a table so it can find rows without scanning the whole table. It's like the index at the back of a book: instead of reading every page to find "B-tree," you look it up and jump to page 212.

Most indexes are **B-trees** (or B+ trees). They keep the indexed column values sorted, with pointers back to the rows. That makes these operations fast:

- **Equality lookups:** `WHERE email = 'a@b.com'` takes O(log n) instead of O(n)
- **Range scans:** `WHERE created_at BETWEEN ...`
- **Sorting:** `ORDER BY created_at` can read the index in order and skip the sort
- **Joins:** looking up matching rows on the join key

Other types exist for specific jobs: hash indexes (equality only), GIN/inverted indexes (full-text, JSON, arrays), GiST/R-tree (geospatial), and BRIN (huge, naturally ordered tables).

A **composite index** on `(a, b, c)` works like a phone book sorted by last name, then first name. It helps queries filtering on `a`, or `a` and `b`, but generally not queries filtering only on `b`. A **covering index** includes every column a query needs, so the database never has to touch the table.

## When an index makes things worse

### 1. Write-heavy workloads
Every `INSERT`, `DELETE`, and every `UPDATE` to an indexed column must also update each relevant index. A table with 8 indexes does roughly 9 structure writes per insert. That means more I/O, more WAL/redo log, more lock contention, and B-tree page splits. Tables that ingest a lot of data, such as logs, events, or metrics, can slow down badly from indexes that are rarely read.

### 2. Low-selectivity columns
An index on `is_active` where 95% of rows are `true` doesn't help, because the query still returns most of the table. Walking the index and then fetching each row by pointer (random I/O) is *slower* than one sequential scan. Good planners usually ignore such an index. You still pay its write and storage cost, and a planner with stale statistics may choose it anyway.

A partial index often fixes this: `CREATE INDEX ... WHERE is_active = false` indexes only the rare values.

### 3. Small tables
If the table fits in a few pages, a full scan is already nearly free. The index adds overhead with no benefit.

### 4. The planner picks the wrong index
More indexes give the optimizer more choices, and more chances to choose badly. This is common with skewed data or outdated statistics. A classic case is `ORDER BY id LIMIT 10` with a filter: the planner walks the primary key index expecting to find matches quickly, but the matching rows are rare and it ends up scanning millions of entries.

### 5. Memory and cache pressure
Indexes compete with table data for the buffer pool or page cache. Bloated or redundant indexes can push hot data out of memory, which slows unrelated queries. Every index also adds to backup size, replication traffic, and `VACUUM`/maintenance time.

### 6. Redundant or overlapping indexes
An index on `(a)` is mostly redundant if `(a, b)` already exists. You pay double the write cost for almost no read benefit.

### 7. Indexes the query can't use
The index sits there costing writes while queries skip it, for example:
- `WHERE LOWER(email) = ...` against a plain index on `email` (you need an expression index)
- `WHERE name LIKE '%smith'` (a leading wildcard defeats B-tree ordering)
- Implicit type casts, such as comparing a varchar column to a number
- Wrong column order in a composite index

### 8. Index creation itself
Building an index on a large table can lock writes for a long time. Use `CREATE INDEX CONCURRENTLY` in Postgres or online DDL in MySQL.

## Practical rules of thumb

- **Index for actual queries, not for columns.** Start from slow query logs or `pg_stat_statements`.
- **Check with `EXPLAIN ANALYZE`** before and after adding an index, and confirm the planner uses it and the query gets faster.
- **Find unused indexes periodically** (`pg_stat_user_indexes.idx_scan = 0` in Postgres, `sys.schema_unused_indexes` in MySQL) and drop them.
- **Measure write latency** too, not just read latency, when adding indexes to hot tables.
- **Prefer a few well-designed composite, covering, or partial indexes** over many single-column ones.

In short, an index trades write speed, storage, and memory for read speed. It hurts when you pay that cost and the reads don't benefit enough to cover it.
````

### explain-index on 1

````markdown
A database index is a separate, sorted data structure (usually a B-tree) that maps column values to row locations. The database can find matching rows without scanning the whole table, at the cost of extra storage and extra work on every write.

## What it buys you

- Fast lookups on `WHERE`, `JOIN`, and `ORDER BY` columns: O(log n) seeks instead of full scans.
- Sorted output without a sort step, if the index order matches the `ORDER BY`.
- Index-only scans when the index holds every column the query needs (a covering index), so the table is never read.

## When an index makes things worse

| Case | Why it hurts |
|---|---|
| Write-heavy tables | Every `INSERT`, `UPDATE` of an indexed column, and `DELETE` also updates each index. Ten indexes means roughly ten extra writes per row, plus more WAL/redo and replication volume. |
| Low-selectivity columns (`status`, `is_active`, booleans) | If a value matches a large share of rows, reading the index and then fetching each row randomly is slower than one sequential scan. The planner usually ignores the index, so you pay write cost for nothing. |
| Small tables | A full scan fits in a few pages. The index adds a lookup and gains nothing. |
| Queries that can't use it | `WHERE LOWER(email) = ...` on an index of `email`, `LIKE '%foo'`, implicit type casts, or filtering on the second column of a composite index without the first. The index is maintained but never read. |
| Redundant or overlapping indexes | An index on `(a)` next to one on `(a, b)` duplicates the write and memory cost. The composite already serves `WHERE a = ...`. |
| Memory pressure | Indexes compete with table data for the buffer pool. Too many push hot data out of RAM and turn cached reads into disk reads. |
| Bulk loads | Maintaining indexes row by row during a large import is much slower than dropping them, loading, and rebuilding. |
| Random-key clustered indexes (MySQL InnoDB with UUIDv4 primary keys) | Inserts land at random positions, causing page splits, fragmentation, and poor cache locality. Use sequential keys such as UUIDv7 or bigint. |
| Stale statistics or misestimates | The planner can pick an index scan that looks cheap but returns far more rows than estimated, which is slower than the scan it replaced. |

## How to decide

- Index for the queries you actually run, not for every column. Check with `EXPLAIN ANALYZE` (Postgres) or `EXPLAIN` / `EXPLAIN ANALYZE` (MySQL) before and after.
- In composite indexes, put equality columns first, then range or sort columns.
- Find unused indexes and remove them: `pg_stat_user_indexes` where `idx_scan = 0` in Postgres, or `sys.schema_unused_indexes` in MySQL. Check across a full business cycle first, since month-end or reporting queries may be the only users.
- Creating an index locks writes by default. On a live Postgres table use `CREATE INDEX CONCURRENTLY`, and in MySQL confirm the DDL runs as online (`ALGORITHM=INPLACE, LOCK=NONE`).
````

### explain-index on 2

````markdown
A database index is a separate, sorted structure (usually a B-tree) that maps column values to row locations, so the database can find matching rows without scanning the whole table. Every index speeds up some reads and slows down every write to that table.

## What it costs

- **Writes:** each INSERT, DELETE, and UPDATE of an indexed column must also update every affected index. Ten indexes on a table means roughly ten extra writes per row change.
- **Storage and memory:** indexes compete with table data for the buffer pool or page cache. Once hot indexes no longer fit in RAM, both reads and writes slow down.
- **Planner risk:** more indexes give the query planner more ways to choose a bad plan.

## When adding one makes things worse

| Case | Why it hurts | What to do |
|---|---|---|
| Write-heavy table with rare reads on that column | Every write pays the maintenance cost, and almost no query benefits | Skip the index, or index only what hot queries need |
| Low-selectivity column (boolean, status with 3 values) | If a value matches a large share of rows, index lookup plus random row fetches is slower than a sequential scan. It still costs every write | Use a partial index on the rare value, e.g. `WHERE status = 'pending'` |
| Query returns a large fraction of the table | Same random-I/O problem as above | Let it scan, or use a covering index so the table is never touched |
| Small table | A full scan of a few pages beats an index lookup | No index beyond the primary key |
| Redundant indexes, e.g. `(a)` next to `(a, b)` | `(a, b)` already serves queries on `a`, so `(a)` is pure write and memory cost | Drop the narrower one |
| Random keys (UUIDv4) as a clustered primary key (InnoDB, SQL Server) | Inserts land on random pages, causing page splits, fragmentation, and a larger working set | Use UUIDv7 or a sequential key |
| Planner picks the new index badly | Common case: `ORDER BY created_at LIMIT 10` with a filter on another column. The planner walks the `created_at` index expecting early matches and reads millions of rows | Add a composite index matching filter then sort, e.g. `(user_id, created_at)` |
| Index the query cannot use | `WHERE lower(email) = ...` against an index on `email`, or `LIKE '%foo'`. All cost, no benefit | Index the expression, or change the query |
| Bulk loads | Maintaining indexes row by row is much slower than building once | Drop indexes, load, recreate |
| Building on a large live table | A plain `CREATE INDEX` blocks writes for the whole build | `CREATE INDEX CONCURRENTLY` (Postgres) or `ONLINE = ON` (SQL Server) |

## How to decide

- Confirm the target query actually uses the index and gets faster with `EXPLAIN ANALYZE`, run on production-sized data. Plans on small dev data are often different.
- Find indexes that cost writes but serve no reads. In Postgres, `idx_scan = 0` in `pg_stat_user_indexes` over a representative period. In SQL Server, `sys.dm_db_index_usage_stats`.
````

### explain-index on 3

````markdown
An index is a separate sorted structure, usually a B-tree, that maps column values to row locations. It lets the database find matching rows without scanning the whole table. You get faster reads on those columns, and you pay for it with extra work on every write, extra storage and extra memory.

## When an index makes performance worse

| Case | Why it hurts | What to do instead |
|---|---|---|
| Write-heavy table with many indexes | Every INSERT and DELETE, and every UPDATE that touches an indexed column, has to update each index. This raises write latency, lock time and WAL/redo volume. | Keep only the indexes that real queries use. |
| Low-selectivity column (`status`, booleans) | If a query matches a large share of rows (roughly over 5 to 20%), random lookups through the index cost more than a sequential scan. The planner usually skips the index, so you pay the write cost for nothing. | Use a partial index on the rare value, e.g. `WHERE status = 'failed'`, or a composite index led by a selective column. |
| Redundant index, e.g. `(a)` when `(a, b)` exists | The leading column of `(a, b)` already serves `WHERE a = ?`, so the extra index only adds write cost. | Drop it. |
| Random keys (UUIDv4) as a clustered primary key in InnoDB or SQL Server | Inserts land on random pages. That causes page splits, fragmentation and cache misses. | Use UUIDv7 or a bigint identity. |
| Total index size larger than available memory | Indexes compete with table data for the buffer pool, so hot reads start going to disk. | Remove unused indexes, or use covering and partial indexes to keep them small. |
| Planner picks the new index over a better plan | Stale statistics or skewed data can make a new index look cheaper than it is. Queries that were fine before get slower. | Run `EXPLAIN ANALYZE` on your key queries before and after adding the index. |
| Frequently updated column in Postgres | An index on that column blocks HOT updates. Every update then writes new index entries, which adds bloat and vacuum load. | Leave that column out of the index unless queries need it. |
| Bulk load into an indexed table | Maintaining the index row by row is much slower than building it once. | Drop or disable the index, load the data, then rebuild. |
| Creating an index on a large live table | A plain `CREATE INDEX` blocks writes until the build finishes. | Use `CREATE INDEX CONCURRENTLY` in Postgres or `ALGORITHM=INPLACE, LOCK=NONE` / `ONLINE = ON` in MySQL and SQL Server. |

## Finding indexes that cost more than they return

- **Postgres:** look for rows in `pg_stat_user_indexes` with `idx_scan = 0` that have existed for a full business cycle. Check replicas too, because the counts are tracked per server.
- **SQL Server:** in `sys.dm_db_index_usage_stats`, look for indexes where `user_updates` is high and `user_seeks + user_scans` is near zero.
- **MySQL:** query `sys.schema_unused_indexes`.

The claude.ai Canva, Gmail, Google Calendar and Google Drive connectors need authorization in your claude.ai connector settings before they can be used. This doesn't affect this answer.
````

## explain-thread

Prompt:

````text
What is the difference between a process and a thread, and when should I pick one over the other?
````

### explain-thread off 1

````markdown
# Processes vs. threads

## The core difference

A **process** is a running program with its own memory. The OS gives each process a separate virtual address space, its own handles and file descriptors, and its own security context. One process can't read another's memory unless they set up a way to share it.

A **thread** is a path of execution inside a process. All threads in a process share the same memory, heap, globals and open files. Each thread has only its own stack, register state and thread-local storage.

| Aspect | Process | Thread |
|---|---|---|
| Memory | Separate from other processes | Shared with other threads in the process |
| Startup cost | High (especially on Windows) | Low |
| Context switch | More expensive (address-space switch, TLB flush) | Cheaper |
| Communication | Needs IPC: pipes, sockets, shared memory, message queues | Direct access to shared variables |
| Fault isolation | A crash stays inside that process | One bad thread can take down the whole process |
| Main risk | Serialization overhead, more complex setup | Data races, deadlocks, memory corruption |
| Security boundary | Yes | No |

## When to use processes

- **Isolation matters.** Use processes for untrusted or crash-prone code, plugins, or anything that parses hostile input. Browsers run each tab in its own process for this reason.
- **Different privileges.** For example, a low-privilege worker alongside a privileged broker.
- **Your runtime can't run threads in parallel.** CPython's GIL is the classic case, so `multiprocessing` is used for CPU-bound work. Free-threaded Python builds are changing this, but many libraries still assume the GIL.
- **Scaling across machines.** If the work may later move to other hosts, design around message passing from the start.
- **Independent lifecycles.** Components that you restart, upgrade or monitor separately, such as microservices or worker pools managed by a supervisor.
- **Long-running services where leaks build up.** You can kill and replace a worker process to get a clean state.

## When to use threads

- **Tasks need a lot of shared state.** Copying or serializing that data between processes would be too expensive.
- **CPU-bound parallel work in a language with real threads**, like C, C++, Rust, Java, C# or Go. Examples include image processing and parallel computation over shared data.
- **Low latency and many short tasks.** Thread pools avoid the cost of starting a process for each task.
- **Keeping a UI responsive.** Move blocking work to a background thread so the UI thread stays free.

## A third option: async / event loops

For **I/O-bound** work with many concurrent connections, like network servers or API clients, you often need neither extra threads nor extra processes. `async`/`await` in Python, JS, C# or Rust, or Go's goroutines, can handle thousands of concurrent operations with little overhead. Threads are still useful there for work that blocks.

## Rules of thumb

1. **I/O-bound:** use async first, threads second.
2. **CPU-bound with real threads available:** use a thread pool.
3. **CPU-bound in Python (with the GIL) or Node:** use multiple processes or worker processes.
4. **Untrusted input, or you need crash or security isolation:** use processes.
5. **Heavy shared mutable state:** use threads, but protect the state with locks or channels. Better still, reduce how much state is shared.
6. **Windows note:** starting a process costs noticeably more than on Linux, which has `fork` and copy-on-write. So on Windows, keep a pool of long-lived worker processes instead of starting one per task.

Many real systems use both. Nginx, Chrome and PostgreSQL run several processes for isolation and use threads or event loops inside each one for throughput.
````

### explain-thread off 2

````markdown
## Process vs. thread

**Process:** a running program with its own isolated address space. The OS gives each process its own memory, file handles, and security context. One process can't read another's memory directly, so processes have to talk through IPC: pipes, sockets, shared memory, message queues.

**Thread:** a unit of execution *inside* a process. All threads in a process share the same memory (heap, globals, open files). Each thread has only its own stack, register state and thread-local storage.

| | Process | Thread |
|---|---|---|
| Memory | Isolated | Shared with other threads in the process |
| Creation and context-switch cost | Higher (new address space, page tables) | Lower |
| Communication | IPC (serialization, copying) | Direct shared memory (needs locks) |
| Fault isolation | A crash stays inside that process | One bad thread can take down the whole process |
| Security boundary | Yes (separate privileges, sandboxing) | No |
| Main bug types | IPC overhead, serialization bugs | Race conditions, deadlocks, data corruption |
| Windows specifics | `CreateProcess` is fairly expensive; there's no `fork()` | Threads are cheap and first-class |

## When to pick processes

- **You need isolation or resilience.** If one part crashes or leaks memory, the rest should keep running. Examples: browser tabs, worker pools that restart failed workers, plugin hosts.
- **You need a security boundary.** Untrusted code, sandboxing, or parts running with different privileges.
- **The runtime limits parallel threads.** CPython's GIL is the classic case: for CPU-bound Python, `multiprocessing` or `ProcessPoolExecutor` gets real parallelism. Free-threaded Python builds are changing this, but most of the ecosystem still assumes the GIL.
- **You need to scale beyond one machine.** A process-based design (workers talking over sockets or queues) moves to distributed systems more easily.
- **The components are independent**, possibly written in different languages or deployed separately.

## When to pick threads

- **Tasks need to share a lot of state**, and copying it between processes would be too slow. Examples: a shared in-memory cache, or a large dataset being processed in parallel.
- **You need low-latency coordination.** Handing work back and forth frequently is much cheaper inside one address space.
- **You want CPU parallelism in a language with real threads** (C, C++, Rust, Java, C#, Go).
- **You have many lightweight concurrent tasks** and process overhead would add up.
- **You need a responsive UI.** Keep the UI thread free and push slow work to a background thread.

## A third option: async / event loops

For **I/O-bound** work, such as thousands of network connections, you often don't need extra threads or processes at all. `async/await` (asyncio, Node.js, Tokio, C# `Task`) handles large amounts of concurrent I/O on a few threads, and it avoids most locking.

## Quick rule of thumb

1. **Mostly waiting on I/O?** Use async first, or a thread pool.
2. **CPU-bound with shared data, in a language with real threads?** Use threads, ideally through a pool or a higher-level tool (Rayon, `Parallel.For`, `ExecutorService`).
3. **CPU-bound in Python (with the GIL) or another runtime that can't run threads in parallel?** Use processes.
4. **Need isolation, crash tolerance, or a security boundary?** Use processes.
5. **Not sure?** Pick the simplest option that meets your performance needs. Shared-memory threading bugs are among the hardest to debug, so only choose threads when you actually benefit from sharing memory.

Many real systems mix these. Nginx and PostgreSQL run multiple processes for isolation. Chrome runs a process per site, with threads inside each process. A typical web backend runs several worker processes, each with an async event loop or thread pool.
````

### explain-thread off 3

````markdown
# Processes vs. threads

## The core difference

A **process** is a running program with its own memory. The OS keeps processes apart: one process can't read or write another's memory unless you set up a way for them to talk (pipes, sockets, shared memory, etc.).

A **thread** is a path of execution *inside* a process. Every process has at least one thread. All threads in a process share its heap, globals, open files and other resources. Each thread has only its own stack, register state and thread-local storage.

| | Process | Thread |
|---|---|---|
| Memory | Separate address space | Shared with other threads in the same process |
| Isolation | Strong. A crash usually affects only that process | Weak. One bad pointer or unhandled exception can take down every thread |
| Creation cost | Higher (new address space, handle tables; on Windows `CreateProcess` is especially heavy) | Lower (mostly just a stack and a kernel object) |
| Context switch | More expensive (address-space switch, TLB effects) | Cheaper |
| Communication | Explicit IPC: pipes, sockets, shared memory, message queues | Direct: just read and write shared variables |
| Sync hazards | Few, because nothing is shared by default | Data races, deadlocks, need for locks and atomics |
| Security boundary | Yes. Can run with different privileges or sandboxing | No |
| Scaling across machines | Maps naturally to distributed designs | Limited to one machine |

## When to pick processes

- **You need fault isolation.** If one worker crashes, the rest keep running. This is why Chrome runs each tab in its own process and why many servers use supervisor and worker processes.
- **You need a security or privilege boundary.** Examples: sandboxing untrusted input such as parsers, plugins or user code, or dropping privileges for part of the work.
- **You're running separate or untrusted code**, like plugins, third-party binaries, or anything that might leak memory or hang. You can kill a process cleanly, but you can't safely kill a thread.
- **Your runtime limits parallel threads.** CPython's GIL is the classic case (the free-threaded 3.13+ builds are changing this), so `multiprocessing` or `ProcessPoolExecutor` is the usual choice for CPU-bound Python work. Node.js has a similar story.
- **The work is naturally independent** and exchanges little data, so IPC overhead doesn't matter.
- **You might later spread the work across machines.** A design built on message passing between processes moves to a distributed system easily.

## When to pick threads

- **The tasks share a lot of state** or pass large data back and forth, and copying or serializing it between processes would cost too much.
- **You need low-latency coordination**, such as a UI thread plus background workers, or a game loop with render, audio and physics threads.
- **You're doing CPU-bound parallel work in a language with real threads**, like C, C++, Rust, Java, C# or Go. A thread pool is usually the right default there.
- **You'll create many short-lived tasks** and process startup cost would dominate.
- **Memory is tight.** N threads use far less than N processes.

## A third option for I/O-bound work

If most of the waiting is on the network or disk, you often need neither many threads nor many processes. **Async I/O or event loops** (`async/await`, epoll/IOCP, Node, Go's goroutines, Java virtual threads) can handle thousands of concurrent connections on a few OS threads.

## A rule of thumb

1. **I/O-bound with lots of concurrency:** async, or lightweight or green threads.
2. **CPU-bound with shared data, in a language with real parallelism:** a thread pool.
3. **CPU-bound in a GIL-limited runtime, or tasks that don't share much:** a process pool.
4. **Need crash isolation, security boundaries, or running untrusted code:** processes, whatever the performance cost.

Many real systems mix these. For example, a web server might run several worker processes for isolation and use multiple CPU cores, with each worker running a thread pool or event loop inside.
````

### explain-thread on 1

````markdown
A process has its own memory space. Threads run inside one process and share its memory. Use threads when tasks need to share state cheaply. Use processes when you need isolation or true CPU parallelism in a runtime that blocks it.

| | Thread | Process |
|---|---|---|
| Memory | Shared with other threads in the process | Separate by default |
| Start and context-switch cost | Low | Higher, and much higher on Windows (see below) |
| Communication | Direct access to shared data, guarded by locks | IPC (pipes, sockets, shared memory, queues) with serialization cost |
| One crashes | Takes down the whole process | The others keep running |
| Security boundary | None | OS-enforced, can run with different privileges |
| Main bug risk | Data races, deadlocks | Slow or complex IPC, higher memory use |

**Pick threads when**
- Tasks share a lot of in-memory state and pass it back and forth often. Copying it between processes would cost more than the locking.
- The work is I/O-bound (network, disk) and you have tens to hundreds of concurrent tasks. At thousands of concurrent waits, async I/O usually beats both.
- You need to hand work off quickly, like a UI thread passing a job to a background worker.

**Pick processes when**
- The work is CPU-bound and the runtime serializes threads. The main case is CPython's GIL, unless you run the free-threaded build and your C extensions support it.
- A crash or memory leak must not take down everything else. Examples are browser tabs, plugin hosts, and worker pools you recycle every N jobs.
- You run untrusted code or need different privileges per component.
- The work may later spread across machines. Code that already talks over IPC moves to the network more easily.

**Pitfalls that affect the choice**
- Windows has no `fork`, so new processes start from scratch and re-import everything. Create a pool once and reuse it instead of spawning a process per task.
- On POSIX, calling `fork` in a process that already has threads copies only the calling thread. Locks held by other threads stay locked in the child forever. Use spawn, or fork before starting threads.
- In Go, Java, C#, Rust and C++, threads already run on multiple cores. There, choose processes only for isolation, not for speed.

Default to threads or async in one process. Switch to processes when you hit one of the process cases above.
````

### explain-thread on 2

````markdown
A process has its own memory space. A thread runs inside a process and shares that process's memory with the other threads in it. Use threads when tasks need to share a lot of state cheaply. Use processes when you need isolation or true CPU parallelism in a runtime that blocks it.

| | Process | Thread |
|---|---|---|
| Memory | Separate. Sharing needs IPC, pipes, sockets or shared memory | Shared. Any thread can read or write any object |
| Crash impact | A crash stays inside that process | A crash, segfault or unhandled panic kills every thread in the process |
| Startup and switching cost | Higher, most noticeable on Windows where there is no `fork` | Lower |
| Main bug risk | Serialization overhead, IPC failures | Data races, deadlocks, heisenbugs |
| Security boundary | Yes, the OS enforces it | No |

**Pick processes when:**
- One task failing must not take down the others, such as browser tabs, worker pools running untrusted or unstable code, or plugin hosts.
- You need privilege separation or sandboxing.
- You run CPU-bound work in CPython (before free-threaded 3.13+ builds), or in Node or Ruby MRI. Their interpreter locks or single-threaded event loops stop threads from running in parallel.
- You want to scale across machines later. A process design that talks over IPC moves to network calls more easily.

**Pick threads when:**
- Tasks share large in-memory data, and copying or serializing it across processes would cost more than the work itself.
- You need low-latency handoffs between tasks, such as a render thread and a game logic thread.
- You are in a runtime with real parallel threads, such as Java, Go, C#, Rust or C++, and the work is CPU-bound.

**Pick neither for I/O-bound concurrency at scale.** Thousands of network connections are better served by async/await, an event loop or goroutines. OS threads cost memory per stack (often around 1 MB reserved), and thousands of them waste memory and time on context switches.

**Common hybrid:** run one process per CPU core for isolation and to get around interpreter locks, with a thread pool or async loop inside each. Gunicorn workers, Chrome and PostgreSQL work this way. PostgreSQL uses processes only, as a deliberate choice for robustness.
````

### explain-thread on 3

````markdown
A process has its own memory space and a thread shares memory with the other threads in its process. Use threads when tasks need fast access to shared state. Use processes when you need isolation.

| | Process | Thread |
|---|---|---|
| Memory | Separate. Data moves through IPC (pipes, sockets, shared memory) and is usually serialized | Shared heap, one stack per thread |
| Failure | A crash stays inside that process | A segfault or unhandled fault kills every thread in the process |
| Cost | Slower to start and uses more memory. Process creation on Windows is especially slow | Cheap to create and switch |
| Typical bugs | Serialization overhead, IPC plumbing | Data races, deadlocks |
| Security boundary | Enforced by the OS. Can run with different privileges | None |

**Pick threads when:**
- Workers read or change large in-memory state and copying it would cost more than locking it.
- Handoffs between tasks must be low latency.
- You are in Go, Java, C#, or Rust, where a thread pool is the normal default for CPU work.

**Pick processes when:**
- You run untrusted code, plugins, or unstable native libraries. This is why browsers use one process per tab.
- You do CPU-bound work in CPython. The GIL stops threads from running Python code in parallel. The free-threaded build (3.13+) removes this limit, but only if your C extensions support it.
- Workers need to restart on their own, for example to clear memory leaks (gunicorn `max_requests`) or to be deployed separately.
- You may spread the work across machines later. Code that already passes messages between processes is easier to move.

**Traps that change the choice:**
- If the work mostly waits on I/O, async (an event loop) usually beats both. It handles thousands of connections with far less memory than one thread per connection.
- Calling `fork()` in a multithreaded program copies only the calling thread. If another thread held a lock at that moment, the lock stays held forever in the child. Use spawn instead.
- Windows has no `fork()`, so Python `multiprocessing` always uses spawn there. Each worker re-imports your modules, which makes startup slow. Also, code that is not under `if __name__ == "__main__":` runs again in every worker.
````

## debug-foreach

Prompt:

````text
Why does saveAll log "saved" before the files are written?

```js
async function saveAll(items) {
  items.forEach(async (item) => {
    await fs.promises.writeFile(`out/${item.id}.json`, JSON.stringify(item));
  });
  console.log("saved");
}
```
````

### debug-foreach off 1

````markdown
The problem is that `forEach` ignores the promises your callback returns.

An `async` callback returns a promise as soon as it hits its first `await`. `forEach` calls the callback once per item, throws each returned promise away, and returns `undefined` right after starting every write. Nothing makes `saveAll` wait, so `console.log("saved")` runs while the writes are still going. The outer `async` doesn't help, because there's no `await` in `saveAll` itself.

It also causes two quieter bugs:
- **Callers can't wait for it.** `await saveAll(items)` resolves before the files are written.
- **Errors get lost.** If a write fails, `saveAll`'s promise doesn't reject. You get an unhandled rejection instead.

## Fix 1: Write in parallel with `Promise.all`

```js
async function saveAll(items) {
  await Promise.all(
    items.map((item) =>
      fs.promises.writeFile(`out/${item.id}.json`, JSON.stringify(item))
    )
  );
  console.log("saved");
}
```

`map` keeps the promises and `Promise.all` waits for all of them. If any write fails, `saveAll` rejects. Use `Promise.allSettled` if you want every write to finish even when some fail.

## Fix 2: Write one at a time with `for...of`

```js
async function saveAll(items) {
  for (const item of items) {
    await fs.promises.writeFile(`out/${item.id}.json`, JSON.stringify(item));
  }
  console.log("saved");
}
```

This is slower, but only one file is open at a time. That matters when `items` is large, because thousands of parallel writes can hit `EMFILE` (too many open files). If you need both speed and a cap, write in batches or use a concurrency limiter like `p-limit`.

**The general rule:** `forEach`, `filter`, `some` and `reduce` don't wait for async callbacks. Use `for...of` to go one at a time, or `map` plus `Promise.all` to run in parallel.
````

### debug-foreach off 2

````markdown
The problem is `forEach`. It ignores whatever your callback returns, and an `async` callback returns a promise, so those promises get thrown away.

Here's what happens when `saveAll` runs:

1. `forEach` calls the async callback once per item. Each call runs up to its first `await`, starts `writeFile`, and returns a pending promise right away.
2. `forEach` discards those promises and returns `undefined` synchronously.
3. `console.log("saved")` runs next, while every write is still pending.
4. The writes finish later.

The `await` inside the callback only pauses that one callback. It doesn't pause `saveAll`. Since `saveAll` never awaits anything, its own promise also resolves before the writes finish, so `await saveAll(items)` won't wait either. A failed write also becomes an unhandled rejection instead of an error the caller can catch.

## Fix

**Run the writes in parallel** by collecting the promises and awaiting them all:

```js
async function saveAll(items) {
  await Promise.all(
    items.map((item) =>
      fs.promises.writeFile(`out/${item.id}.json`, JSON.stringify(item))
    )
  );
  console.log("saved");
}
```

**Run the writes one at a time** with `for...of`, which does respect `await`:

```js
async function saveAll(items) {
  for (const item of items) {
    await fs.promises.writeFile(`out/${item.id}.json`, JSON.stringify(item));
  }
  console.log("saved");
}
```

Use `Promise.all` if you want speed. Use `for...of` if you need the writes in order or want to limit how many files are open at once. With both versions, `saveAll`'s promise waits for every write, and a failed write rejects it so the caller can catch the error. If you want every write attempted even when some fail, use `Promise.allSettled`.

The same problem applies to `filter`, `some`, `reduce` and any other array method that doesn't know about promises. Only `map` combined with `Promise.all` works, because `map` keeps the returned promises.
````

### debug-foreach off 3

````markdown
`forEach` doesn't wait for async callbacks. It calls each callback, and each one returns a Promise that `forEach` just throws away. The `await` inside the callback only pauses that one callback. It doesn't pause `saveAll`.

Here's the order things happen in:
1. `forEach` runs every callback at once. Each one starts its `writeFile` and hits `await`, which hands control back right away.
2. `forEach` returns as soon as every callback has started.
3. `console.log("saved")` runs while the writes are still in progress.
4. The writes finish later. Any error from them becomes an unhandled rejection that `saveAll`'s caller never sees.

So `saveAll`'s own Promise resolves before any file has been written.

## Fix

**Parallel writes** (usually the best choice):
```js
async function saveAll(items) {
  await Promise.all(
    items.map((item) =>
      fs.promises.writeFile(`out/${item.id}.json`, JSON.stringify(item))
    )
  );
  console.log("saved");
}
```
`map` gives you an array of Promises, and `Promise.all` waits for all of them. If any write fails, the error is thrown from `saveAll`.

**One write at a time** (if order matters or you want to limit load):
```js
async function saveAll(items) {
  for (const item of items) {
    await fs.promises.writeFile(`out/${item.id}.json`, JSON.stringify(item));
  }
  console.log("saved");
}
```
`for...of` really does pause at each `await`.

If one failure shouldn't stop the others, use `Promise.allSettled` and check the results. If you're writing thousands of files, write them in batches or use a concurrency limiter like `p-limit` so you don't run out of file handles (`EMFILE`).
````

### debug-foreach on 1

````markdown
`forEach` doesn't wait for the promises your async callback returns. It starts every write and returns right away, so `console.log` runs before any write finishes.

- `saveAll`'s own promise also resolves early, so a caller that does `await saveAll(items)` still moves on before the files exist.
- A failed write becomes an unhandled promise rejection instead of making `saveAll` reject, so the caller never sees the error.

Fix for parallel writes:

```js
async function saveAll(items) {
  await Promise.all(
    items.map((item) =>
      fs.promises.writeFile(`out/${item.id}.json`, JSON.stringify(item))
    )
  );
  console.log("saved");
}
```

Use a `for...of` loop with `await` inside if you want one write at a time. That's slower, but it avoids hitting the open-file limit (`EMFILE`) when `items` is very large:

```js
for (const item of items) {
  await fs.promises.writeFile(`out/${item.id}.json`, JSON.stringify(item));
}
```
````

### debug-foreach on 2

````markdown
`forEach` ignores the promises your async callback returns, so `saveAll` never waits for the writes. The loop starts all the writes, `console.log("saved")` runs right away, and the writes finish later.

- The `await` inside the callback only pauses that one callback. It does not pause `saveAll`.
- Write errors are also lost. They become unhandled rejections instead of rejecting `saveAll`, so a caller's `try/catch` never sees them.

To run the writes in parallel:

```js
async function saveAll(items) {
  await Promise.all(
    items.map((item) =>
      fs.promises.writeFile(`out/${item.id}.json`, JSON.stringify(item))
    )
  );
  console.log("saved");
}
```

To write one file at a time, which keeps the number of open file handles low for large arrays:

```js
async function saveAll(items) {
  for (const item of items) {
    await fs.promises.writeFile(`out/${item.id}.json`, JSON.stringify(item));
  }
  console.log("saved");
}
```

`Promise.all` rejects on the first failure, but the other writes keep running. Use `Promise.allSettled` if you need to know the result of every write.
````

### debug-foreach on 3

````markdown
`forEach` ignores the promises your async callback returns, so it starts every write and returns immediately without waiting for any of them.

- `saveAll` itself never awaits anything, so `console.log("saved")` runs right after the writes are started.
- A rejected write also goes nowhere. It becomes an unhandled rejection instead of an error `saveAll`'s caller can catch.

Fix for parallel writes:

```js
async function saveAll(items) {
  await Promise.all(
    items.map((item) =>
      fs.promises.writeFile(`out/${item.id}.json`, JSON.stringify(item))
    )
  );
  console.log("saved");
}
```

If you need writes one at a time, for example to limit open file handles on a large `items`, use a loop instead:

```js
for (const item of items) {
  await fs.promises.writeFile(`out/${item.id}.json`, JSON.stringify(item));
}
```
````

## debug-default-arg

Prompt:

````text
This function keeps returning tags from earlier calls. Why, and how do I fix it?

```python
def add_tag(tag, tags=[]):
    tags.append(tag)
    return tags
```
````

### debug-default-arg off 1

````markdown
This is Python's mutable default argument problem.

**Why it happens:** Python evaluates default values once, when the `def` runs, not each time you call the function. So `tags=[]` creates a single list object that is stored on the function. Every call that leaves out `tags` gets that same list, and `append` changes it in place. The changes carry over from one call to the next:

```python
add_tag("a")  # ['a']
add_tag("b")  # ['a', 'b']   <- same list as before
```

You can see the shared list directly with `add_tag.__defaults__`.

**Fix:** Use `None` as the default and create a new list inside the function:

```python
def add_tag(tag, tags=None):
    if tags is None:
        tags = []
    tags.append(tag)
    return tags
```

Now every call without `tags` gets its own empty list:

```python
add_tag("a")  # ['a']
add_tag("b")  # ['b']
```

Check with `is None` rather than `tags = tags or []`. The `or` version replaces an empty list the caller passed in with a new one, so the caller's list never gets the appended tag.

**Related points:**
- The same thing happens with any mutable default, such as `{}`, `set()`, or custom objects.
- If callers pass in their own list, the function still changes that list. If you don't want that, build a new one instead: `return [*(tags or []), tag]`.
- Linters catch this. Ruff/flake8-bugbear flags it as `B006`, and Pylint flags it as `W0102 dangerous-default-value`.
````

### debug-default-arg off 2

````markdown
## Why it happens

Python evaluates default argument values **once, when the function is defined**, not each time it's called. So `tags=[]` makes one list object that is stored on the function and reused. Every call that doesn't pass `tags` appends to that same list:

```python
>>> add_tag("a")
['a']
>>> add_tag("b")
['a', 'b']        # same list as before
>>> add_tag.__defaults__
(['a', 'b'],)     # the shared list is stored on the function
```

This affects any mutable default, such as `[]`, `{}`, `set()` or a custom object.

## The fix

Use `None` as a placeholder and create a new list inside the function:

```python
def add_tag(tag, tags=None):
    if tags is None:
        tags = []
    tags.append(tag)
    return tags
```

Now each call without `tags` gets its own empty list:

```python
>>> add_tag("a")
['a']
>>> add_tag("b")
['b']
```

## Other things to know

- **Use `is None`, not `if not tags`.** If a caller passes their own empty list, `if not tags` would replace it with a new list, and their list would never get the tag.
- **Passed-in lists still change.** `add_tag("x", my_list)` adds to `my_list` itself. If you'd rather not change the caller's list, copy it first:
  ```python
  def add_tag(tag, tags=None):
      tags = list(tags) if tags is not None else []
      tags.append(tag)
      return tags
  ```
- **Linters catch this.** Pylint (`W0102 dangerous-default-value`) and Ruff/flake8-bugbear (`B006`) warn about mutable defaults.
````

### debug-default-arg off 3

````markdown
This is Python's mutable default argument problem.

**Why it happens:** Python evaluates default values once, when the `def` statement runs, not each time you call the function. So `tags=[]` makes one list that is stored on the function object. Every call that doesn't pass `tags` gets that same list. Your `append` changes it, and the change carries over to the next call.

```python
add_tag("a")   # ['a']
add_tag("b")   # ['a', 'b']   <- same list as before
add_tag.__defaults__   # (['a', 'b'],)  <- the shared list lives here
```

**Fix:** Use `None` as the default and create a new list inside the function:

```python
def add_tag(tag, tags=None):
    if tags is None:
        tags = []
    tags.append(tag)
    return tags
```

Now each call without `tags` gets its own empty list:

```python
add_tag("a")   # ['a']
add_tag("b")   # ['b']
```

**Notes:**
- Write `if tags is None`, not `if not tags`. With `not tags`, a caller who passes their own empty list would get a new list back and their list would never change.
- If you don't want to change the caller's list either, copy it first: `tags = [] if tags is None else list(tags)`. Or skip the mutation and `return [*(tags or []), tag]`.
- The same thing happens with any mutable default, such as `{}`, `set()` or class instances. Linters flag it: Pylint `W0102 dangerous-default-value`, Ruff/flake8-bugbear `B006`.
````

### debug-default-arg on 1

````markdown
The default list is created once, when the function is defined, so every call that skips `tags` appends to that same list.

Use `None` as the default and create a new list inside the function:

```python
def add_tag(tag, tags=None):
    if tags is None:
        tags = []
    tags.append(tag)
    return tags
```

- Use `is None`, not `if not tags`. With `if not tags`, a caller who passes their own empty list gets a new list back, and their list is never changed.
- The same bug happens with any mutable default, such as `{}`, `set()`, or an object instance.
- When a caller passes a list, the function still changes that list in place. If you don't want that, build a new list with `tags = [*(tags or []), tag]`.
````

### debug-default-arg on 2

````markdown
The default list is created once, when the `def` runs, not on each call. Every call that leaves out `tags` appends to that same list.

Fix it with a `None` default and create the list inside the function:

```python
def add_tag(tag, tags=None):
    if tags is None:
        tags = []
    tags.append(tag)
    return tags
```

- Check `is None`, not `if not tags`. With `if not tags`, a caller who passes their own empty list gets a new list back, and their list never changes.
- The function still changes a list the caller passes in. If callers shouldn't see their list change, use `tags = list(tags)` before appending.
- The same problem happens with any mutable default, such as `{}`, `set()` or an object instance.
````

### debug-default-arg on 3

````markdown
The default list is built once, when the function is defined, so every call that skips `tags` appends to that same list. Use `None` as the default and create a new list inside the function:

```python
def add_tag(tag, tags=None):
    if tags is None:
        tags = []
    tags.append(tag)
    return tags
```

- Check with `is None`, not `if not tags`. With `if not tags`, a caller who passes their own empty list gets a new list back, and their list never changes.
- The function still changes a list that the caller passes in. If callers don't expect that, copy it first with `tags = list(tags)`.
````

## debug-docker

Prompt:

````text
My container exits right after `docker run -d myimage`. The Dockerfile is based on ubuntu:24.04, installs nginx, and ends with `CMD service nginx start`. What is wrong?
````

### debug-docker off 1

````markdown
A container only runs as long as its main process (PID 1) is running. When that process exits, the container stops.

`service nginx start` is a launcher script. It starts nginx as a **background daemon** and then exits right away. The script was PID 1, so the container stops as soon as it finishes, and nginx stops with it.

## Fix

Run nginx in the **foreground** so it becomes the long-running main process:

```dockerfile
FROM ubuntu:24.04
RUN apt-get update && apt-get install -y nginx && rm -rf /var/lib/apt/lists/*
EXPOSE 80
STOPSIGNAL SIGQUIT
CMD ["nginx", "-g", "daemon off;"]
```

- **`daemon off;`** tells nginx not to fork into the background, so the process keeps running.
- **Exec form** (`["nginx", ...]` instead of a plain string) runs nginx directly as PID 1 rather than wrapping it in `/bin/sh -c`. This way nginx receives signals from `docker stop` and shuts down cleanly.
- **`STOPSIGNAL SIGQUIT`** makes nginx shut down gracefully. The official nginx image does the same.

## Common workarounds to avoid

- `CMD service nginx start && tail -f /dev/null`: the container stays up, but PID 1 is `tail`, not nginx. If nginx crashes, the container still looks healthy, and signals never reach nginx.
- `service`/`systemctl` in general: containers don't run an init system, so service managers don't fit this model.

## Checking the problem

- `docker ps -a` shows the container with status `Exited (0)`. Exit code 0 means nothing crashed; the main process just finished.
- `docker logs <container>` usually shows only the "Starting nginx" message.

Also consider basing the image on `nginx` (or `nginx:alpine`) instead of `ubuntu:24.04`. It's already set up this way, and the image is much smaller.
````

### debug-docker off 2

````markdown
A container only runs as long as its main process (PID 1) runs. When that process exits, the container stops.

`service nginx start` doesn't keep running. It starts nginx as a background daemon and then exits right away. When it exits, Docker sees PID 1 is gone and stops the container, which kills nginx too.

## Fix

Run nginx in the foreground so nginx itself is the main process:

```dockerfile
FROM ubuntu:24.04

RUN apt-get update \
 && apt-get install -y --no-install-recommends nginx \
 && rm -rf /var/lib/apt/lists/*

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

- **`daemon off;`** stops nginx from forking into the background, so it stays attached as PID 1.
- **Exec form (`["..."]`)** runs nginx directly instead of wrapping it in `/bin/sh -c`. This way `docker stop` sends SIGTERM to nginx and it shuts down cleanly. With the shell form, the signal goes to the shell, and Docker kills the container after a 10-second timeout.

## Other points

- **Log to stdout/stderr** so `docker logs` shows nginx output. The official `nginx` image does this with symlinks:
  ```dockerfile
  RUN ln -sf /dev/stdout /var/log/nginx/access.log \
   && ln -sf /dev/stderr /var/log/nginx/error.log
  ```
- **Consider the official image.** `FROM nginx` (or `nginx:alpine`) is already set up this way, so you'd only need to `COPY` your config and content.
- **Debugging exits in general:** `docker ps -a` shows the exit code and `docker logs <container>` shows the output. Here you'd see nginx start and then exit code 0, which points to the main process finishing normally rather than crashing.

Avoid workarounds like `service nginx start && tail -f /dev/null`. They keep the container alive, but Docker ends up watching `tail` instead of nginx. If nginx crashes, the container keeps running while nothing serves requests, and signals never reach nginx.
````

### debug-docker off 3

````markdown
A container keeps running only while its main process (PID 1) is running. When that process exits, the container stops.

`service nginx start` is the problem. It runs the init script, which starts nginx as a **background daemon** and then exits right away. Your CMD's process finishes, so Docker stops the container, and the nginx daemon stops with it.

## Fix

Run nginx in the foreground as the main process:

```dockerfile
FROM ubuntu:24.04

RUN apt-get update && \
    apt-get install -y --no-install-recommends nginx && \
    rm -rf /var/lib/apt/lists/*

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

Why this works:
- **`daemon off;`** keeps nginx in the foreground, so it stays PID 1 and the container keeps running.
- **Exec form (`["..."]`)** runs nginx directly instead of through `/bin/sh -c`. That means `docker stop` sends SIGTERM straight to nginx, so it shuts down cleanly instead of being killed after the 10-second timeout.

## Things to avoid
- `CMD service nginx start && tail -f /dev/null`: this keeps the container up, but Docker is then watching `tail`, not nginx. If nginx crashes, the container still looks healthy, and signals don't reach nginx.
- systemd/`service` in containers generally: there's no init system running, so treat the container as "one foreground process."

## Tips
- **Logs:** the official `nginx` image links `/var/log/nginx/access.log` and `error.log` to `/dev/stdout` and `/dev/stderr`, so `docker logs` shows them. You can do the same:
  ```dockerfile
  RUN ln -sf /dev/stdout /var/log/nginx/access.log && \
      ln -sf /dev/stderr /var/log/nginx/error.log
  ```
- **Debugging exits:** `docker ps -a` shows the exit code, and `docker logs <container>` shows the output. If nginx fails on a config error, `docker run --rm myimage nginx -t` checks the config.
- **Simpler option:** unless you need Ubuntu specifically, `FROM nginx:stable` already handles all of this.
````

### debug-docker on 1

````markdown
The container stops because `service nginx start` starts nginx as a background daemon and then exits. A container lives only as long as its main process (PID 1), so when that command returns, the container stops.

Fix it by running nginx in the foreground as PID 1:

```dockerfile
CMD ["nginx", "-g", "daemon off;"]
```

- **Use the exec form (JSON array).** The shell form `CMD nginx ...` wraps nginx in `/bin/sh -c`. The shell becomes PID 1 and does not pass on SIGTERM, so `docker stop` waits 10 seconds and then kills nginx.
- **Log to stdout/stderr** if you want `docker logs` to show anything. Ubuntu's nginx package writes to files under `/var/log/nginx`. The official `nginx` image links those files to stdout and stderr:
  ```dockerfile
  RUN ln -sf /dev/stdout /var/log/nginx/access.log && ln -sf /dev/stderr /var/log/nginx/error.log
  ```
- **Consider switching to `FROM nginx`.** That image already runs nginx in the foreground and sends logs to Docker. The only downside is that you give up the Ubuntu base, if you need it for other packages.
````

### debug-docker on 2

````markdown
`service nginx start` launches nginx as a background daemon and then returns. That command is PID 1, so when it exits the container stops.

Run nginx in the foreground instead:

```dockerfile
CMD ["nginx", "-g", "daemon off;"]
```

- Use the exec form (JSON array) so nginx is PID 1 and receives `docker stop` signals directly. The shell form wraps it in `/bin/sh -c`, which does not forward SIGTERM, so stops wait out the 10-second timeout and then kill it.
- Add `EXPOSE 80` and run with `-p 8080:80` if you need to reach it from the host.
- The official `nginx` image already does this. Switch to it unless you need Ubuntu for something else.
````

### debug-docker on 3

````markdown
Your CMD starts nginx as a background daemon and then returns, so the container's main process exits and Docker stops the container.

- A container lives only as long as PID 1. `service nginx start` forks nginx into the background and exits right away.
- Fix: run nginx in the foreground as PID 1.

```dockerfile
CMD ["nginx", "-g", "daemon off;"]
```

- Use the exec (JSON array) form. The shell form wraps the command in `/bin/sh -c`, so `docker stop` sends SIGTERM to the shell instead of nginx. You then wait out the 10 second timeout before a SIGKILL.
- Avoid workarounds like `service nginx start && tail -f /dev/null`. The container stays up even if nginx crashes, and `docker stop` does not shut nginx down cleanly.
- nginx logs go to files under `/var/log/nginx` by default, so `docker logs` shows nothing. To send them to Docker, add this to the Dockerfile:

```dockerfile
RUN ln -sf /dev/stdout /var/log/nginx/access.log && ln -sf /dev/stderr /var/log/nginx/error.log
```
````

## compare-db

Prompt:

````text
Should I use PostgreSQL or MongoDB for a new web app that stores users, orders and invoices?
````

### compare-db off 1

````markdown
**Use PostgreSQL.** For users, orders, and invoices it's the better fit.

**Why:**

- **The data is relational.** Users have many orders, orders have many line items, and invoices reference orders and users. Foreign keys and joins handle this directly. In MongoDB you either embed documents, which duplicates data and makes updates harder, or you reference them and end up writing joins with `$lookup` or in application code.
- **Money needs strong guarantees.** ACID transactions, `CHECK` constraints, `NUMERIC` for exact currency values, and unique constraints on invoice numbers stop bad data at the database level. MongoDB has had multi-document transactions since 4.0, but they're an add-on rather than the default way of working, and schema validation is optional and weaker.
- **Invoices must be immutable and auditable.** Constraints, triggers, and row-level security make that easy to enforce.
- **Reporting.** Revenue per month, outstanding invoices, and top customers are simple SQL queries with `GROUP BY` and window functions. The same queries as aggregation pipelines are more verbose.
- **You still get flexibility.** `JSONB` columns (with GIN indexes) cover the schemaless parts, such as order metadata, payment provider payloads, and user preferences.
- **Ecosystem.** Prisma, Drizzle, SQLAlchemy, Django ORM, and ActiveRecord all have first-class Postgres support. Managed hosting is widely available: Supabase, Neon, RDS, and others.

**When MongoDB would make sense instead:**

- Most of your data is truly unstructured or changes shape often, like CMS content, event logs, or IoT payloads.
- You mostly read and write whole documents and rarely query across entity types.
- Your team already knows Mongo well and the domain has little relational integrity to protect.

None of those describe an orders and invoicing system.

**Practical tips if you go with Postgres:**

- Store money as `NUMERIC(12,2)` or as integer cents, never `float`.
- Snapshot prices, addresses, and tax rates onto the order and invoice rows when they're created, so later edits to products or users don't change past invoices.
- Use a sequence or a transaction-safe counter for gapless invoice numbers if your jurisdiction requires them.
````

### compare-db off 2

````markdown
**Use PostgreSQL.** For users, orders, and invoices it isn't a close call.

**Why PostgreSQL fits this data**

- **The data is relational.** A user has many orders, an order has many line items, and an invoice points to an order and a user. Foreign keys and joins handle this directly, and the database enforces the links (for example, no invoice can point to an order that doesn't exist).
- **Money needs ACID transactions.** Creating an order, reserving stock, and issuing an invoice should all succeed or all fail together. Postgres has done this reliably for decades. MongoDB has supported multi-document transactions since 4.0, but it bolted them on later, and they're less natural to use.
- **Constraints protect financial data.** `NOT NULL`, `CHECK (amount >= 0)`, `UNIQUE (invoice_number)`, and exact `NUMERIC` types for currency stop bad data at the database. In MongoDB you'd mostly enforce these rules in your app code, and bugs would get through.
- **Reporting is easy.** Questions like "revenue by month," "unpaid invoices older than 30 days," or "top customers" are simple SQL. The equivalent aggregation pipelines in MongoDB are wordier.
- **You still get flexibility.** `JSONB` columns can hold data that really is schemaless, like order metadata or payment-provider payloads, and you can index them.
- **Invoices often have legal requirements.** Many places require them to be immutable, numbered in sequence, and auditable. Strict schemas and constraints make that easier.

**When MongoDB would make sense**

- Most of your data is document-shaped with a changing structure, such as a CMS, event logs, or product catalogs with very different attributes.
- You need to scale writes horizontally beyond one large node from the start. Most web apps never get there, and Postgres scales vertically and with read replicas for a long time.
- Your team already knows MongoDB well and the app has little relational logic. That doesn't describe orders and invoices.

**Tips if you go with Postgres**

- Store money as `NUMERIC(12,2)` or as integer cents, never as `float`.
- Copy prices and addresses onto the order or invoice when it's created. Don't reference the current product price, which can change later.
- Use migrations from the start, with Prisma, Drizzle, Alembic, Flyway, or your framework's built-in tool.
- Managed hosting options include Supabase, Neon, RDS, and Cloud SQL.
````

### compare-db off 3

````markdown
**Use PostgreSQL.** Users, orders, and invoices are a classic fit for a relational database.

**Why PostgreSQL fits this data**

- **Your data is relational.** A user has many orders, an order has many line items, and an invoice points to an order. Foreign keys and joins handle this directly. In MongoDB you'd have to choose between embedding and referencing, and you'd end up doing the joins yourself with `$lookup` or in your app code.
- **Money needs strong guarantees.** Invoices and orders need atomic multi-row transactions, like "create order, decrement stock, issue invoice" all succeeding or failing together. They also need constraints (`NOT NULL`, `CHECK (amount >= 0)`, unique invoice numbers) and exact `NUMERIC` types for currency. MongoDB does have transactions now, but in PostgreSQL they're the default way of working, not an add-on.
- **The schema is stable and should be enforced.** An invoice's shape doesn't change from row to row. With a schema in the database, bad data gets rejected at write time, not found months later.
- **Reporting is easier.** Questions like "revenue per customer last quarter" or "unpaid invoices over 30 days" are simple SQL. Your accountants and BI tools will expect SQL too.
- **You still get flexibility.** For the parts that really are schemaless (user preferences, order metadata, payment gateway payloads), use `JSONB` columns with GIN indexes. That covers most of what people pick MongoDB for.

**When MongoDB would make sense instead**

- Most of your data is loosely structured documents that are read and written as a whole, like a CMS, event logs, or product catalogs whose attributes vary a lot.
- You expect to need horizontal write sharding early and don't want to run Citus or similar tools.
- Your team already knows MongoDB well and the relational parts of the app are small.

None of these fit a users/orders/invoices app.

**Practical tips if you go with PostgreSQL**

- Store money as `NUMERIC(12,2)`, or as integer cents with a currency code. Never use `float`.
- Make invoices immutable once issued. Copy the line items, prices, and billing address into the invoice instead of pointing to data that can change later.
- Use a migration tool, such as Prisma, Drizzle, Alembic, Flyway, or your framework's built-in one.
- A managed host (Neon, Supabase, RDS, Cloud SQL) saves you from running backups and upgrades yourself.
````

### compare-db on 1

````markdown
Use PostgreSQL.

- Orders and invoices need ACID transactions across several tables, such as creating an order, reserving stock, and writing the invoice all at once. Postgres does this by default. MongoDB supports multi-document transactions, but they are slower and add more rules you have to follow.
- Your data is relational: a user has many orders, and an order has line items and invoices. Foreign keys block orphaned invoices and bad references at the database level. MongoDB leaves that checking to your app code.
- Invoices usually need an audit trail and fixed totals. Use `NUMERIC` for money, plus `CHECK` constraints and unique invoice numbers, and the database enforces correctness. In MongoDB, a missed validation in your code can leave wrong data behind.
- Reporting like revenue per month, unpaid invoices, or top customers is plain SQL with joins. In MongoDB these are aggregation pipelines that get harder to write and maintain as the questions grow.
- For flexible fields like product attributes or payment provider payloads, use `JSONB` columns. That covers most of what would push you toward MongoDB.

MongoDB only wins if most of your data has no fixed shape, or you expect to shard for very high write volume from day one. Neither is typical for users, orders and invoices.
````

### compare-db on 2

````markdown
PostgreSQL.

- Users, orders and invoices are relational data. An order belongs to a user and an invoice points to an order. Postgres enforces those links with foreign keys, so you can't end up with an invoice for an order that doesn't exist. MongoDB leaves that to your application code.
- Invoices are money records. Postgres transactions are ACID and in use for decades, so "create order, reserve stock, issue invoice" either all succeeds or all fails. MongoDB has multi-document transactions, but they add limits and cost, and most Mongo tooling isn't built around them.
- Reporting on this data is mostly joins and aggregates, like revenue per customer per month or unpaid invoices by age. That is plain SQL in Postgres. In MongoDB it means aggregation pipelines or copying data into each document, and copied data drifts out of sync when a user changes their address.
- If you need flexible fields, like per-order metadata or payment provider payloads, use a `jsonb` column in Postgres. That covers the usual reason people choose MongoDB.
- Invoices should be immutable snapshots. Store the billing address, line items and prices on the invoice itself instead of joining to the live user and product rows. Otherwise old invoices change when current data changes, whichever database you use.

MongoDB would make sense only if most of your data had no fixed shape and you rarely queried across entities. That doesn't describe users, orders and invoices.
````

### compare-db on 3

````markdown
Use PostgreSQL. Users, orders and invoices are relational data that must stay consistent, and that is what Postgres is built for.

- **Transactions across tables.** Creating an order, decrementing stock and issuing an invoice must all succeed or all fail. Postgres does this by default. MongoDB has had multi-document transactions since 4.0, but they are more limited and add overhead, and you would use them on nearly every write.
- **Integrity enforced by the database.** Foreign keys, `NOT NULL`, `CHECK` and unique constraints stop bugs like an invoice pointing to a deleted order, or two invoices with the same number. In MongoDB, your application code has to enforce all of this.
- **Money needs exact types.** Use `numeric` for amounts, never floats. Mongo has `Decimal128`, but drivers and ORMs often fall back to doubles unless you are careful.
- **Reporting is SQL.** Revenue per month, unpaid invoices per customer and similar questions are simple joins and `GROUP BY` queries. In Mongo these become aggregation pipelines or duplicated data.
- **Invoices are legal records.** Store the line items, prices and tax as they were when the invoice was issued, and never recompute them from current product data. This matters in either database, but constraints in Postgres make it easier to enforce.
- **You still get flexible fields.** Put variable parts, such as payment provider responses or per-customer metadata, in a `jsonb` column with a GIN index.

Choose MongoDB only if most of your data has no fixed shape and you rarely query across entities. A billing system is the opposite case.
````

## compare-rpc

Prompt:

````text
REST or gRPC for internal service-to-service calls? We are a team of five running eight services on Kubernetes.
````

### compare-rpc off 1

````markdown
**Recommendation: REST (HTTP/JSON) with OpenAPI specs and generated clients.** Switch to gRPC only if you hit one of the triggers below.

## Why REST fits a team of five

- **Lower operational overhead.** You can debug with `curl`, browser dev tools, and ordinary logs. Every ingress, proxy, APM tool, and API gateway understands it without extra setup.
- **The Kubernetes load-balancing issue doesn't apply.** gRPC runs over long-lived HTTP/2 connections. A standard ClusterIP Service balances per connection, not per request, so one pod can take all the traffic from a client. The fixes are headless Services with client-side balancing, or a mesh like Linkerd or Istio. Both add work a small team may not want.
- **You get most of gRPC's contract benefit anyway.** Write OpenAPI specs and generate clients and servers (for example with oapi-codegen or openapi-generator). That gives you typed clients and a single source of truth. Add a CI check for breaking spec changes.
- **One style for internal and external APIs.** If any service is exposed to browsers or partners, you're already doing REST there.

## When gRPC is the better choice

- **Streaming** (server, client, or bidirectional): gRPC handles this natively. REST needs SSE or WebSockets bolted on.
- **High call volume or latency-sensitive paths:** chatty service-to-service traffic where serialization and payload size show up in profiles.
- **Many languages:** if your eight services span three or more languages, protobuf codegen is more consistent than OpenAPI generators, whose quality varies by language.
- **Strict schema evolution:** protobuf's field-numbering rules make backward compatibility harder to break by accident.

## Practical middle ground

Start with REST everywhere. If one or two hot paths later need gRPC, move just those. If you already run a service mesh, the load-balancing concern mostly goes away and gRPC becomes cheaper to adopt. Mixing the two is fine. Just avoid running both for the same service boundary.

If you share your services' languages, whether you run a mesh, and your traffic patterns, I can give a firmer answer.
````

### compare-rpc off 2

````markdown
# Use REST, unless one of the conditions below applies

For five people running eight services, the extra work of gRPC usually costs more than it saves. Eight services isn't a scale where serialization speed or payload size will be your bottleneck. Your constraint is team time.

## Why REST suits your setup

- **Debugging is easier.** You can use curl, browser dev tools, logs you can read, and whatever your ingress or APM already understands. With gRPC you need grpcurl, reflection or proto files, and binary payloads in traces.
- **Kubernetes load balancing just works.** gRPC runs over HTTP/2 and keeps connections open for a long time. A standard Kubernetes `Service` balances connections, not requests, so one pod can end up taking all the traffic from a client. The fix is a headless service with client-side load balancing, or a service mesh like Linkerd or Istio. That's more to run and understand.
- **One protocol everywhere.** Your public or frontend APIs are probably HTTP/JSON already. Using the same thing internally means one set of middleware for auth, retries, rate limits and observability.
- **Less build tooling.** You don't need a protoc or buf pipeline, a shared proto repo, or rules for versioning generated code.

## The main thing gRPC gives you, and how to get it with REST

gRPC's real advantage is **strict, generated contracts**. You can get most of that with **OpenAPI plus code generation**, such as oapi-codegen or openapi-generator. Keep the spec files in one place and check for breaking changes in CI (for example with oasdiff). Do this from day one, since contract drift between services is what actually hurts small teams.

## When to choose gRPC

Pick gRPC if any of these are true:
- You need **streaming**: server push, bidirectional streams, or long-lived feeds.
- Some calls are **high-volume and sensitive to latency**, and you've measured that JSON is a real cost.
- You have **many languages** and want one schema to generate clients for all of them.
- You **already run a service mesh**, so the load-balancing problem is solved.

## A middle option

**Connect RPC** (connectrpc.com) lets you define APIs in protobuf and generate typed clients. It also serves plain HTTP/1.1 and JSON, so curl works and normal Kubernetes load balancing works. The same servers also speak the gRPC protocol. If you want protobuf contracts without the operational costs above, it's a good choice, and moving to full gRPC later is easy.

**Bottom line:** start with REST and OpenAPI-generated clients. Move individual calls to gRPC or Connect only when you hit a specific need like streaming or measured performance problems. Don't switch everything upfront.
````

### compare-rpc off 3

````markdown
**Use REST (HTTP/JSON) with an OpenAPI contract and generated clients**, unless one of the conditions below applies. With five people running eight services, the extra operational work gRPC brings will probably cost you more than its speed saves.

## Why REST fits your team
- **Debugging is easy.** You can use `curl`, browser dev tools, ordinary logs and any HTTP proxy. When something breaks at 2am, anyone on the team can inspect the traffic.
- **Load balancing on Kubernetes just works.** This is the main catch with gRPC. It keeps HTTP/2 connections open for a long time, and a standard Kubernetes Service balances connections, not requests. One client pod can end up sending all its traffic to a single server pod. To fix that you need client-side load balancing with headless Services, or a service mesh like Linkerd or Istio. That's one more system for a small team to run.
- **Your existing tools already support it.** Ingress, API gateways, observability, auth middleware and rate limiters all handle HTTP/JSON without extra setup.
- **The speed difference rarely matters at your size.** Protobuf is faster than JSON, but with eight services your latency is almost always dominated by database calls and network hops, not serialization.

## Get gRPC's main benefit anyway
gRPC's real advantage is **enforced contracts**, not speed. You can get most of that with REST:
- Define each API in OpenAPI and generate the client and server code from it.
- Add a check in CI that fails the build on breaking changes (for example `oasdiff`).

## When gRPC is the better choice
- **You need streaming** (server, client or two-way), such as live feeds or long-running jobs that report progress.
- **You have chatty, high-volume, latency-sensitive calls**, like thousands of requests per second between two services, or large payloads.
- **Your services use many languages** and you want one strict schema with good code generation for all of them.
- **You already run a service mesh**, which removes the load-balancing problem.

## A middle option
**Connect RPC (connectrpc.com)** lets you write Protobuf schemas and use `buf` to catch breaking changes. The same endpoints accept gRPC and plain HTTP/JSON, so you can still call them with `curl`. It's worth a look if you like Protobuf contracts but not the tooling hassle.

**My pick for you:** REST plus OpenAPI with generated clients. Switch individual service-to-service links to gRPC or Connect only where you actually need streaming or better performance. Mixing the two is fine.
````

### compare-rpc on 1

````markdown
**Use REST (JSON over HTTP) by default.** With five people and eight services, easy debugging and low tooling cost matter more than wire speed.

**Why REST fits your team**
- You can debug with `curl`, browser dev tools and plain logs. With gRPC you need `grpcurl`, server reflection and a way to decode protobuf when something breaks in the middle of the night.
- gRPC needs a shared `.proto` repo, a code generation step in every service's CI, and rules for versioning the contracts. That is ongoing work a five-person team feels.
- Kubernetes Services load-balance per connection. gRPC keeps one long-lived HTTP/2 connection, so all its traffic sticks to one pod unless you add client-side balancing or a service mesh (Linkerd, Istio). REST doesn't have this problem.
- Ingress, API gateways and most observability tools handle REST with no extra setup.

**Switch to gRPC, for specific calls only, if one of these is true**
- You measured a latency or CPU problem in JSON serialization on a busy path. Fix that path, not all eight services.
- You need streaming (server, client or both directions) and don't want WebSockets or SSE.
- Services are written in several languages and the contracts keep drifting. Generated clients enforce the contract.

**If you choose REST, get contract safety another way**
- Write an OpenAPI spec for each service and generate clients from it. This fixes most of the type-safety gap with gRPC.
- Set timeouts, retries with backoff, and idempotency keys on calls that change data. gRPC gives you deadlines built in, and REST does not.

Next step: pick the one call you think is most likely to need gRPC and check its p99 latency before deciding it does.
````

### compare-rpc on 2

````markdown
**Use REST (JSON over HTTP) with an OpenAPI spec per service, unless one of the gRPC triggers below applies.** With five people, the cost you'll feel most is operations, not payload size or speed.

**Why REST fits your size**
- You can debug with `curl`, browser dev tools, and your ingress and log tooling as they are. gRPC needs `grpcurl`, reflection enabled, and proto files on hand when things break.
- An OpenAPI spec with generated clients gives you most of gRPC's typed-contract benefit without adding a protobuf toolchain to every repo.
- Eight services is few enough that JSON encoding cost rarely shows up in latency.

**The Kubernetes catch with gRPC**
- gRPC keeps one HTTP/2 connection open per client, and a regular ClusterIP Service balances connections, not requests. One pod ends up taking all the traffic while the other replicas sit idle.
- To fix it you need a headless Service with client-side load balancing (`dns:///` resolver plus `round_robin`), or a service mesh like Linkerd or Istio. Either way it's more to set up and maintain.

**Pick gRPC if any of these are true**
- You need streaming, such as server push, bidirectional streams, or long-running jobs that report progress.
- A hot path makes many calls per request and you've measured serialization or latency as a real cost.
- Your services use several languages and contracts keep drifting, so you want one schema enforced at build time.

**Middle option:** if you want protobuf contracts without losing `curl`, use Connect RPC (connectrpc.com). One server handles gRPC and plain HTTP/JSON. The downside is fewer supported languages and a smaller community than gRPC or REST.

Whichever you pick, use it for all eight services. Running both styles means maintaining two sets of tooling, auth middleware, and retry logic.
````

### compare-rpc on 3

````markdown
**Use REST (HTTP/JSON with an OpenAPI spec per service) as the default.** At five people and eight services, gRPC's gains are unlikely to be worth what it costs you to run it.

Why REST fits here:
- **Load balancing works as is.** gRPC holds long-lived HTTP/2 connections, and a Kubernetes Service balances per connection, not per request. All traffic from one client pod sticks to one server pod, and new replicas get little traffic after a scale-up. To fix that with gRPC you need client-side load balancing against a headless Service, or a service mesh. That's one more system for five people to own.
- **Debugging is cheaper.** curl, logs, ingress tooling and browser devtools all read JSON directly. With gRPC you need grpcurl, reflection turned on, and proto files on hand for every incident.
- **Less build tooling.** gRPC adds protoc, generated code and a place to keep shared protos in every service's build.
- **Covers REST's main weakness.** REST contracts can quietly drift between services. You close most of that gap by generating clients from the OpenAPI specs and checking the specs in CI.

Pick gRPC instead if any of these is true now, not someday:
- You need streaming, like server push, bidirectional flows or large result sets.
- Serialization or latency shows up in your profiles on hot internal paths with high call volume.
- The services are written in several languages and contract drift has already caused incidents.

You don't have to pick one for everything. You can start with REST and move a single hot or streaming path to gRPC later without changing the rest.

Next step: add an OpenAPI spec and a generated client to the two services that call each other most, and see whether contract drift is actually a problem for you.
````

## summarize-retry

Prompt:

````text
Summarize this change for a reviewer.

```diff
diff --git a/src/http.js b/src/http.js
@@ -1,5 +1,18 @@
-export async function request(url, options = {}) {
-  const res = await fetch(url, { ...options, signal: AbortSignal.timeout(10000) });
-  if (!res.ok) throw new Error(`HTTP ${res.status}`);
-  return res.json();
-}
+const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
+
+export async function request(url, options = {}, retries = 3) {
+  for (let attempt = 0; ; attempt++) {
+    try {
+      const res = await fetch(url, { ...options, signal: AbortSignal.timeout(30000) });
+      if (res.status >= 500 && attempt < retries) {
+        await sleep(2 ** attempt * 500);
+        continue;
+      }
+      if (!res.ok) throw new Error(`HTTP ${res.status}`);
+      return res.json();
+    } catch (err) {
+      if (attempt >= retries) throw err;
+      await sleep(2 ** attempt * 500);
+    }
+  }
+}
```
````

### summarize-retry off 1

````markdown
## Summary

`request()` now retries failed requests with exponential backoff, and the per-attempt timeout goes from 10s to 30s.

**What changed**
- New optional third parameter `retries` (default `3`), so up to 4 attempts in total. Existing callers get retries automatically.
- 5xx responses and thrown errors (network failures, timeouts) are retried after a delay of 500ms, then 1s, then 2s.
- The per-attempt timeout goes from 10s to 30s.
- A small `sleep` helper was added.

## Things to check

1. **4xx errors get retried too.** This probably isn't intended. The `throw new Error(`HTTP ${res.status}`)` runs inside the `try`, so the `catch` retries it like a network error. A 404 or 401 gets requested 4 times and takes about 3.5s longer to fail. The explicit `>= 500` check suggests the author meant to retry only server errors. One fix is to throw non-retryable errors outside the `try`, or mark them and rethrow them right away in the `catch`.

2. **Worst-case wait goes from 10s to about 2 minutes.** Four 30s timeouts plus 3.5s of backoff is about 123.5s before a caller sees an error. Check this against any caller-side or upstream timeouts, and against UI code that awaits this call.

3. **Requests that aren't safe to repeat get retried.** Every method is retried, including POST and PATCH. A timeout or 5xx doesn't mean the server did nothing, so retries could create duplicates, such as repeated orders or double writes. Consider retrying only GET, HEAD, PUT, DELETE and OPTIONS by default, or letting callers opt in.

4. **Smaller points:**
   - `return res.json()` isn't awaited, so a JSON parse failure skips the `catch` and isn't retried. That's arguably correct, but it's inconsistent with everything else in the block.
   - There's no jitter, so many clients failing together will retry at the same moments.
   - `Retry-After` headers are ignored (relevant for 503).
   - A caller's `options.signal` is still overwritten by the timeout signal (this was already true). With retries, the caller now can't cancel a call that may last 2 minutes. `AbortSignal.any([options.signal, AbortSignal.timeout(...)])` would fix this.
   - If `options.body` is a stream, it can't be sent again on a retry.

5. **No tests are included.** Worth adding tests for: a 5xx followed by success, a 4xx that should fail immediately, running out of retries, and `retries = 0`.

**Suggested verdict:** the idea is sound, but I'd ask for changes on #1 and #3 before merging and a conscious decision on #2.
````

### summarize-retry off 2

````markdown
## Summary

`request()` now retries failed requests with exponential backoff, and the per-attempt timeout goes from 10s to 30s.

**What changed**
- New third parameter `retries` (default `3`), so up to **4 attempts** in total.
- On a 5xx response, or when `fetch` throws (network error or timeout), it waits `500ms × 2^attempt` (0.5s, 1s, 2s) and tries again.
- Once retries run out, it throws as before: `HTTP <status>` or the original error.
- The timeout is now 30s per attempt (was 10s).

## Things to check

1. **4xx errors are retried too, which is probably a bug.** The `throw new Error('HTTP ...')` for non-OK responses sits inside the `try`, so the `catch` catches it and retries. A 404 or 401 gets retried 3 times before failing, so the 5xx-only check doesn't actually limit anything. Fix: move the status check outside the `try`, or rethrow HTTP errors in the `catch` without retrying.

2. **Non-idempotent requests get retried.** POST, PATCH and similar requests are retried on 5xx or timeout with no check on the method. If the server handled the request but the response was lost or slow, the action can happen twice. Consider retrying only GET, HEAD, PUT and DELETE by default, or making retries opt-in.

3. **Callers can now wait much longer.** Before, a call failed after at most about 10s. Now the worst case is 4 × 30s + 3.5s of backoff, about **123s**. Callers that expect failures to be quick, like UI code or request handlers with their own timeouts, may break.

4. **JSON parse errors aren't retried or caught.** `return res.json()` returns the promise without `await`, so a parse failure rejects outside the `try`. That's probably fine, but it's an accident of the code rather than a choice. Using `return await res.json()` would make it clear, whichever behavior is intended.

5. **Smaller points:**
   - 5xx response bodies aren't read or cancelled before retrying. In Node/undici this can hold connections open; `res.body?.cancel()` fixes it.
   - The backoff has no jitter and ignores `Retry-After`.
   - Any `options.signal` from the caller is still overwritten, so callers can't cancel the request themselves. That was already true, but retries make it more noticeable.
   - The diff has no tests for the retry logic.
````

### summarize-retry off 3

````markdown
# Summary: add retry with exponential backoff to `request()`

**What changed (`src/http.js`)**

- **Retries:** `request()` takes a new optional third argument, `retries`, which defaults to 3. That means up to 4 attempts in total. Existing callers don't need to change.
- **Backoff:** between attempts it waits 500ms, then 1s, then 2s (`2 ** attempt * 500`). There's no jitter.
- **What gets retried:** 5xx responses, plus anything thrown inside the `try`: network errors, timeouts, and (probably by accident) 4xx responses (see below).
- **Timeout:** the per-attempt timeout went from 10s to 30s. The worst case for one call is now about 2 minutes (4 × 30s plus 3.5s of backoff), up from 10s.
- **Unchanged:** on success it still returns the parsed JSON. On final failure it still throws `HTTP <status>` or the underlying error.

**Issues to look at**

1. **4xx responses are retried.** The `throw new Error(\`HTTP ${res.status}\`)` sits inside the `try`, so the `catch` catches it and retries. A 404 or 401 will be tried 4 times over about 3.5s before it fails. The 5xx check suggests the intent was to retry only server errors. A fix is to rethrow non-retryable errors from the `catch`, or move the status check out of the `try`.
2. **POST and other non-idempotent requests are retried.** Retries happen whatever `options.method` is. A timeout or 5xx on a request that actually went through on the server could create duplicates. Consider limiting retries to GET, HEAD, PUT and DELETE, or making retry opt-in for other methods.
3. **The 30s timeout may be a separate decision.** Combined with retries, it makes slow failures much slower for users. It's worth confirming this was intended rather than bundled in.
4. **JSON parse errors aren't retried.** `return res.json()` isn't awaited, so if parsing fails the error skips the `catch`. That's probably fine, but it's inconsistent with everything else being retried. `return await res.json()` would change it.
5. **Smaller points:**
   - 429 isn't retried, and `Retry-After` is ignored.
   - The body of a 5xx response isn't drained before retrying, which can hold connections open in Node/undici.
   - The client's own `options.signal` is still overwritten by the timeout signal, so callers can't cancel a request. That was already true, but it matters more now that a call can run for minutes.

**Testing:** the diff has no tests. Worth covering: a 5xx that recovers, a 5xx that never recovers, a 4xx (it should fail right away), a network error, and the retry count and delays (with fake timers).
````

### summarize-retry on 1

````markdown
`request()` now retries failed calls with exponential backoff and waits up to 30s per attempt instead of 10s.

**What changed**
- Up to 3 retries (4 attempts total) on 5xx responses and on thrown errors such as network failures and timeouts.
- Backoff is 500ms, 1s, then 2s, with no jitter.
- Per-attempt timeout goes from 10s to 30s.
- New optional third parameter `retries`, default 3.

**Issues to raise**
- **4xx errors are retried.** The `throw new Error(`HTTP ${res.status}`)` sits inside the `try`, so the `catch` retries it. A 404 or 401 makes 4 calls and waits 3.5s before failing. The fix is to only retry in `catch` when the error did not come from a received response.
- **Writes can be duplicated.** Retries ignore the HTTP method. A POST that times out after the server processed it will run again. Retries should be limited to idempotent methods, or callers should opt in.
- **Worst-case latency is now about 124s** (4 × 30s plus 3.5s of backoff), up from 10s. Any caller with its own timeout or a UI waiting on this will behave differently.
- **5xx response bodies are never read before a retry.** In Node's fetch, this can keep connections open until garbage collection. Calling `await res.body?.cancel()` before sleeping avoids that.
- **JSON parse errors are not retried.** `return res.json()` is not awaited, so its rejection skips the `catch`. That is probably the right behavior, but it looks accidental.
- **No tests in the diff.** None of the retry paths are covered.
````

### summarize-retry on 2

````markdown
`request()` in `src/http.js` now retries failed requests up to 3 times, waiting 500ms, 1s, then 2s between tries. The per-attempt timeout goes from 10s to 30s. Callers don't need changes because `retries` is a new optional third argument.

**What changed**
- A 5xx response or any thrown error (network failure, timeout, JSON parse error) triggers a retry. Once retries run out, the last error is thrown.

**Findings for the reviewer**
- **F1: 4xx responses get retried.** The `HTTP ${res.status}` error is thrown inside the `try`, so the `catch` retries it. A 404 or 401 makes 4 calls and adds 3.5s of waiting before it fails. The `!res.ok` throw should skip the retry path.
- **F2: POST and other write requests get retried.** Nothing checks `options.method`. A timeout or 5xx after the server has already acted can repeat the write, for example a double charge or a duplicate record. Retries should be limited to idempotent methods, or callers should have to opt in.
- **F3: Worst-case latency grows from 10s to about 124s** (4 × 30s plus 3.5s of waiting). Any caller with its own deadline, UI spinner, or request handler timeout will now give up before `request()` does.
- **F4: Callers can't cancel.** `signal` still overwrites any `options.signal` the caller passes, and the waits between retries ignore abort. This was already true before, but the longer worst case makes it matter more.
- **F5: `Retry-After` is ignored and 429 is not retried.** There is also no jitter, so many clients that fail together will retry at the same moments.

Next step: fix F1 and F2 before merging. Both change behavior for existing callers.
````

### summarize-retry on 3

````markdown
This change adds retries with exponential backoff to `request()` and raises the per-attempt timeout from 10s to 30s. It has one bug and one safety risk to settle before merge.

**What changed**
- A new third parameter, `retries`, defaults to 3, so a call can make up to 4 attempts. Existing callers don't need changes.
- The wait between attempts is 500ms, then 1s, then 2s. There is no jitter, and `Retry-After` is ignored.
- A retry happens on a 5xx response or on any thrown error, including network failures and timeouts.

**Findings**
- **F1 (bug):** 4xx responses get retried. The `throw new Error(\`HTTP ${res.status}\`)` sits inside the `try`, so its own `catch` catches it and retries. A 404 or 401 takes about 3.5s and 4 requests to fail instead of failing at once. The fix is to rethrow non-5xx HTTP errors without retrying.
- **F2 (risk):** The retry ignores the HTTP method. A POST that timed out or got a 5xx may already have been processed by the server, so retrying it can create duplicates such as double orders or double charges. Retries should be limited to idempotent methods, or callers should have to opt in.
- **F3 (risk):** The worst-case time before an error rises from 10s to about 124s (4 × 30s plus 3.5s of waiting). Any caller with its own deadline, or a request handler waiting on this call, will now hang much longer before it sees the error.
- **F4:** `options.signal` is still overwritten by the timeout signal, so callers can't cancel a request. This bug already existed, but a caller can now be stuck for up to 2 minutes instead of 10s. Combining the two signals with `AbortSignal.any([options.signal, AbortSignal.timeout(30000)])` fixes it.
- **F5:** The body of a retried 5xx response is never read. In Node's fetch this can keep the connection busy until garbage collection. Calling `res.body?.cancel()` before the sleep avoids that.
- **F6:** JSON parse errors are not retried. `return res.json()` hands back the promise without `await`, so the `catch` never sees its rejection. That is probably the right behavior, but it looks accidental. If it's intended, a comment should say so.

The diff has no tests, so nothing above has been run. Before approving, ask for tests that cover a 4xx failing fast (F1) and a POST not being retried (F2).
````

## plan-reset

Prompt:

````text
Plan adding password reset by email to an Express app whose users live in a Postgres users table.
````

### plan-reset off 1

````markdown
# Plan: Password reset by email (Express + Postgres)

I can't read files in this session, so I haven't seen your code. This plan assumes a typical setup: a `users` table with `id`, `email` and `password_hash`, and bcrypt or argon2 for hashing. The questions at the end cover the things that would change it.

## How it works

1. The user submits their email to `POST /auth/forgot-password`.
2. The server always gives the same response. If the account exists, it creates a random single-use token, saves only its **hash**, and emails a link: `https://app.example.com/reset-password?token=…`.
3. The link opens a form that asks for a new password. Opening the page doesn't use up the token.
4. The form sends the token and new password to `POST /auth/reset-password`. The server checks the token, updates the password, marks the token used and logs out existing sessions.

## 1. Database migration

Use a separate table instead of adding columns to `users`. That keeps a history, makes cleanup simple and avoids clutter in `users`.

```sql
CREATE TABLE password_reset_tokens (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,          -- sha256 hex of the raw token
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  request_ip  INET
);
CREATE INDEX ON password_reset_tokens (user_id);

-- Lets you log out existing sessions/JWTs after a reset
ALTER TABLE users ADD COLUMN password_changed_at TIMESTAMPTZ;
```

Match `user_id`'s type (for example UUID) to `users.id`.

## 2. Token handling (`src/auth/resetTokens.js`)

- **Create:** `crypto.randomBytes(32).toString('base64url')`. Put the raw token only in the email.
- **Store:** `crypto.createHash('sha256').update(token).digest('hex')`. A fast hash is fine because the token is fully random, so bcrypt isn't needed. If the database leaks, the stored hashes can't be used to reset passwords.
- **Expiry:** 30–60 minutes.
- **One token per user:** when a new token is created, delete or expire that user's older unused tokens.

## 3. Routes (`src/routes/passwordReset.js`)

### `POST /auth/forgot-password` `{ email }`
1. Validate the input, then trim and lowercase the email (match how signup stores it).
2. Look up the user.
3. **Always** return `202 { message: "If an account exists, we've sent a reset link." }`.
4. If the user exists, create the token, insert the row and send the email **without awaiting it** (or put it on a queue). Otherwise the response is slower when the account exists, and that timing difference reveals which emails are registered.

### `POST /auth/reset-password` `{ token, password }`
Run this in a single transaction:
```sql
SELECT id, user_id FROM password_reset_tokens
WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
FOR UPDATE;
```
- If no row matches, return `400 "Invalid or expired link"`. Use the same message for every failure.
- Apply the same password rules as signup, then hash the password with your existing hashing function.
- `UPDATE users SET password_hash = $1, password_changed_at = now() WHERE id = $2`
- `UPDATE password_reset_tokens SET used_at = now() WHERE id = $1`, and delete the user's other tokens.
- Commit, then log out existing sessions (section 5) and send a "your password was changed" email.

### Reset page (`GET /reset-password`)
- Serve the form only. **Don't use up the token on GET**, because email security scanners open links before the user does.
- Set `Referrer-Policy: no-referrer` on this page so the token in the URL doesn't leak to third-party resources.

## 4. Sending email (`src/services/mailer.js`)

- Use Nodemailer with SMTP, or a provider SDK (Postmark, SES, Resend, SendGrid).
- Build the link from a configured `APP_BASE_URL` env var. **Never use `req.headers.host`**, because an attacker can fake that header and get a link to their own site sent to the victim.
- Send both plain-text and HTML versions. Say when the link expires and add "ignore this if you didn't request it."
- For local development, run Mailpit/MailHog or Nodemailer's `jsonTransport`.
- New env vars: `APP_BASE_URL`, `SMTP_*` or the provider API key, `MAIL_FROM`, `RESET_TOKEN_TTL_MINUTES`.

## 5. Logging out existing sessions
- **express-session with a Postgres store:** delete that user's rows from the session table.
- **JWT:** in the auth middleware, reject tokens whose `iat` is earlier than `users.password_changed_at`.
- You can then log the user in right away after the reset, or send them to the login page (simpler).

## 6. Abuse protection
- Use `express-rate-limit` on both routes, limited by IP and by email for forgot-password (for example 5 requests per hour).
- Don't log raw tokens or full reset URLs, including in request logs, since tokens sit in query strings.
- Add a daily cleanup job: `DELETE FROM password_reset_tokens WHERE expires_at < now() - interval '7 days'`.
- Serve everything over HTTPS.

## 7. Tests (Jest/Vitest + supertest)
- An unknown email and a known email get the same status and body.
- The token is saved hashed and never appears in the database as plain text.
- Valid token → password changes, you can log in with the new password and not the old one.
- An expired token, a reused token and a garbage token all get the same 400.
- A second reset request cancels the first token.
- Two resets with the same token at once: only one succeeds (the `FOR UPDATE` lock handles this).
- Old sessions/JWTs are rejected after a reset.
- The rate limit kicks in.
- Swap in a fake mailer so tests can read the link from the email.

## Build order
1. Migration → 2. token helpers + unit tests → 3. mailer service → 4. the two routes + integration tests → 5. session logout → 6. rate limiting → 7. frontend pages → 8. cleanup job, env vars and docs.

## Questions that would change the plan
1. **Sessions:** express-session or JWT? This decides step 5.
2. **Migrations and database access:** Knex, Prisma, node-pg-migrate or raw `pg`?
3. **Password hashing:** bcrypt or argon2? Reuse whatever signup uses.
4. **Email provider:** do you already have one?
5. **Frontend:** server-rendered views or an SPA? This decides whether `/reset-password` is an Express view or a client route.

If you point me at the code, I can fit the plan to your actual structure. Separately, the Gmail, Google Drive, Google Calendar and Canva connectors aren't authorized in this session. This plan doesn't need them, but you'd have to connect them in your claude.ai connector settings before I could use them.
````

### plan-reset off 2

````markdown
# Plan: Password reset by email (Express + Postgres)

I haven't seen your code; I only have diagram tools here. This plan assumes a typical setup. The questions at the end cover the details that could change it.

## 1. Data model

Keep tokens in their own table, not as columns on `users`. Store only a **hash** of each token, so a leaked database can't be used to reset passwords.

```sql
CREATE TABLE password_reset_tokens (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  BYTEA  NOT NULL UNIQUE,          -- sha256(raw token)
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  request_ip  INET
);
CREATE INDEX ON password_reset_tokens (user_id);
```

If you use JWTs, also add `users.token_version INT NOT NULL DEFAULT 0` (or reuse something similar) so that a reset can log out existing sessions.

Add both through your existing migration tool.

## 2. Endpoints

| Route | Purpose |
|---|---|
| `POST /auth/password-reset` `{ email }` | Starts a reset. **Always returns the same 202 response**, whether or not the email exists. |
| `POST /auth/password-reset/confirm` `{ token, password }` | Checks the token and sets the new password. |
| *(optional)* `POST /auth/password-reset/verify` `{ token }` | Lets the frontend show "link expired" before the user types a new password. |

## 3. Request flow

1. Validate the input and normalize the email (trim it; match it case-insensitively with `lower(email)` or `citext`).
2. Look up the user. **If there's no user, return 202 and do nothing else.**
3. If the user exists:
   - Create the token: `crypto.randomBytes(32).toString('base64url')`
   - Store `sha256(token)` with `expires_at = now() + interval '30 minutes'`
   - Delete or expire that user's older unused tokens
   - Send the email **asynchronously** (queue it or fire and don't wait). Otherwise the slower response for real accounts reveals which emails are registered.
4. Build the link from a configured `APP_BASE_URL`. **Never build it from `req.headers.host`**, because an attacker can set that header and receive the reset link on their own domain.
   `https://app.example.com/reset-password?token=...`

## 4. Confirm flow (one transaction)

```sql
BEGIN;
SELECT id, user_id FROM password_reset_tokens
 WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
 FOR UPDATE;
-- none found → 400 "invalid or expired link"
UPDATE users SET password_hash = $2, token_version = token_version + 1 WHERE id = $user_id;
UPDATE password_reset_tokens SET used_at = now() WHERE user_id = $user_id AND used_at IS NULL;
-- delete sessions for user_id if using express-session / a sessions table
COMMIT;
```

- Apply the same password rules and hashing library (bcrypt or argon2) that signup uses.
- After the commit, send a "your password was changed" email to the account.
- Don't log the user in automatically. Send them to the login page.

## 5. Security checklist

- **Rate limits** (e.g. `express-rate-limit` with a Redis store if you run several instances): per IP on both endpoints, plus per email on the request endpoint (e.g. 3 per hour).
- **Tokens:** single use, short expiry, stored hashed, never logged. Scrub `token` from request logs and error trackers.
- **Reset page:** send `Referrer-Policy: no-referrer` so the token doesn't leak to third-party scripts or links.
- **Identical responses:** the request endpoint returns the same body and status in every case.
- **CSRF:** if you use cookie sessions, protect these endpoints the same way as your other forms.
- **Cleanup:** a scheduled job deletes rows where `expires_at < now() - interval '1 day'`.

## 6. Email

- Use a transactional provider (Postmark, SES, Resend, SendGrid) through `nodemailer` or the provider's SDK, behind a small `mailer.sendPasswordReset(to, url)` wrapper so tests can stub it.
- Send plain-text and HTML versions. Say how long the link is valid and add "If you didn't request this, ignore this email."
- Set up SPF, DKIM and DMARC on the sending domain so the emails don't land in spam.

## 7. Suggested file layout

```
migrations/XXXX_password_reset_tokens.sql
src/auth/passwordReset.service.js   # createToken, consumeToken (DB + crypto)
src/auth/passwordReset.routes.js    # validation, rate limits, HTTP responses
src/mail/mailer.js                  # provider wrapper + templates
src/jobs/cleanupResetTokens.js
```

## 8. Tests

- An unknown email and a known email get identical 202 responses, and only the known one triggers a send.
- A valid token resets the password, the old password stops working, and old sessions or JWTs are rejected.
- Expired, used, wrong or malformed tokens get a 400.
- A token can't be used twice, including two confirm requests at the same moment (the `FOR UPDATE` lock handles this).
- A second request invalidates the first token.
- Rate limits kick in at the set thresholds.
- The link uses `APP_BASE_URL` even when a forged `Host` header is sent.

## Questions that could change the plan

1. **Hashing:** bcrypt, argon2 or something else? Reuse whatever signup uses.
2. **Sessions:** `express-session` with a store, or JWT? This decides how step 4 logs out existing sessions.
3. **Database access and migrations:** raw `pg`, Knex, Prisma, Sequelize or node-pg-migrate?
4. **Frontend:** a separate app (the link points there and calls the API) or server-rendered pages (Express serves the form)?
5. **Email:** is a provider already set up?
6. **Accounts:** can one email match more than one account, and are emails stored in mixed case?

Once you point me at the codebase, I can turn this into concrete changes that match your existing code.
````

### plan-reset off 3

````markdown
# Plan: Password reset by email

I couldn't see your app's code, so this plan assumes a typical setup: Express, `pg` or an ORM, and passwords hashed with bcrypt or argon2. Change names to match your code.

## 1. Database

Keep reset tokens in their own table, not as columns on `users`. That way each request gets its own row, you keep a record of past requests, and cleanup is easy.

```sql
CREATE TABLE password_reset_tokens (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  BYTEA  NOT NULL UNIQUE,        -- SHA-256 of the raw token
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  request_ip  INET
);
CREATE INDEX ON password_reset_tokens (user_id);
```

- **Only store the hash.** The raw token goes out in the email and nowhere else. If the database leaks, nobody can use the stored tokens.
- SHA-256 is enough here. The token is 256 random bits, so it doesn't need a slow hash like bcrypt, and SHA-256 lets you look tokens up with the index.
- If you have a sessions table, you'll also need a way to end a user's sessions (step 3).

## 2. Requesting a reset: `POST /auth/password/forgot`

Body: `{ email }`

1. Check the email format and normalize it (trim, lowercase, matching how you store emails).
2. Look up the user.
3. **Always send the same response:** `202 { message: "If an account exists, we've sent a link." }`. Try to take about the same time whether or not the email exists, so attackers can't use this to find out which emails have accounts. The simplest way is to send the email from a background job so the response comes back right away either way.
4. If the user exists:
   - Make a token: `crypto.randomBytes(32).toString('base64url')`.
   - Optionally delete or expire that user's older unused tokens.
   - Insert the token hash with `expires_at = now() + interval '30 minutes'`.
   - Send the link: `https://app.example.com/reset-password?token=<raw>`. Build the base URL from config, **never from the `Host` header**, which an attacker can fake.
5. **Rate limit** by IP and by email, for example with `express-rate-limit` or a Redis counter. A reasonable limit is about 5 per hour per email and 20 per hour per IP.

## 3. Setting the new password: `POST /auth/password/reset`

Body: `{ token, newPassword }`

Do all of this in **one transaction**:

```sql
SELECT id, user_id FROM password_reset_tokens
WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
FOR UPDATE;
```

- If no row comes back, return `400 "Invalid or expired link"`. Use the same message for every failure.
- Check the new password with the same rules you use at signup.
- Hash it with your existing password hasher and `UPDATE users SET password_hash = ...`.
- Mark the token used: `UPDATE password_reset_tokens SET used_at = now() WHERE id = $1`. Also expire the user's other unused tokens.
- **End the user's existing sessions and refresh tokens.** If you use stateless JWTs, bump a `users.token_version` or `password_changed_at` column and check it when validating tokens.
- Commit, then send a "your password was changed" email.

The row lock (`FOR UPDATE`) plus `used_at` stops a token from being used twice, even by two requests at the same moment.

Optional: add `GET /auth/password/reset/validate?token=` so the frontend can tell the user a link has expired before they type a new password.

## 4. Sending email

- Put email behind a small interface, `mailer.send({ to, subject, html, text })`. Back it with SES, Postmark, SendGrid or SMTP via Nodemailer, and use a console or [Mailpit](https://mailpit.axllent.org/) version in development.
- Send from a background job (BullMQ, pg-boss, or at least a promise you don't await, with error logging) so the SMTP delay doesn't show in response times.
- Include a plain-text version, say when the link expires, and add "If you didn't request this, ignore this email."
- Set up SPF, DKIM and DMARC on the sending domain so the email doesn't land in spam.

## 5. Frontend

- A "Forgot password" page with an email field that shows the same message whatever happens.
- A `/reset-password` page that reads `token` from the URL, asks for the new password twice and POSTs it.
- On that page, add `<meta name="referrer" content="no-referrer">` (or send a `Referrer-Policy` header) so the token isn't passed to third-party scripts or links. Remove the token from the URL with `history.replaceState` after reading it.

## 6. Security checklist

- [ ] The token comes from `crypto.randomBytes`, never `Math.random` or a UUIDv1.
- [ ] Only the hash is stored, and lookup goes through the unique index.
- [ ] Tokens expire in 30 to 60 minutes and work only once.
- [ ] The forgot endpoint gives the same response for every email.
- [ ] Both endpoints are rate limited.
- [ ] Sessions are ended after a reset.
- [ ] The raw token never appears in logs (check the request logger, since it may log bodies or query strings).
- [ ] Links are built only from a configured base URL.
- [ ] HTTPS only, and the user gets an email when the password changes.
- [ ] If you use cookie auth, CSRF protection doesn't break these endpoints. Both are safe to leave out of CSRF checks because the token authorizes the request.

## 7. Cleanup

Run a nightly job: `DELETE FROM password_reset_tokens WHERE expires_at < now() - interval '7 days';`

## 8. Tests

- Forgot password with an existing email and an unknown email: same status and body, and email is sent only for the existing one.
- Reset with a valid token changes the password, and the old password stops working.
- An expired token, a used token and a made-up token all return the same 400.
- Two resets with the same token at once: only one succeeds.
- Old sessions are rejected after a reset.
- Rate limits kick in.
- The mailer is mocked, and the test pulls the token out of the captured email.

## Build order

1. Migration
2. Token helpers (`generateToken`, `hashToken`)
3. Mailer interface and development version
4. Forgot endpoint and rate limit
5. Reset endpoint, transaction and ending sessions
6. Frontend pages
7. Tests
8. Cleanup job and production email provider

Two things decide the details: how sessions work (cookie sessions or JWTs) and which database library you use. If you share your auth code, I can turn this into actual routes and a migration.
````

### plan-reset on 1

````markdown
Add a `password_reset_tokens` table and two endpoints, `POST /auth/forgot-password` and `POST /auth/reset-password`. Store only a hash of each token, make tokens single-use and short-lived, and end the user's sessions after a reset. I haven't seen your code, so this assumes `users.email` is unique and passwords are already hashed with bcrypt or argon2.

## Steps

1. **Migration**
   ```sql
   CREATE TABLE password_reset_tokens (
     id          bigserial PRIMARY KEY,
     user_id     bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     token_hash  text NOT NULL UNIQUE,
     expires_at  timestamptz NOT NULL,
     used_at     timestamptz,
     created_at  timestamptz NOT NULL DEFAULT now()
   );
   ALTER TABLE users ADD COLUMN password_changed_at timestamptz;
   ```
   Store a SHA-256 of the token, not the token itself. If the database leaks, nobody can use the stored values to reset a password. SHA-256 is enough here because the token is 32 random bytes, so it doesn't need a slow hash like bcrypt.

2. **`POST /auth/forgot-password` `{ email }`**
   - Always send the same `202` response, whether or not the account exists. Otherwise the endpoint tells anyone which emails have accounts.
   - Look up the user with `lower(email)`, or whatever normalization signup already uses.
   - If the user exists, delete their unused tokens. Then create `crypto.randomBytes(32).toString('base64url')`, store its hash with `expires_at = now() + interval '30 minutes'`, and email the link.
   - Queue the email or send it without awaiting it before you respond. If you wait for the provider, response time reveals which emails exist.
   - Build the link from a config value like `APP_BASE_URL`, never from `req.headers.host`. An attacker can set the Host header and get a reset link pointing at their own domain.

3. **`POST /auth/reset-password` `{ token, newPassword }`**, in one transaction:
   ```sql
   UPDATE password_reset_tokens
      SET used_at = now()
    WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
   RETURNING user_id;
   ```
   - No row returned means the token is invalid. Send one generic `400` for every failure reason.
   - Claiming the token in a single conditional `UPDATE` means two concurrent requests can't both use it.
   - Check the new password against the same rules as signup and hash it with your existing hasher. Update `users.password_hash` and `password_changed_at`, and delete the user's other reset tokens.
   - Revoke sessions and refresh tokens. How depends on Q1.
   - Send a "your password was changed" email so the account owner notices a takeover.

4. **Rate limiting.** Limit `forgot-password` per IP and per email, for example 5 requests per hour per email. This stops attackers from using the endpoint to flood someone's inbox or run up your email bill. Limit `reset-password` per IP.

5. **Reset page.** The token sits in the URL, so set `Referrer-Policy: no-referrer` on that page and keep analytics and third-party scripts off it. Otherwise the token can leak to those services through the referrer or URL logs.

6. **Cleanup job.** Run `DELETE FROM password_reset_tokens WHERE expires_at < now() - interval '1 day'` daily.

7. **Tests.** Cover an unknown email getting the same response as a known one, expired tokens, reused tokens, two concurrent resets with the same token, the old session being rejected after a reset, and rate limits.

## Risks

- **R1.** If the app uses stateless JWTs, a stolen token keeps working after the reset unless auth middleware rejects JWTs whose `iat` is earlier than `password_changed_at`.
- **R2.** If the email provider doesn't have SPF and DKIM set up for your sending domain, reset emails will land in spam and users will think the feature is broken.
- **R3.** If `users.email` isn't unique ignoring case, one address can match several accounts. Check with `SELECT lower(email), count(*) FROM users GROUP BY 1 HAVING count(*) > 1` before building on it.

## Questions

- **Q1.** Are sessions stored server-side (for example `express-session` with a Postgres store) or are they JWTs? Server-side sessions: delete the user's rows. JWTs: add the `password_changed_at` check from R1.
- **Q2.** Which email provider is already set up, if any? If none, use Postmark or SES through `nodemailer`.

Next: answer Q1, because it decides how step 3 revokes sessions.
````

### plan-reset on 2

````markdown
# Plan: password reset by email

Store a random single-use token as a hash in a new Postgres table, email a link to the user, and have a confirm endpoint that sets the new password and signs the user out everywhere. I haven't seen the app's code, so this plan assumes passwords are already hashed with bcrypt or argon2 and that sessions or refresh tokens live somewhere you can revoke.

## Steps

1. **Migration.** Store only the SHA-256 hash of each token. If the database leaks, the attacker still can't use the reset links.
   ```sql
   CREATE TABLE password_reset_tokens (
     id          bigserial PRIMARY KEY,
     user_id     bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     token_hash  text NOT NULL UNIQUE,
     expires_at  timestamptz NOT NULL,
     used_at     timestamptz,
     created_at  timestamptz NOT NULL DEFAULT now()
   );
   CREATE INDEX ON password_reset_tokens (user_id);
   ```
2. **`POST /auth/password-reset/request` `{ email }`**
   - Look up the user with `lower(email) = lower($1)`, unless the column is already `citext`.
   - If the user exists:
     - Delete their unused tokens.
     - Create a new token with `crypto.randomBytes(32).toString('base64url')`.
     - Insert its hash with `expires_at = now() + interval '30 minutes'`.
     - Queue the email.
   - Always return the same `202` with the same body, whether or not the user exists. Send the email after responding so response time doesn't reveal which emails have accounts.
   - Rate limit by IP and by email, for example 5 per hour per email. Without a limit the endpoint can be used to flood someone's inbox.
3. **Email link.** Build it from a configured `APP_URL`, never from `req.headers.host`. Otherwise an attacker can send a request with a forged Host header and get a real reset email that points to their own domain. Use your existing email provider through nodemailer, or add one (SES, Postmark).
4. **`POST /auth/password-reset/confirm` `{ token, password }`.** Do all of this in one transaction:
   ```sql
   UPDATE password_reset_tokens
      SET used_at = now()
    WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
   RETURNING user_id;
   ```
   - If no row comes back, return one generic "invalid or expired" error.
   - Otherwise:
     - Hash the new password with the same function and cost as signup.
     - Update `users`.
     - Delete the user's other reset tokens.
     - Revoke all of the user's sessions and refresh tokens.
   - Doing the claim in a single `UPDATE ... WHERE used_at IS NULL` means two requests racing with the same token can't both succeed.
   - Apply the same password rules as signup.
5. **Reset page.** Send `Referrer-Policy: no-referrer` and load no third-party scripts on it. The token is in the URL and would otherwise leak through the Referer header or analytics.
6. **Notify.** Email the user a "your password was changed" message after a successful reset. That's how they find out if someone else did it.
7. **Tests:**
   - Unknown email gets the same response as a known one.
   - Expired token is rejected.
   - A token can't be used twice.
   - Old sessions are rejected after a reset.
   - A second request makes the first token invalid.
   - Rate limit returns 429.
   - Link uses `APP_URL` even when the Host header is forged.

## Decisions

- **Database token instead of a signed JWT.** A JWT can't be made single-use or revoked unless you also store state for it, and at that point the table is simpler.
- **30-minute expiry.** This is a judgment call. Anything past an hour leaves a stolen link usable for longer.

## Open questions

- **Q1:** Which email provider is already set up, if any?
- **Q2:** Where do sessions live (express-session store, JWT with refresh tokens, or something else)? Step 4 depends on being able to revoke them.
- **Q3:** Does the rate limiter need to work across several app instances? If so, use Redis or Postgres. An in-memory limiter only counts per instance.

Next: answer Q2, since it decides how step 4 revokes sessions.
````

### plan-reset on 3

````markdown
Store a hashed, single-use, short-lived token in a new table, and add two endpoints: one emails a link, the other checks the token and sets the new password.

## Schema

```sql
CREATE TABLE password_reset_tokens (
  id          bigserial PRIMARY KEY,
  user_id     <users.id type> NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  bytea NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON password_reset_tokens (user_id);
```

- Store only the SHA-256 of the token. If the database leaks, stored tokens can't be used. SHA-256 is enough here (no bcrypt needed) because the token has 256 bits of randomness.
- If you use JWTs, also add `users.password_changed_at`. You need it to invalidate existing logins (step 5).

## Steps

1. **`POST /auth/forgot-password { email }`**
   - Look up the user with a normalized email (`lower(trim(email))`). Match however signup stores emails, or some users will never find their account.
   - If the user exists, generate `crypto.randomBytes(32)` and encode it base64url. Insert its hash with `expires_at = now() + interval '30 minutes'`, then email the link.
   - Always return the same `202` body, whether or not the user exists. Otherwise the endpoint reveals which emails have accounts.
   - Send the email after responding or through a queue. Otherwise the slower response for real users reveals which emails exist.
2. **Email link**: `https://app.example.com/reset-password?token=...`
   - The link must open a page with a form that POSTs the token. Never consume the token on GET, because email security scanners prefetch links and would use it up.
   - Serve that page with `Referrer-Policy: no-referrer` so the token doesn't leak to third-party scripts or links.
   - Build the base URL from config, never from the `Host` header. Otherwise an attacker can make you send reset links that point to their domain.
3. **`POST /auth/reset-password { token, password }`**
   - Hash the token and consume it in one statement so two concurrent requests can't both use it:
     ```sql
     UPDATE password_reset_tokens SET used_at = now()
     WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
     RETURNING user_id;
     ```
   - If no row comes back, return one generic "invalid or expired link" error.
   - Check the password against your signup rules and hash it with the same algorithm signup uses.
4. **One transaction**: consume the token, update `users.password_hash` (and `password_changed_at`), and delete the user's other unused reset tokens.
5. **Invalidate existing logins.** Otherwise someone who stole a session keeps it after the reset.
   - Session store: delete the user's sessions.
   - JWT: reject tokens whose `iat` is earlier than `password_changed_at`.
6. **Send a "your password was changed" email** so the real owner notices a reset they didn't make.
7. **Rate-limit `forgot-password`** per IP and per email (for example, 3 per email per hour). Without a limit, it can be used to flood someone's inbox and run up your email costs.
8. **Clean up** expired and used tokens with a daily job, or delete them lazily on insert.

## Decisions to make

| Code | Decision | Recommendation |
|---|---|---|
| D1 | Email provider | Use the transactional provider you already have. Otherwise use Postmark, SES or Resend through `nodemailer` or their SDK. Set up SPF and DKIM first, or reset emails land in spam. |
| D2 | Token lifetime | 30 minutes |
| D3 | Log the user in after reset | No. Send them to the login page. It's simpler, and a leaked link then can't be used to log in. |

I haven't seen your code. This plan assumes signup already hashes passwords with bcrypt or argon2 and that you know whether logins use sessions or JWTs. Step 5 depends on that.

Next: pick D1, because the email setup (domain verification, DNS) takes the longest to finish.
````

## plan-darkmode

Prompt:

````text
Plan adding a dark mode toggle to a React app that already styles everything with CSS variables. The choice should persist across visits.
````

### plan-darkmode off 1

````markdown
I couldn't look at your codebase from here, so this plan assumes a typical client-rendered React app (Vite or CRA). I've noted where Next.js or other server rendering changes things.

## Dark mode toggle plan

### 1. Decide on the model
- **Stored preference:** `'light' | 'dark' | 'system'`. With `'system'` as the default, first-time visitors get their OS setting and can still override it.
- **Applied theme:** always `light` or `dark`. Set it as `data-theme` on `<html>`.
- **Persistence:** `localStorage` under one key, e.g. `theme`. A cookie is only needed if the server has to know the theme (see step 6).

### 2. CSS: override the variables you already have
Because every style already uses variables, dark mode is mostly one extra block:

```css
:root {
  color-scheme: light;
  --bg: #fff;
  --fg: #111;
  /* ...existing tokens */
}

:root[data-theme="dark"] {
  color-scheme: dark;   /* dark scrollbars, form controls, autofill */
  --bg: #0f1115;
  --fg: #e6e6e6;
  /* ...override only tokens that change */
}
```

Also check for:
- Hard-coded colors that skip the variables (inline styles, SVG `fill`, third-party widget CSS, box-shadows).
- Images or illustrations that look wrong on a dark background.
- `<meta name="theme-color">` (the mobile browser bar). Update it when the theme changes.

### 3. Stop the wrong theme from flashing on load
This is the step people most often miss. React mounts after the first paint, so setting the theme only inside React makes returning dark-mode users see a white flash. Put a small blocking script in `index.html` `<head>`, before any CSS or JS bundle:

```html
<script>
  (function () {
    try {
      var p = localStorage.getItem('theme') || 'system';
      var dark = p === 'dark' ||
        (p === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    } catch (e) {}
  })();
</script>
```

### 4. React: `ThemeProvider` and `useTheme`
- Read the starting preference from `localStorage`, wrapped in try/catch because storage can be blocked or unavailable.
- When the preference changes:
  - Resolve it to light or dark.
  - Set `document.documentElement.dataset.theme`.
  - Write it to `localStorage`.
- While the preference is `'system'`, listen to `matchMedia('(prefers-color-scheme: dark)')` so the app follows OS changes live.
- Optionally, listen to the `storage` event so other open tabs stay in sync.
- Expose `{ preference, resolvedTheme, setPreference }`.

```tsx
const ThemeContext = createContext<ThemeCtx | null>(null);

export function ThemeProvider({ children }) {
  const [preference, setPreference] = useState<Pref>(() => readStored() ?? 'system');
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)');
  const resolvedTheme = preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
  }, [resolvedTheme]);

  useEffect(() => {
    try { localStorage.setItem('theme', preference); } catch {}
  }, [preference]);

  return <ThemeContext.Provider value={{ preference, resolvedTheme, setPreference }}>{children}</ThemeContext.Provider>;
}
```

### 5. The toggle component
- Pick one of two designs:
  - A simple button that switches between light and dark.
  - A three-way control (Light / Dark / System), which keeps the option to follow the OS.
- **Accessibility:**
  - A real `<button>` with an `aria-label` like "Switch to dark theme", or `aria-pressed`.
  - A visible focus ring.
  - Don't show the state by color alone; use an icon plus the label.
- Place it in the header or settings, wherever users expect to find it.

### 6. If you use server rendering (Next.js etc.)
- Put the step 3 script in the root layout `<head>`.
- Add `suppressHydrationWarning` on `<html>`, because the script changes it before hydration.
- Don't render theme-dependent content (like the toggle icon) until after mount, or the server and client output won't match.
- Or store the preference in a cookie so the server can render `data-theme` directly.

### 7. Testing
- **Unit:** the provider resolves `system` from a mocked `matchMedia`, persists the choice to `localStorage`, and survives storage throwing an error.
- **E2E (Playwright):**
  - Toggle, reload, and confirm the theme is kept.
  - Emulate `colorScheme: 'dark'` with nothing stored.
  - Confirm there's no flash on reload.
- **Manual:** check contrast (WCAG AA) for text, borders, and focus states in dark mode.

### Order of work
1. Dark variable block, plus an audit for hard-coded colors
2. Inline script in `<head>`
3. `ThemeProvider` and `useTheme`
4. Toggle component
5. Tests
6. Polish: `theme-color` meta, tab sync, image fixes

**My recommendations:**
- Default to `'system'`, but make the visible toggle a simple light/dark button. Add "System" as a third option only if you have a settings page.
- Don't skip step 3; that's where the white flash gets fixed.

Separately: the Canva, Gmail, Google Calendar and Google Drive connectors need to be authorized in your claude.ai connector settings before they can be used. They aren't needed for this plan.
````

### plan-darkmode off 2

````markdown
# Plan: Dark mode toggle that persists across visits

Your colors already live in CSS variables, so most of the work is choosing the right theme before the first paint and remembering the user's choice. I didn't have your project files in this session, so file names below are examples. Adjust them to fit your app.

## 1. Add the dark values to your CSS

Keep your current `:root` values as the light theme. Add dark overrides under an attribute on `<html>`:

```css
:root {
  --bg: #fff;
  --text: #111;
  color-scheme: light;
}

:root[data-theme="dark"] {
  --bg: #0f1115;
  --text: #e6e6e6;
  color-scheme: dark; /* scrollbars, form controls, autofill */
}
```

Before you start, search the code for hardcoded colors (`#`, `rgb(`, `white`, `black`) in CSS and inline styles. Also check SVGs, shadows and borders. These usually cause most of the "dark mode looks broken" bugs.

## 2. Decide which theme to use

Only save a value when the user actually picks one:

1. If `localStorage.theme` is `"light"` or `"dark"`, use it.
2. Otherwise use the OS setting from `prefers-color-scheme`.

Users who never touch the toggle keep following their OS, and anyone who does choose gets their choice back on every visit.

## 3. Avoid a flash of the wrong theme on load

If you only set the theme inside React, light-mode users with a saved dark choice will see a white flash first. To prevent this, put a small blocking script in `index.html` inside `<head>`, before your CSS and bundle load:

```html
<script>
  (function () {
    try {
      var t = localStorage.getItem('theme');
      if (t !== 'light' && t !== 'dark') {
        t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
      document.documentElement.dataset.theme = t;
    } catch (e) {}
  })();
</script>
```

The `try/catch` matters because `localStorage` can throw when storage is blocked or in some private browsing modes.

## 4. Theme state in React (`src/theme/ThemeProvider.jsx`)

- **Starting state:** read `document.documentElement.dataset.theme`, which the script above already set, so React and the DOM agree from the start.
- **`setTheme(next)`:** update state, set `data-theme` on `<html>`, and save to `localStorage` (wrapped in `try/catch`).
- **Following the OS:** while nothing is saved, listen for `matchMedia('(prefers-color-scheme: dark)')` changes so the app follows the OS if it switches while the page is open.
- **Multiple tabs (optional):** listen for the `storage` event so a change in one tab shows up in the others.
- **Hook:** expose `{ theme, setTheme, toggle }` through a `useTheme()` hook.

If you'd rather skip a provider, a single `useTheme` hook works too, since the source of truth is the attribute on `<html>`.

## 5. The toggle component (`src/components/ThemeToggle.jsx`)

- Use a real `<button>`, with `aria-label="Switch to dark theme"` (the label changes with the state) or with `aria-pressed`.
- Show a sun or moon icon, styled with the same variables.
- Put it in the header or nav.
- Optional: a three-way control (Light / Dark / System), where "System" deletes the saved value.

## 6. Polish

- **No animated switch:** if elements have `transition` on color properties, the whole page will animate when the theme changes. To stop this, add a class that sets `transition: none` for one frame while switching.
- **Mobile browser bar:** update `<meta name="theme-color">` when the theme changes.
- **Images:** swap logos and illustrations that don't work on dark backgrounds, either with `<picture>` and a `prefers-color-scheme` source or with a CSS variable for the image URL.
- **Server rendering:** if this is Next.js or uses SSR, add `suppressHydrationWarning` on `<html>`, or use `next-themes`, which already does all of the above.

## 7. Testing

- **Unit tests:** starting state with a saved value, with no saved value (mock `matchMedia`), and when `localStorage` throws; `toggle` updates both the attribute and storage.
- **Manual checks:**
  - Hard reload with each saved value, using a throttled network, to confirm there's no flash.
  - Change the OS theme while no value is saved.
  - Try a private window.
  - Run a contrast check (WCAG AA) on the dark colors.

## Order of work

1. Dark variable values and the hardcoded-color cleanup.
2. The inline script.
3. The hook or provider.
4. The toggle button.
5. Polish and tests.

Steps 1–4 are enough for a working, persistent toggle. Step 5 is refinement.

---

Unrelated to this task: the Canva, Gmail, Google Calendar and Google Drive connectors need to be authorized in your claude.ai connector settings before they can be used. They won't work until you do that.
````

### plan-darkmode off 3

````markdown
# Plan: Dark mode toggle for a React app styled with CSS variables

Since everything already uses CSS variables, the theme is just a set of variable overrides switched by an attribute on `<html>`. React only needs to flip that attribute and save the choice.

## 1. Define the dark palette in CSS

```css
:root {
  color-scheme: light;
  --bg: #ffffff;
  --text: #1a1a1a;
  /* ...existing tokens... */
}

:root[data-theme="dark"] {
  color-scheme: dark;   /* dark native scrollbars, form controls, autofill */
  --bg: #121212;
  --text: #e6e6e6;
  /* override only color tokens; leave spacing and fonts alone */
}
```

- **Check for hardcoded colors.** Search for hex, `rgb(` and `hsl(` values outside the token file, plus inline `style` colors and SVG `fill`/`stroke`. These won't switch with the theme, so turn them into tokens.
- **Watch shadows and images.** Shadows, borders and logos often look wrong on a dark background. Add tokens like `--shadow` or `--logo-filter` where you need them.

## 2. Decide the starting theme

Check in this order:
1. The saved choice in `localStorage` (`"light"` or `"dark"`)
2. The OS setting from `prefers-color-scheme`
3. Light

**Recommendation:** save a value only when the user actually clicks the toggle. Until then, follow the OS setting, including if it changes while the page is open.

## 3. Prevent a flash of the wrong theme (the key step)

If React sets the theme after it mounts, dark-mode users briefly see the light theme on every load. To avoid that, put a small blocking script in `index.html` `<head>`, before any CSS or JS bundles:

```html
<script>
  (function () {
    try {
      var t = localStorage.getItem('theme');
      if (t !== 'light' && t !== 'dark') {
        t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
      document.documentElement.dataset.theme = t;
    } catch (e) {}
  })();
</script>
```

The `try/catch` matters because `localStorage` can throw in private browsing or when storage is blocked.
**Next.js/SSR:** put the same script in the root layout, and add `suppressHydrationWarning` on `<html>`, because the server can't know the theme ahead of time.

## 4. Add a `useTheme` hook or context

`src/theme/ThemeProvider.tsx`:

```tsx
type Theme = 'light' | 'dark';
const ThemeContext = createContext<{ theme: Theme; toggle: () => void } | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Read what the inline script already set, so React matches the page
  const [theme, setTheme] = useState<Theme>(
    () => (document.documentElement.dataset.theme as Theme) ?? 'light'
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // Follow OS changes only while the user hasn't chosen explicitly
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => {
      if (!safeGet('theme')) setTheme(e.matches ? 'dark' : 'light');
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Optional: keep other open tabs in sync
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'theme' && (e.newValue === 'light' || e.newValue === 'dark')) setTheme(e.newValue);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const toggle = () =>
    setTheme(prev => {
      const next = prev === 'dark' ? 'light' : 'dark';
      safeSet('theme', next);   // saves only on an explicit click
      return next;
    });

  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>;
}
```

`safeGet` and `safeSet` are small `localStorage` wrappers with `try/catch`. Wrap the app root in `<ThemeProvider>`.

## 5. Build the toggle component

```tsx
export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const isDark = theme === 'dark';
  return (
    <button type="button" onClick={toggle} aria-pressed={isDark}
            aria-label="Dark mode" title={isDark ? 'Switch to light' : 'Switch to dark'}>
      {isDark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
```

- **Placement:** put it in the header or nav.
- **Transitions:** if you animate the color change, skip the animation for `prefers-reduced-motion` users and on the first page load.

## 6. Optional extras

- **Three options:** offer Light / Dark / System instead of a two-way toggle. Choosing "System" removes the saved key.
- **Browser UI color:** update `<meta name="theme-color">` when the theme changes, so mobile browser bars match.
- **Third-party widgets:** charts, code highlighters and map embeds may need their own theme setting passed in.

## 7. Testing

- **Unit tests (RTL):** clicking the toggle switches `data-theme` and writes `localStorage`. A saved value beats the OS setting. With no saved value, the OS setting is used.
- **Manual checks:**
  - Hard-reload in dark mode and confirm there's no flash of light.
  - Test in a private window.
  - Change the OS theme while the app is open.
  - Test with two tabs open.
- **Visual check:** go through every page in dark mode to catch leftover hardcoded colors and contrast problems (aim for WCAG AA: 4.5:1 for body text).

## Order of work
1. Dark tokens and fixing hardcoded colors
2. The inline script
3. `ThemeProvider`
4. `ThemeToggle`
5. Tests and a visual check of every page

Steps 1–2 alone already give you a dark theme that follows the OS setting, so you can ship in stages if you want.

---

This is a general plan; I didn't read your code. To make it specific to your app, share the setup (Vite/CRA/Next, where the tokens are defined, TypeScript or not).

Separately, the Canva, Gmail, Google Calendar and Google Drive connectors need to be authorized in your claude.ai connector settings before they'll work. None of them are needed for this task.
````

### plan-darkmode on 1

````markdown
Set a `data-theme` attribute on `<html>` from an inline script before React loads, override the CSS variables under that attribute, and store the explicit choice in `localStorage`.

## Steps

1. **Dark variable set.** Add overrides next to the existing `:root` block. `color-scheme` makes native scrollbars, form controls and autofill match the theme.

   ```css
   :root { color-scheme: light; /* existing vars */ }
   :root[data-theme="dark"] {
     color-scheme: dark;
     --bg: #121212;
     --text: #e6e6e6;
     /* every color var from :root */
   }
   ```

2. **Inline script in `index.html` `<head>`, before the CSS and bundle.** Setting the theme inside React runs after first paint, so dark-mode users would see a white flash on every load.

   ```html
   <script>
     (function () {
       var t;
       try { t = localStorage.getItem('theme'); } catch (e) {}
       if (t !== 'light' && t !== 'dark') {
         t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
       }
       document.documentElement.dataset.theme = t;
     })();
   </script>
   ```

   The `try` is needed because `localStorage` throws when storage is blocked, and an uncaught error there would leave the page with no theme.

3. **`useTheme` hook.** Read the initial value from the attribute, not from `localStorage`. The script already resolved it, and reading it again could disagree with what is on screen.

   ```tsx
   export function useTheme() {
     const [theme, setTheme] = useState(
       () => document.documentElement.dataset.theme as 'light' | 'dark'
     );
     const toggle = () => {
       const next = theme === 'dark' ? 'light' : 'dark';
       document.documentElement.dataset.theme = next;
       try { localStorage.setItem('theme', next); } catch {}
       setTheme(next);
     };
     return { theme, toggle };
   }
   ```

   A plain hook is enough for one toggle. Move it to a context only if several components need to read the theme.

4. **Toggle button.** Use a `<button>` with `aria-pressed={theme === 'dark'}` and a text label. An icon alone gives screen readers nothing to announce.

5. **Tests.** Cover three cases: the toggle flips the attribute and writes storage, a stored value wins over the OS setting, and the OS setting applies when nothing is stored.

## Decisions and risks

- **D1: Default follows the OS until the user clicks.** Only an explicit choice is saved, so users who never click keep tracking their OS setting. If you want a visible "System" option, make it a 3-state control and remove the key when it is picked.
- **R1: SSR (Next.js, Remix).** `document` does not exist on the server, and the button icon will cause a hydration mismatch. Put `suppressHydrationWarning` on `<html>` and render the icon only after mount. This does not apply to a Vite or CRA SPA.
- **R2: Colors outside your variables.** Hardcoded hex values, inline SVG fills, images with white backgrounds and third-party component styles will stay light. Grep for hex and `rgb(` values and check third-party components before shipping.
- **R3: Strict CSP.** If your Content Security Policy blocks inline scripts, the script in step 2 needs a nonce or hash.

Next: confirm whether the app is SPA or SSR, since R1 changes steps 2 and 3.
````

### plan-darkmode on 2

````markdown
Set a `data-theme` attribute on `<html>`, override the CSS variables under it, save the choice in `localStorage`, and apply it with an inline script before React loads so the page never flashes the wrong theme.

## Steps

1. **Dark variable set.** Add overrides next to the existing variables, plus `color-scheme` so native scrollbars, form controls and autofill follow the theme.
   ```css
   :root { color-scheme: light; --bg: #fff; --text: #111; }
   :root[data-theme="dark"] { color-scheme: dark; --bg: #121212; --text: #eee; }
   ```

2. **Inline script in `index.html` `<head>`, before any stylesheet or bundle.** React runs after first paint, so setting the theme from a `useEffect` shows a white flash on every dark-mode load.
   ```html
   <script>
     (function () {
       var t;
       try { t = localStorage.getItem('theme'); } catch (e) {}
       if (t !== 'light' && t !== 'dark') {
         t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
       }
       document.documentElement.dataset.theme = t;
     })();
   </script>
   ```
   The `try` is needed because `localStorage` throws when storage is blocked, and an uncaught error here would leave the page unthemed.

3. **`useTheme` hook.** Read the initial value from `document.documentElement.dataset.theme`, not from `localStorage`, so React and the inline script cannot disagree. On toggle, set the attribute and write `localStorage` inside a `try`.

4. **Toggle button.** A `<button>` with `aria-pressed={theme === 'dark'}` and a text or `aria-label` that names the action. Put it wherever the header lives. A context provider is only needed if more than one component reads the theme.

5. **Test.** Reload in dark mode with cache disabled and throttled CPU to confirm no flash. Clear storage to confirm the OS setting is used. Block site storage to confirm the toggle still works for the session.

## Decisions

- **OS preference only until the user toggles.** Once they pick, the saved value wins. This avoids a three-way light/dark/system control. The downside is that a user who toggled once no longer follows OS changes. Add a "system" option only if someone asks for it.
- **Attribute on `<html>`, not a class on a React root.** The inline script can set it before React mounts, and portals and modals rendered outside the root inherit it.

## Risks

- Colors not routed through variables do not switch: inline `style` props, hardcoded hex in CSS, SVGs with fixed `fill`, images with white backgrounds, and third-party components. Grep for hex and `rgb(` values before calling it done.
- If the app uses SSR (Next.js, Remix), the server renders without the attribute. Put the script in the document head the same way and add `suppressHydrationWarning` on `<html>`, or React logs a mismatch.
- A strict Content Security Policy blocks the inline script. It then needs a nonce or hash.

Next: confirm whether the app is client-only (Vite/CRA) or SSR, since step 2 goes in a different file for each.
````

### plan-darkmode on 3

````markdown
Put the theme on `<html>` as a `data-theme` attribute, set it with an inline script before React loads, and save the user's choice in `localStorage`.

## Steps

1. **CSS.** Keep the current variables under `:root` as the light theme. Add a dark override block. Also set `color-scheme` so form controls and scrollbars switch too.
   ```css
   :root { color-scheme: light; /* existing vars */ }
   :root[data-theme="dark"] { color-scheme: dark; --bg: #121212; --fg: #e6e6e6; /* ... */ }
   ```
2. **Inline script in `index.html` `<head>`**, before the stylesheet and the bundle. A `useEffect` runs after the first paint, so dark-mode users would see a white flash on every load.
   ```html
   <script>
     (function () {
       var t;
       try { t = localStorage.getItem('theme'); } catch (e) {}
       if (t !== 'light' && t !== 'dark') {
         t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
       }
       document.documentElement.dataset.theme = t;
     })();
   </script>
   ```
   The `try` is there because `localStorage` throws when storage is blocked. Without it the page gets no theme at all.
3. **`useTheme` hook or context.** Start the state from `document.documentElement.dataset.theme`, not from `localStorage`, so React matches what the script already applied. The setter updates the attribute and writes to `localStorage`, also inside `try`. Use context only if something besides the toggle needs the theme, such as charts or a code highlighter that take colors as JS values.
4. **Toggle component.** Use a `<button>` with `aria-pressed` or an `aria-label` that names the theme it switches to.
5. **Find colors that bypass the variables.** Search for hex, `rgb(` and named colors in inline styles, CSS-in-JS, SVG `fill`, and third-party component themes. None of these will switch on their own.

## Decisions

- **D1: No saved choice means follow the OS.** Only save a value when the user clicks the toggle. The downside of a two-state toggle is that after one click the user can't go back to following the OS. If that matters, use a light/dark/system control and delete the key when they pick system.
- **D2: SSR.** This plan assumes a client-only app like Vite or CRA. On Next.js or Remix the server can't read `localStorage`, so the toggle icon will cause a hydration mismatch. Use `next-themes` there, or add `suppressHydrationWarning` on `<html>` and render the icon only after mount.

## Test

Reload with dark saved and check for a flash. Clear storage with the OS in dark mode and check the page follows it. Block site storage in the browser and check the page still loads with a theme.
````
