# Replies: tuned

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
A database index is a separate data structure, usually a B-tree, that stores column values in sorted order with pointers to their rows. The database can then find matching rows without reading the whole table.

## What it speeds up
- Lookups on the indexed columns become a tree search instead of a full table scan.
- It helps `WHERE`, `JOIN`, `ORDER BY` and `GROUP BY` on those columns.
- A composite index on `(a, b)` helps queries that filter on `a`, or on both `a` and `b`. It does not help queries that filter on `b` alone.
- If the index holds every column a query needs (a covering index), the database never reads the table at all.

## When it makes performance worse

| Code | Case | Cost |
|---|---|---|
| W1 | Write-heavy tables | Every `INSERT`, `DELETE` and `UPDATE` of an indexed column must also update each index. That means slower writes, more locking and more WAL or replication traffic. |
| W2 | Low selectivity (`status`, `is_active`), or queries that return a large share of the rows | Using the index means a random read for each matching row, which costs more than one sequential scan. The planner usually skips the index, but you still pay W1. |
| W3 | Redundant indexes, such as `(a)` when `(a, b)` exists | Twice the write cost with no read benefit. |
| W4 | Indexes that don't fit in memory | They push table pages out of the buffer pool, so disk I/O goes up for every query, not just the indexed ones. |
| W5 | Random keys, such as UUIDv4 in a B-tree, especially the InnoDB primary key | Inserts land on random pages. That causes page splits, fragmentation, bloat and slow inserts. |
| W6 | The planner picks the wrong index | This happens with stale statistics or `ORDER BY x LIMIT n` combined with a rare filter. The database walks a huge range of the index when a different plan would be much faster. |
| W7 | The query can't use the index | Examples: `WHERE lower(email) = ...` without an expression index, `LIKE '%foo'`, or implicit type casts. You pay full write and storage cost and get nothing back. |
| W8 | Building the index on a large live table | A plain `CREATE INDEX` can block writes for the whole build and adds heavy I/O. Use `CREATE INDEX CONCURRENTLY` (Postgres) or `ONLINE` (MySQL, SQL Server) where available. |
| W9 | Small tables | A scan of a few pages is already cheap, so the index only adds overhead. |

## Risks
- The row-share point where a scan beats an index (W2) depends on the engine, the storage and how the table is physically ordered. There is no fixed percentage, so measure it.
- Dropping an index that looks unused can break a rare but critical query, such as a monthly report or a foreign-key check on delete. Usage stats only cover the time since they were last reset.

Before adding an index, run the target query with `EXPLAIN ANALYZE` on production-sized data, with and without the index.
````

### explain-index on 2

````markdown
A database index is a separate structure, usually a B-tree, that stores column values in sorted order with pointers to their rows. The database can then find matching rows without reading the whole table.

## What it speeds up
- `WHERE` lookups on the indexed columns, such as `WHERE email = ?`
- `JOIN` conditions on those columns
- `ORDER BY` and `GROUP BY` that match the index order
- Queries that need only the indexed columns (covering index). The table itself is never read.

## When it makes performance worse

| Code | Case | Why it hurts |
|---|---|---|
| C1 | Write-heavy tables | Every `INSERT`, `DELETE`, and `UPDATE` of an indexed column must also update each index. In Postgres, indexing a frequently updated column also blocks HOT updates, which increases table bloat. |
| C2 | Low-selectivity columns | For columns like `is_active` or `status`, where one value matches most rows, following the index means random reads for each row. That is slower than one sequential scan. |
| C3 | Stale statistics | The planner may pick the index for C2-style queries because its row estimates are wrong. |
| C4 | Small tables | A full scan fits in a few pages and costs less than walking the index. |
| C5 | Redundant or unused indexes | An index on `(a)` is redundant when `(a, b)` exists. Extra indexes take memory and push hot data out of cache. Unused ones add write cost for nothing. |
| C6 | Random keys in a clustered index | UUIDv4 primary keys in MySQL InnoDB or SQL Server insert at random positions. This causes page splits, fragmentation, and cache misses. |
| C7 | Bulk loads | Maintaining indexes row by row during a large import is much slower than loading first and building the index after. |
| C8 | Plan regressions | A new index can change plans for other queries. A common case is walking an index on the `ORDER BY` column with `LIMIT` while filtering out most rows. |
| C9 | Index the query can't use | Functions on the column (`LOWER(email)`), leading wildcards (`LIKE '%x'`), implicit type casts, or skipping the leading column of a composite index. You pay the write cost with no read benefit. |
| C10 | Replication | Extra write work per row can increase replica lag. |

## Risks when adding one to a live system
- **R1:** Plain `CREATE INDEX` in Postgres blocks writes until the build finishes. `CREATE INDEX CONCURRENTLY` avoids that but runs slower. If it fails, it leaves an `INVALID` index that you must drop by hand.
- **R2:** Building the index takes disk space and I/O, which can slow production traffic during the build.
- **R3:** Plan changes (C8) show up only under production data distribution. Tests on small datasets won't catch them.

## Before adding one
1. Run `EXPLAIN ANALYZE` on the target query before and after, on production-sized data.
2. Check existing indexes for overlap (C5). In Postgres, `pg_stat_user_indexes` with `idx_scan = 0` lists indexes that have never been used.
````

### explain-index on 3

````markdown
A database index is a separate, sorted data structure (usually a B-tree) that maps column values to row locations, so the database can find matching rows without scanning the whole table.

## What it costs

- **Storage:** each index is an extra on-disk structure, often a sizable fraction of the table.
- **Writes:** every `INSERT`, `DELETE`, and `UPDATE` to an indexed column must also update each affected index.
- **Memory:** index pages compete with table pages for the buffer cache.

## When an index makes performance worse

| Code | Case | Why it gets slower |
|---|---|---|
| F1 | Write-heavy tables | Each extra index adds work to every write. Ingest and logging tables suffer most. |
| F2 | Too many or redundant indexes | Write cost multiplies. The planner has more plans to evaluate. Cache fills with index pages. An index on `(a)` is redundant next to `(a, b)`. |
| F3 | Low-selectivity columns (booleans, status flags) | If a value matches a large share of rows, index lookup plus random row fetches is slower than one sequential scan. |
| F4 | Queries returning a large share of the table | Same reason as F3. Past roughly 5 to 20% of rows (varies by engine and disk), a full scan usually wins. |
| F5 | Stale statistics | The planner picks the index expecting few rows, gets many, and runs a slow plan. |
| F6 | Random keys in a clustered index (UUIDv4 primary key in MySQL InnoDB or SQL Server) | Inserts land at random positions, causing page splits, fragmentation, and cache misses. |
| F7 | Indexing frequently updated columns in PostgreSQL | Updates can no longer use HOT (heap-only tuple) updates, so every update writes new index entries and bloats the table. |
| F8 | Very small tables | A scan of a few pages is cheaper than traversing the index. |

## Risks when adding one

- R1: `CREATE INDEX` blocks writes on the table for the whole build in many engines. On PostgreSQL, use `CREATE INDEX CONCURRENTLY`. It takes longer, cannot run inside a transaction, and leaves an `INVALID` index on failure that you must drop manually.
- R2: The planner may not use the index at all, leaving only the write cost. Check that the index is used and faster with `EXPLAIN ANALYZE` on real data volumes, not a small dev dataset.
- R3: Column order in a composite index matters. `(a, b)` does not help queries that filter only on `b`.
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
A process has its own memory space and OS resources, while threads run inside one process and share its memory. Use threads when tasks need shared state and low overhead. Use processes when you need isolation or fault containment.

## Differences

| Aspect | Process | Thread |
|---|---|---|
| Memory | Separate address space | Shares the process's address space |
| Creation and switching cost | Higher | Lower |
| Communication | IPC such as pipes, sockets or shared memory, often with serialization | Direct access to shared variables |
| Crash impact | Only that process dies | The whole process dies, including all its threads |
| Security boundary | Yes, it can run with different privileges | No |
| Memory footprint | Higher per unit | Lower per unit |

## Pick processes when

- **O1:** One component failing must not take down the others, as in worker pools, browser tabs or plugin hosts.
- **O2:** The code is untrusted or needs different permissions.
- **O3:** The work is CPU-bound in a runtime with a global lock, such as CPython (GIL) or Ruby MRI.
- **O4:** You may later spread the work across machines, since the IPC boundary already exists.

## Pick threads when

- **O5:** Tasks read and write the same in-memory data often, and copying it between processes would be too slow.
- **O6:** The work is CPU-bound in a runtime without a global lock, such as Java, C#, Go, Rust or C++.
- **O7:** You need many concurrent units and memory or startup time is tight.

## Pitfalls

- **R1, threads:** Data races and deadlocks. Shared state needs locks or message passing, and these bugs are hard to reproduce.
- **R2, threads:** One segfault or unhandled fatal error kills every thread.
- **R3, processes:** IPC serialization adds latency and CPU cost, which can erase the parallel speedup for small tasks.
- **R4, processes on Windows:** There is no `fork`. Process start uses spawn, which is slow, re-imports modules and requires picklable arguments in Python.
- **R5, Python:** Threads do not speed up CPU-bound pure Python code unless you run the free-threaded build. That build is opt-in, and some C extensions do not support it yet.
- **R6:** Calling `fork` in a process that already has threads can leave locks held forever in the child. Fork before starting threads, or use spawn.
- **R7:** For a large number of I/O-bound tasks, such as thousands of sockets, async I/O usually beats both options on memory and has no race conditions between await points.

Default: in a language without a global lock, use threads (or a thread pool) and switch to processes only when you need isolation. In CPython, use processes for CPU-bound work and threads or async for I/O-bound work.
````

### explain-thread on 2

````markdown
A process has its own memory space. Threads run inside one process and share its memory.

## Differences

| Aspect | Process | Thread |
|---|---|---|
| Memory | Separate address space | Shared heap and globals, own stack |
| Isolation | A crash or memory corruption stays in that process | A crash or corruption can take down every thread in the process |
| Creation cost | Higher (new address space, handles, loader work) | Lower |
| Context switch | Slower (address space change) | Faster |
| Communication | IPC: pipes, sockets, shared memory, message queues | Direct access to shared data, guarded by locks |
| Data bugs | Rare, because sharing is explicit | Data races and deadlocks are common |
| Scaling | Can spread across machines with little redesign | Limited to one machine |
| Security boundary | Yes, can run with different privileges | No |

## Pick processes when
- You need fault isolation, such as plugins, untrusted code, or browser tabs.
- You need a security boundary or different privileges per unit of work.
- The runtime has a global lock that blocks parallel CPU work, such as CPython's GIL (unless you use a free-threaded build) or Node.js's single event loop.
- The workers rarely need to share state.
- You may later spread the work across multiple machines.

## Pick threads when
- Workers share a lot of in-memory state and copying it over IPC would cost too much.
- You need low-latency coordination between tasks.
- You want many concurrent units and process overhead matters. On Windows, creating a process is noticeably more expensive than on Linux.
- The runtime runs threads in parallel, such as Java, C#, C++, Go, or Rust.

## Pitfalls
- **Threads:** shared mutable state needs locks or other synchronization. Missing locks cause races that are hard to reproduce. Too many locks cause deadlocks and contention.
- **Threads:** one unhandled crash or memory corruption kills the whole process.
- **Processes:** IPC adds serialization cost and latency. Large data passed between processes can erase the gain from parallelism.
- **Processes:** each one uses more memory. Many workers can exhaust RAM.
- **Both:** running more CPU-bound workers than you have cores adds switching overhead without any speedup.
- **I/O-bound work:** async I/O (an event loop, async/await) often beats both, because waiting tasks do not need their own thread or process.

## Default
- CPU-bound work in a runtime that runs threads in parallel: a thread pool sized to the core count.
- CPU-bound work in Python or Node.js: a process pool or worker processes.
- Isolation or security needed: processes.
- I/O-bound work: async first, then threads if the libraries you use only block.
````

### explain-thread on 3

````markdown
A process has its own isolated memory space, while threads run inside one process and share its memory. Use processes for isolation and CPU work in runtimes with a global lock. Use threads for low-overhead concurrency over shared state.

## Differences

| Aspect | Process | Thread |
|---|---|---|
| Memory | Separate address space | Shares the process's heap and globals, has its own stack |
| Crash impact | A crash stays in that process | A crash usually kills the whole process |
| Creation and switch cost | Higher | Lower |
| Communication | IPC: pipes, sockets, shared memory, message queues | Direct access to shared variables |
| Data safety | Nothing shared unless you share it on purpose | Every shared write needs synchronization |
| Security boundary | Yes, OS-enforced | No |
| Scaling | Can spread across machines | Limited to one machine |

## When to pick which

- **O1 Processes**
  - You need fault isolation, such as browser tabs, worker pools running untrusted or crash-prone code, or plugins.
  - You need privilege separation, where one component should not be able to read another's memory.
  - You have CPU-bound work in CPython (before free-threaded builds), Ruby MRI or Node, where a global lock or single-threaded event loop blocks thread parallelism.
  - Workers have little shared state, or you may later spread them across machines.
- **O2 Threads**
  - Tasks share large in-memory state that would be expensive to copy or serialize.
  - You have CPU-bound parallel work in runtimes with real multi-threading, such as C, C++, Rust, Go, Java or .NET.
  - You need low latency between tasks, such as a UI thread plus background workers.
- **O3 Async or event loop (neither)**
  - The work is mostly I/O waits with many connections, such as network servers. It costs less memory than one thread per connection.
  - It can be combined with O1, such as one event loop per process per core.

## Risks

- **R1 Threads:** race conditions, deadlocks and memory corruption. These bugs are nondeterministic and hard to reproduce. Keep shared mutable state minimal and use proven concurrency primitives.
- **R2 Threads:** one bad thread, such as a segfault or an unhandled panic in some runtimes, takes down all the others.
- **R3 Processes:** IPC serialization costs can cancel out the parallel speedup when tasks are small or pass large data.
- **R4 Processes:** higher memory use per worker. Copy-on-write after `fork` helps, but refcounting runtimes like CPython touch pages and cause them to be copied anyway.
- **R5 Processes:** calling `fork` in a process that already has threads copies only the calling thread. Locks held by other threads stay locked forever. Use `spawn` or fork before creating threads.
- **R6 Windows:** creating a process costs much more than on Linux, and there is no `fork`. Pools that start processes often do badly there.

Default: start with threads (or async for I/O) in a runtime with real parallelism. Switch to processes when you need isolation or the runtime blocks parallel threads.
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
`forEach` ignores the promise each `async` callback returns, so `saveAll` never waits for the writes and logs "saved" right away.

- Each callback pauses at its own `await`, but `forEach` has already moved on and returned.
- `await` inside the callback only pauses that callback, never `saveAll`.

## Fix

Run the writes in parallel and wait for all of them:

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

Or write one file at a time:

```js
async function saveAll(items) {
  for (const item of items) {
    await fs.promises.writeFile(`out/${item.id}.json`, JSON.stringify(item));
  }
  console.log("saved");
}
```

## Risks

- **Current code:** a failed write becomes an unhandled rejection. `saveAll` still resolves, and callers never see the error. On Node 15 and later this crashes the process by default.
- **`Promise.all`:** it rejects on the first failure, but the other writes keep going. You can end up with some files written. Use `Promise.allSettled` if you need to know which writes failed.
- **`Promise.all` with large arrays:** it opens every file at once and can fail with `EMFILE`. Use the `for...of` version or cap how many writes run at once.
- **`for...of`:** it is slower for many items, and it stops at the first failure, so the remaining items are not written.
- **Both versions:** `writeFile` fails if `out/` does not exist.
````

### debug-foreach on 2

````markdown
`forEach` ignores the promises your async callbacks return, so `saveAll` never waits for the writes and logs right away.

- Each callback runs until its first `await`, hands a promise back to `forEach`, and `forEach` throws it away.
- `console.log("saved")` runs as soon as the loop finishes starting the writes, before any of them complete.
- A caller doing `await saveAll(items)` also resumes before the files exist.

## Fix

Run all writes in parallel and wait for every one:

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

If you need one write at a time, use `for...of`:

```js
for (const item of items) {
  await fs.promises.writeFile(`out/${item.id}.json`, JSON.stringify(item));
}
```

## Risks

- **Errors today:** a failed write in the current code becomes an unhandled promise rejection. In Node 15 and later that crashes the process by default, and `saveAll` never sees the error.
- **`Promise.all` failures:** it rejects on the first failed write while the other writes keep running, so some files may be written and others not. Use `Promise.allSettled` if you need a result for every file.
- **Large arrays:** `Promise.all` opens a file handle for every item at once, which can fail with `EMFILE` (too many open files). Use `for...of` or limit how many writes run at once.
- **`for...of` downside:** total time grows with the number of items.
- **Duplicate `item.id` values:** writes to the same file run at the same time in the parallel version, and you can't predict which one ends up in the file.
````

### debug-foreach on 3

````markdown
`forEach` ignores the promise your async callback returns, so `saveAll` never waits for the writes.

## Why
- `forEach` calls the callback for each item, throws away the returned promises, and returns right away.
- `console.log("saved")` runs as soon as all writes have started, not when they finish.
- `saveAll`'s own promise also resolves early, so any caller that awaits it continues before the files exist.

## Fix
Run the writes in parallel and wait for all of them:

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

Or write one file at a time:

```js
async function saveAll(items) {
  for (const item of items) {
    await fs.promises.writeFile(`out/${item.id}.json`, JSON.stringify(item));
  }
  console.log("saved");
}
```

## Risks
- **Errors in the current code:** a failed write becomes an unhandled rejection. `saveAll` never sees it, and Node 15 and later crashes the process by default.
- **`Promise.all` with many items:** every file is open at once, which can fail with `EMFILE`. To avoid that, write in batches or use a limiter like `p-limit`.
- **`Promise.all` on failure:** it rejects on the first error, but the other writes keep going. You can end up with some files written and no clear record of which ones.
- **`for...of`:** it's safe but slower, since each write waits for the one before it.
- **`out/` directory:** the writes fail with `ENOENT` if it doesn't exist. Create it first with `fs.promises.mkdir("out", { recursive: true })`.
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
The default `tags=[]` is created once, when the function is defined, and every call without a `tags` argument reuses and changes that same list.

## Fix

```python
def add_tag(tag, tags=None):
    if tags is None:
        tags = []
    tags.append(tag)
    return tags
```

## Pitfalls

- If the caller passes a list, the function still changes that list in place. If callers shouldn't see their list change, copy it first: `tags = [] if tags is None else list(tags)`.
- Use `is None`, not `if not tags`. With `if not tags`, an empty list the caller passes in gets replaced with a new one, so their list never receives the tag.
- The same bug happens with any mutable default, such as `{}`, `set()` or a class instance. Linters flag it: Ruff `B006` and Pylint `W0102`.
````

### debug-default-arg on 2

````markdown
The default list is created once, when the function is defined, so every call without `tags` appends to the same list.

## Fix

```python
def add_tag(tag, tags=None):
    if tags is None:
        tags = []
    tags.append(tag)
    return tags
```

## Pitfalls
- **Your list gets changed:** if you pass in your own list, `add_tag` still appends to that list and returns it. If callers shouldn't see that change, copy it first with `tags = list(tags)`.
- **Don't use `tags = tags or []`:** it also swaps a passed-in empty list for a new one, so the caller's list stays empty while they may expect it to fill up.
- **Same bug with other types:** any mutable default (`{}`, `set()`, objects) behaves this way. Use `None` for those too.
````

### debug-default-arg on 3

````markdown
The default list `[]` is created once, when the function is defined, and every call that omits `tags` reuses and appends to that same list.

## Fix

Use `None` as the default and create a new list inside the function:

```python
def add_tag(tag, tags=None):
    if tags is None:
        tags = []
    tags.append(tag)
    return tags
```

## Pitfalls
- **Caller's list is still changed:** if a caller passes their own list, `append` changes it in place. If callers shouldn't see that change, copy it first with `tags = list(tags)`.
- **Use `is None`, not `if not tags`:** `if not tags` also swaps a caller's empty list for a new one. Their list then never gets the tag.
- **Other mutable defaults break the same way:** `{}`, `set()` and custom objects used as defaults are also shared across calls. Linters flag these, for example Ruff/flake8-bugbear rule B006.
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
`service nginx start` starts nginx as a background daemon and then returns. The container's main process (PID 1) exits, so the container stops.

## Why
- A container lives only as long as its PID 1 process.
- `service` runs the init script, which forks nginx into the background and exits with code 0.
- `ubuntu:24.04` has no init system running, so nothing keeps the container alive.

## Fix
Run nginx in the foreground as PID 1:

```dockerfile
CMD ["nginx", "-g", "daemon off;"]
```

- Use the exec form (JSON array) so nginx is PID 1 and gets `SIGTERM` from `docker stop`. With the shell form, `/bin/sh` is PID 1 and may not pass the signal on, so `docker stop` waits 10 seconds and then kills nginx.
- Logs: the Ubuntu nginx package writes to `/var/log/nginx/*.log`, so `docker logs` will show nothing. To send logs to Docker, add `RUN ln -sf /dev/stdout /var/log/nginx/access.log && ln -sf /dev/stderr /var/log/nginx/error.log`.

## Avoid these workarounds
- `CMD service nginx start && tail -f /dev/null`: the container stays up even if nginx crashes, so restart policies and health status won't catch the failure. Signals also don't reach nginx.
- Installing systemd in the container: adds complexity and needs extra privileges.

## Check
- `docker logs <container>` shows why a container exited. An empty log with exit code 0 (`docker ps -a`) fits this cause.
- Not verified against your full Dockerfile. If the container still exits after the fix, run `docker run --rm myimage nginx -t` to test the config.
````

### debug-docker on 2

````markdown
Your `CMD` starts nginx in the background and then exits. The container stops as soon as its main process exits.

## Cause
- `service nginx start` runs nginx as a background daemon and returns right away.
- The shell running `CMD` is the container's main process (PID 1). When it exits with code 0, Docker stops the container, even though nginx was running.

## Fix
Run nginx in the foreground as the main process:

```dockerfile
CMD ["nginx", "-g", "daemon off;"]
```

- Use the JSON array form shown above. Then nginx itself is PID 1 and gets `docker stop`'s SIGTERM. The plain string form wraps nginx in `/bin/sh -c`, and shutdown can wait the full 10 second timeout before Docker kills it.
- `EXPOSE 80` does not publish the port. Run with `docker run -d -p 8080:80 myimage`.

## Pitfalls
- **`CMD service nginx start && tail -f /dev/null`**: avoid it. The container keeps running after nginx crashes, so Docker restart policies never fire.
- **Logs**: the Ubuntu nginx package writes to `/var/log/nginx/*.log`, so `docker logs` will be empty. Add this to send logs there:
  ```dockerfile
  RUN ln -sf /dev/stdout /var/log/nginx/access.log && ln -sf /dev/stderr /var/log/nginx/error.log
  ```
- **Base image**: if you only need nginx, `FROM nginx:stable` already has the foreground command and log setup. You lose Ubuntu's packages and file layout.

## Check
- `docker ps -a` should show your old container as `Exited (0)`. That confirms the daemon cause.
- A non-zero exit code means nginx failed to start. Run `docker logs <container>` to see why. A common reason is a config error, which `nginx -t` inside the image will show.
````

### debug-docker on 3

````markdown
The container exits because `service nginx start` starts nginx in the background and then exits. The container lives only as long as its main process (PID 1), so when `service` exits, the container stops.

## Fix

Run nginx in the foreground as the main process:

```dockerfile
CMD ["nginx", "-g", "daemon off;"]
```

- **Why the exec form (JSON array):** nginx becomes PID 1 and receives the SIGTERM from `docker stop`. With the shell form (`CMD nginx -g ...`), `/bin/sh` is PID 1. Depending on the shell, the signal may never reach nginx, and Docker force-kills the container after 10 seconds.
- **Check it:** run `docker run -d -p 8080:80 myimage`, then `docker ps` should show the container running.

## Pitfalls

- **Empty `docker logs`:** Ubuntu's nginx package writes to `/var/log/nginx/`, not stdout. To see logs with `docker logs`, add this to the Dockerfile:
  ```dockerfile
  RUN ln -sf /dev/stdout /var/log/nginx/access.log && ln -sf /dev/stderr /var/log/nginx/error.log
  ```
- **Avoid `service nginx start && tail -f /dev/null`:** the container stays up, but it keeps running if nginx crashes, and `docker stop` does not shut nginx down cleanly.
- **Config errors also cause an exit:** if the container still exits after the fix, run `docker logs <container>`. A bad config makes nginx exit at startup. You can test the config with `docker run --rm myimage nginx -t`.
- **Simpler base image:** unless you need Ubuntu for something else, `FROM nginx` already runs in the foreground and sends logs to stdout.
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

## Why
- Users, orders and invoices are relational data. Orders belong to users and invoices point to orders, so foreign keys and joins fit directly.
- Invoices need ACID transactions. Creating an order, reserving stock and issuing an invoice should all succeed or all fail together. PostgreSQL does this by default. MongoDB supports multi-document transactions, but they are harder to use and not how its data model is meant to work.
- Constraints protect money data. `NOT NULL`, `UNIQUE`, `CHECK (amount >= 0)` and foreign keys stop bad rows before they are saved. In MongoDB those checks live mostly in your application code.
- Reporting is easier. Revenue by month or unpaid invoices per customer are plain SQL queries.
- You still get flexible fields. A `jsonb` column can hold loosely structured data like order metadata without a second database.

## When MongoDB would be the better choice
- Most of your data is documents with no fixed shape, you rarely query across collections, and you need built-in horizontal sharding from day one. Nothing in users, orders and invoices suggests that.

## Risks
- **R1:** Schema changes need migrations. Use a migration tool such as Prisma Migrate, Flyway, Alembic or Drizzle from the start.
- **R2:** Store money as `numeric` or as integer cents, never `float`, or rounding errors will appear on invoices.
- **R3:** Never update or delete an issued invoice in place. Keep line items and totals as they were at issue time instead of recalculating from current product prices. This applies to any database.
- **R4:** Scaling writes past one PostgreSQL server takes more work than in MongoDB, for example read replicas, partitioning or Citus. Most web apps never reach that point.
````

### compare-db on 2

````markdown
**Use PostgreSQL.**

## Why
- **Relational data:** Users have orders, and orders have invoices. Foreign keys and joins handle that directly. In MongoDB you either embed documents or join by hand in application code.
- **Money needs transactions:** Creating an order, its invoice and a stock or balance change should succeed or fail together. PostgreSQL has had full ACID transactions for decades. MongoDB supports multi-document transactions, but they are an add-on with more limits and more ways to get them wrong.
- **Constraints protect data:** `NOT NULL`, `UNIQUE`, `CHECK (amount >= 0)` and foreign keys stop bad invoice data from being written at all. In MongoDB, schema validation is optional and weaker, so bad data gets caught later, if at all.
- **Reporting:** Revenue by month, unpaid invoices per customer and similar queries are plain SQL. MongoDB aggregation pipelines can do this but are harder to write and maintain.
- **Flexible fields still work:** `JSONB` columns cover the parts that change shape, such as order metadata or line-item attributes.

## When MongoDB would be the better choice
- Most data has no fixed shape and is read as whole documents, such as CMS content or event payloads.
- You need write throughput spread across many servers from day one. Most new apps don't.

## Risks
- **Schema changes need migrations:** Pick a migration tool at the start, such as Prisma Migrate, Alembic, Flyway or Rails migrations. Run migrations on large tables carefully in production, because some `ALTER TABLE` operations lock the table.
- **Store money as `NUMERIC(12,2)` or integer cents, never `FLOAT`:** Floats cause rounding errors. This applies to both databases.
- **Invoices must not change after they are issued:** Save the prices, tax and addresses on the invoice row itself instead of referencing live user or product rows. Otherwise, editing a product or address silently changes past invoices.
````

### compare-db on 3

````markdown
Use PostgreSQL.

## Why
- **Relational data:** users own orders and orders produce invoices. Foreign keys enforce those links, and MongoDB does not.
- **Transactions:** creating an order and its invoice together needs ACID guarantees. Postgres has them by default. MongoDB supports multi-document transactions, but they add overhead and are easy to forget.
- **Money:** `NUMERIC` stores exact amounts. `CHECK` and `UNIQUE` constraints block bad data such as negative totals or duplicate invoice numbers at the database level.
- **Reporting:** revenue per user, unpaid invoices and similar queries are simple SQL joins and aggregates.
- **Flexible fields:** `JSONB` columns cover the schemaless cases, such as order metadata, so you don't give anything up there.

## When MongoDB would fit instead
- Your data is mostly separate documents that are rarely joined, or the schema changes too often to model.
- Neither is true for users, orders and invoices.

## Risks
- **Invoices must not change:** store a copy of prices, tax and addresses on each invoice row. Don't join to current product or user data, or old invoices will change when that data changes. This applies to either database.
- **Schema changes:** Postgres needs migrations. Use a tool such as Prisma, Drizzle, Flyway or Alembic from day one.
- **Assumption:** this recommendation assumes normal web app scale. It holds up to tens of millions of rows on one instance with proper indexes.

The Canva, Gmail, Google Calendar and Google Drive connectors need authorization in your claude.ai connector settings before they can be used.
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
**Use REST (HTTP/JSON with an OpenAPI spec) unless you have a specific reason listed below to use gRPC.**

## Why REST fits a team of five
- Nothing extra to run: kube-proxy, Ingress, curl, logs and your existing HTTP middleware all work with it already.
- It's easier to debug. Payloads are readable and you can replay calls with curl.
- One protocol covers both internal and external traffic, so you maintain one set of auth, retry and observability code.
- Most languages and new hires already know it.

## Switch to gRPC if any of these apply
| Condition | Why gRPC wins |
|---|---|
| Services are written in several languages and contracts keep drifting | `.proto` codegen gives typed clients, and breaking changes show up at build time |
| You need streaming, either server push or bidirectional | It's built into the protocol |
| Measured latency or CPU from JSON serialization is a real bottleneck | Protobuf with HTTP/2 multiplexing is smaller and faster |
| Services make many small, chatty calls | Connection reuse cuts overhead |

## Risks
- **R1, gRPC load balancing on Kubernetes:** gRPC keeps long-lived HTTP/2 connections, so a normal ClusterIP Service sends all requests from one client pod to a single backend pod. The fix is client-side load balancing with a headless Service, or a mesh like Linkerd or Istio. Both add work, and a mesh adds something else that can break.
- **R2, REST contract drift:** REST has no enforced schema, so field changes break callers at runtime. Keep an OpenAPI spec, generate clients from it, and check the spec in CI.
- **R3, gRPC tooling:** debugging needs grpcurl, browsers can't call gRPC without grpc-web or a gateway, and some APM tools show less detail for gRPC.
- **R4, mixing both:** running REST and gRPC side by side doubles the auth, retry, timeout and tracing setup. Choose one for internal calls.

## Assumptions
- **A1:** Your internal calls are request/response with moderate traffic and no streaming.
- **A2:** Most services are in one or two languages.

If A1 or A2 is wrong, use gRPC and plan for R1 from the start.
````

### compare-rpc on 2

````markdown
**Use REST (HTTP/JSON with an OpenAPI spec) unless one of the gRPC triggers below applies.**

## Why REST fits your setup
- **Team size:** gRPC adds protoc, code generation in every build, and proto versioning. That is a lot of extra tooling for five people.
- **Debugging:** You can use curl and read logs directly. gRPC needs grpcurl or server reflection.
- **Kubernetes:** HTTP/1.1 works with Services, Ingress, and meshes without extra config.
- **Speed:** With eight services, JSON is rarely the bottleneck. Profile before assuming it is.

## Switch to gRPC if any of these apply
- You need streaming in either direction or both.
- Profiling shows that serialization or payload size is slowing a hot path.
- You make many calls with tight p99 latency targets.
- Your services use several languages and you want strict typed clients. OpenAPI code generation also does this, but less strictly.

## Risks
- **R1 gRPC load balancing:** gRPC keeps long-lived HTTP/2 connections open. Behind a normal ClusterIP Service, each client stays on one pod. You need a headless Service with client-side balancing, or a mesh such as Linkerd or Istio. Teams often miss this until one pod runs hot.
- **R2 REST drift:** Without an enforced schema, APIs drift silently. Require OpenAPI specs plus generated clients or contract tests. Otherwise you lose the main benefit gRPC would give you.
- **R3 Mixing both:** Running both doubles your auth middleware, observability setup, and tooling. Pick one default and allow exceptions only with a written reason.
- **R4 Proxies:** gRPC needs HTTP/2 end to end. Some load balancers and L7 proxies need specific config for it.
- **R5 Browsers:** Browsers cannot call gRPC directly. You would need gRPC-Web or a gateway. This only matters if a service is also public-facing.

## Assumption
- **A1:** Your calls are mostly request/response, not streaming or high-throughput pipelines. If that's wrong, this recommendation changes.

Next: write an OpenAPI spec for the service that has the most callers.
````

### compare-rpc on 3

````markdown
Use REST (HTTP/JSON) with OpenAPI specs, unless one of the gRPC triggers below applies to you.

## Why REST fits a team of five
- Ops cost is lower. curl, browser devtools, logs and every ingress and proxy handle it with no extra setup.
- Eight services is a small call graph. gRPC's speed gains rarely matter at that size.
- There is less for five people to maintain: no `.proto` repo, no codegen step in each service's build, no versioning rules for protobuf.

## Switch to gRPC if any of these are true
| Code | Trigger |
|---|---|
| O1 | Calls are chatty or latency-sensitive, such as thousands of requests per second or fan-out inside one user request |
| O2 | You need streaming, whether server, client or both ways |
| O3 | Services use several languages and you want one strict contract with generated clients |
| O4 | Contract drift between services already breaks things in production |

## Risks if you choose gRPC
- **R1** Kubernetes load balancing breaks by default. A regular `ClusterIP` Service balances per connection, and gRPC keeps one long-lived HTTP/2 connection open, so one pod gets all the traffic. You need a headless Service with client-side balancing, or a mesh like Linkerd or Istio. A mesh adds more ops load.
- **R2** Debugging is harder. You need `grpcurl` and server reflection, and payloads in logs are binary unless you add interceptors.
- **R3** Browsers can't call gRPC directly. Any service that has to be reachable from a browser needs grpc-web or a REST gateway.
- **R4** Changing a schema carelessly, such as reusing or renumbering a field number, corrupts data without any error. Add `buf breaking` to CI.

## Risks if you choose REST
- **R5** Nothing enforces the contract. Without OpenAPI specs and generated clients, services drift apart and fail at runtime.
- **R6** Retries and timeouts have no standard. Set them in each client or in a shared library, or one slow service can take down the services that call it.

## Assumption
- **A1** I assumed none of O1 to O4 applies today. If one applies to only a few service pairs, use gRPC for those pairs and REST everywhere else. The cost is keeping two stacks.
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
Adds retry with exponential backoff to `request()` and raises the per-attempt timeout from 10s to 30s.

## Behavior changes
- New third parameter `retries`, default `3`, so up to 4 attempts.
- Retries on HTTP 5xx and on any thrown error, including network failures and timeouts.
- Backoff is 500ms, 1000ms, 2000ms between attempts.
- The signature change is backward compatible for existing two-argument callers.

## Risks
- **R1** 4xx responses are retried. The `HTTP ${res.status}` error is thrown inside `try`, so the `catch` retries it. This contradicts the explicit 5xx check and wastes 3 attempts on 400/401/404.
- **R2** Non-idempotent requests (POST, PATCH) are retried after 5xx or timeouts, which can duplicate writes if the server processed the first attempt.
- **R3** Worst-case latency grows from 10s to about 123.5s (4 × 30s plus 3.5s of backoff). Callers with their own deadlines or UI spinners may be affected.
- **R4** A caller-supplied `options.signal` is still overwritten by the timeout signal. This existed before, but callers now cannot cancel a call that may run for 2 minutes.
- **R5** `return res.json()` is not awaited, so JSON parse failures bypass the `catch` and are not retried. Probably fine, but inconsistent with retrying everything else.
- **R6** The body of a 5xx response is not consumed before retrying, which can hold the connection open in Node's `fetch`.
- **R7** No jitter and no `Retry-After` handling, so many clients retry in lockstep against a struggling server.

## Missing
- No tests in the diff for retry count, backoff timing, 4xx handling, or final error propagation.
````

### summarize-retry on 2

````markdown
`request()` in `src/http.js` now retries failed requests up to 3 times with exponential backoff, and the per-attempt timeout goes from 10s to 30s.

## Behavior changes
- **Signature:** adds an optional third parameter, `retries = 3`. Existing callers still work.
- **Attempts:** up to 4 in total, one initial call plus 3 retries.
- **Backoff:** waits 500ms, then 1000ms, then 2000ms. There is no jitter.
- **Retried:** 5xx responses, network errors and timeouts.
- **Worst case:** about 123.5s before the error reaches the caller (4 × 30s plus 3.5s of waiting). Before this change it was 10s.

## Risks
- **R1: 4xx responses are also retried.** The `HTTP ${res.status}` error is thrown inside the `try`, so the `catch` retries it. A 404 or 401 takes 4 calls and 3.5s before it fails. This is probably not intended.
- **R2: Writes can happen twice.** Retries apply to every method. A POST that timed out or returned 5xx may already have been processed on the server.
- **R3: Callers can't cancel.** `signal` still overwrites any `options.signal` the caller passes. That was already true, but with retries a cancel is now ignored for up to about 2 minutes, and `sleep` can't be interrupted either.
- **R4: Timeout errors are uneven.** A failed request times out after 30s, then another 30s on each retry, where it used to fail at 10s. Callers or upstream timeouts set around 10s may now time out first.
- **R5: Stream bodies can't be resent.** If `options.body` is a `ReadableStream`, the first attempt uses it up and every retry fails.
- **R6: 429 and `Retry-After` are ignored.** 429 is treated like any other 4xx, and 5xx retries don't read `Retry-After`. Retrying without jitter can pile load onto a server that is already struggling.
- **R7: Unread 5xx responses.** The response body is never read before a retry. This may keep connections open until garbage collection runs.
- **R8: JSON parse errors aren't retried.** `return res.json()` is not awaited inside the `try`, so a bad body goes straight to the caller. That is probably fine, but it doesn't match how other errors are handled.

## Missing
- The diff has no tests for retry count, backoff timing, retries stopping at the limit, or 4xx handling.

Fixing R1 and R2 before merge is the main request. Option 1: only retry network errors and 5xx. Option 2: only retry idempotent methods, or let callers opt in.
````

### summarize-retry on 3

````markdown
`request()` in `src/http.js` now retries failed requests with exponential backoff, and the per-attempt timeout goes from 10s to 30s.

## Behavior change
- New optional third parameter `retries`, default 3, so up to 4 attempts total.
- Backoff between attempts is 500ms, 1s, then 2s.
- 5xx responses are retried. So are fetch failures, including network errors and timeouts.
- After the last attempt, the last error is thrown, same as before.

## Risks
- **R1** 4xx responses are retried too. The `HTTP ${res.status}` error is thrown inside the `try`, so the `catch` retries it. A 400, 401 or 404 now takes about 3.5s to fail instead of failing at once. This is probably not what was intended.
- **R2** Every HTTP method is retried, including POST and PATCH. If a request timed out or got a 5xx after the server already applied it, the retry repeats it, which can create duplicate writes or charges.
- **R3** Worst-case time to fail goes from 10s to about 123.5s (4 × 30s plus 3.5s of backoff). Callers with their own deadlines or UI spinners will be affected.
- **R4** Any `options.signal` from the caller is still overwritten, so callers can't cancel. The `sleep` calls can't be cancelled either. This existed before, but it matters more now that a call can last 2 minutes.
- **R5** Stream request bodies (`ReadableStream`) can only be sent once. Retries of those requests will fail.
- **R6** A 5xx response body is never read before the retry. In Node, that can keep the connection open until garbage collection.
- **R7** There's no jitter, so many clients that fail together will retry at the same moments. `Retry-After` headers on 429 and 503 are ignored.
- **R8** `return res.json()` has no `await`, so JSON parse errors skip the `catch` and aren't retried. That's fine, but it's inconsistent with the other errors.

## Missing
- The diff has no tests. Nothing covers retry count, backoff timing, 4xx handling or the final error being thrown.

## Suggested fixes
- Throw 4xx errors without retrying (R1).
- Retry only idempotent methods by default (R2).
- Use the caller's signal together with the timeout, via `AbortSignal.any` (R4).
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
The plan uses a single-use random token that expires. The database stores only its SHA-256 hash. The token is emailed as a link and redeemed in one transaction that also sets the new password.

## Assumptions
- **A1** `users` has `id`, a unique `email` and `password_hash`. I didn't see your code, so check the column names.
- **A2** The app already hashes passwords with bcrypt or argon2. Reset uses the same function.
- **A3** Sessions or refresh tokens are stored somewhere the app can revoke them.
- **A4** No email sending is set up yet.

## Schema
```sql
CREATE TABLE password_reset_tokens (
  id          bigserial PRIMARY KEY,
  user_id     bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  bytea NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON password_reset_tokens (user_id);
```
- Store only `sha256(token)`. If the database leaks, stored hashes can't be used to reset accounts.
- Use an unsalted SHA-256, not bcrypt. The token is 32 random bytes, so salting adds nothing, and a plain hash allows direct lookup by `token_hash`.

## Endpoints

### AC1 `POST /auth/password-reset/request` `{ email }`
1. Rate limit per IP and per email address, for example 5 per hour.
2. Normalize the email with trim and lowercase. Look it up case-insensitively with `lower(email)` or `citext`.
3. If the user exists:
   - delete their unused tokens
   - create a token with `crypto.randomBytes(32).toString('base64url')`
   - insert its hash with `expires_at = now() + interval '30 minutes'`
   - queue the email
4. Always return `202` with the same body, whether or not the user exists.

### AC2 `POST /auth/password-reset/confirm` `{ token, newPassword }`
1. Rate limit per IP.
2. Check `newPassword` against the existing password policy.
3. In one transaction:
   - `SELECT ... WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now() FOR UPDATE`
   - if no row matches, return `400 invalid or expired token`
   - update `users.password_hash`
   - set `used_at = now()`
   - delete the user's other tokens
   - revoke all of the user's sessions and refresh tokens
4. After commit, send a "your password was changed" email.
5. Don't log the user in automatically. They sign in with the new password.

### AC3 Reset page
- The emailed link is `${APP_URL}/reset-password?token=...` and opens a form that POSTs to AC2.
- The page sends `Referrer-Policy: no-referrer` and loads no third-party scripts, so the token doesn't leak to other sites.

## Email
- **AC4** Send through Nodemailer over SMTP, or a provider SDK (Postmark, SES, Resend). Config comes from env vars: `SMTP_URL` or `API_KEY`, `MAIL_FROM` and `APP_URL`.
- **AC5** Send outside the request, from a job queue or at least without awaiting the send. Otherwise response time shows whether the email exists.
- Set up SPF, DKIM and DMARC on the sending domain, or reset emails will land in spam.

## Risks
- **R1** Building the link from `req.headers.host` lets an attacker send real users a link to the attacker's domain and capture the token. Use only `APP_URL`.
- **R2** Different status codes, messages or timing between existing and missing emails reveal which accounts exist.
- **R3** If request logging, APM or a proxy records query strings, the token ends up in logs. Strip `token` from logged URLs.
- **R4** Without `FOR UPDATE` or an atomic `UPDATE ... WHERE used_at IS NULL RETURNING`, two simultaneous requests can both redeem the same token.
- **R5** If sessions aren't revoked, an attacker who is already logged in stays logged in after the reset.
- **R6** If `users.email` isn't unique case-insensitively, `Foo@x.com` and `foo@x.com` can be two different rows. Check the data before switching to `lower()` lookups.
- **R7** Without per-email rate limiting, anyone can flood a user's inbox or run up your email bill.
- **R8** Expired rows pile up. Add a daily `DELETE ... WHERE expires_at < now() - interval '1 day'`.

## Decisions
- **D1** Email provider. I recommend a transactional provider (Postmark or SES) over raw SMTP for deliverability.
- **D2** Token lifetime. I recommend 30 minutes.
- **D3** Revoke all sessions on reset. I recommend yes.
- **D4** Log in automatically after reset. I recommend no, because anyone holding the link would get a session.

## Tests to add
- An unknown email gets the same response as a known one, and no email is sent.
- Expired, used and wrong tokens are all rejected.
- Two simultaneous confirms with one token: exactly one succeeds.
- After a reset, the old password and old sessions no longer work.
- The link host always comes from `APP_URL`, even with a spoofed `Host` header.
- Rate limits return 429.

Your Gmail, Google Drive, Google Calendar and Canva connectors need authorization in claude.ai connector settings before I can use them. This plan doesn't need them.
````

### plan-reset on 2

````markdown
Use a single-use random token, store only its SHA-256 hash in a new Postgres table, email a link containing the raw token, and set the new password in one transaction that also revokes existing sessions.

## Assumptions
- **A1** `users` has a unique `email` column and a `password_hash` column hashed with bcrypt or argon2.
- **A2** Auth uses sessions or refresh tokens stored somewhere you can revoke.
- **A3** No email provider is wired up yet.
- **A4** Nothing here was checked against a real codebase. The working directory has no app code.

## Schema
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
- Match `users.id`'s type. Use `uuid` if that is what `users.id` is.
- Store only the hash, so a leaked database cannot be used to reset passwords.

## Steps
1. **AC1 Migration:** create the table above.
2. **AC2 Mailer:** add `src/services/mailer.js` using nodemailer or the provider's SDK. Put credentials in env vars.
3. **AC3 `POST /auth/password-reset/request`** with body `{ email }`:
   - Normalize the email (trim, lowercase) and look up the user.
   - If the user exists, delete their unused tokens, then generate `crypto.randomBytes(32).toString('base64url')`.
   - Insert `sha256(token)` with `expires_at = now() + 30 min`.
   - Build the link from a configured `APP_URL`, never from `req.headers.host`.
   - Send the email without awaiting it in the request path, or through a job queue.
   - Always return the same `202` response, whether or not the user exists.
4. **AC4 `POST /auth/password-reset/confirm`** with body `{ token, password }`:
   - Validate the password with your existing signup rules.
   - In one transaction, run `SELECT ... WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now() FOR UPDATE`.
   - If no row matches, return `400` with a generic "invalid or expired link" message.
   - Update `users.password_hash`, set `used_at = now()`, and delete the user's other tokens.
   - Revoke all of the user's sessions and refresh tokens.
   - After commit, send a "your password was changed" email.
5. **AC5 Rate limiting** with `express-rate-limit` on both routes, per IP and per email on `/request`.
6. **AC6 Frontend page** at `/reset-password?token=...` that posts to `/confirm`. Set `Referrer-Policy: no-referrer` on it.
7. **AC7 Cleanup:** a scheduled `DELETE FROM password_reset_tokens WHERE expires_at < now() - interval '1 day'`.

## Risks
- **R1 User enumeration:** different responses or timing on `/request` reveal which emails are registered. Sending the email in the background also evens out the timing.
- **R2 Token leakage:** tokens in URLs end up in access logs, proxy logs and analytics. Strip query strings from request logging on the reset page.
- **R3 Host header injection:** a link built from the request host lets an attacker send victims links to the attacker's domain.
- **R4 Sessions left alive:** if sessions are not revoked, an attacker who already has one stays logged in after the reset.
- **R5 Race on double submit:** without `FOR UPDATE` or an atomic `UPDATE ... WHERE used_at IS NULL RETURNING`, one token can be used twice.
- **R6 Email case mismatch:** if `users.email` was stored with mixed case, lowercase lookups miss accounts. Check existing data before relying on `lower(email)`.
- **R7 SSO-only or unverified accounts:** a reset can quietly add a password login to accounts that never had one. Decide whether to block these.
- **R8 Email abuse:** without per-email limits, `/request` can be used to flood someone's inbox and run up provider costs.
- **R9 Deliverability:** reset emails land in spam unless SPF, DKIM and DMARC are set for the sending domain.

## Decisions
- **D1 Email provider:** Postmark, SES or SendGrid. I recommend Postmark or SES because both are cheap and reliable for transactional email.
- **D2 Token lifetime:** I recommend 30 minutes. Longer lifetimes leave a leaked link usable for more time.
- **D3 Log the user in after reset:** I recommend no. It turns a leaked token straight into a live session.
- **D4 Revoke all sessions:** I recommend yes. The downside is that the user is signed out on every device.

## Tests
- Unknown and known emails return an identical response.
- Expired, used and made-up tokens are rejected.
- A token works exactly once, including when two requests arrive at the same time.
- Old password fails and new password works after reset.
- Existing sessions are rejected after reset.
- Rate limits return `429`.
- The emailed link uses `APP_URL` even when a forged `Host` header is sent.
````

### plan-reset on 3

````markdown
# Password reset by email: implementation plan

Store a hashed, single-use, short-lived token in a new Postgres table. Add two endpoints, one to request a reset and one to confirm it, and send the link through a transactional mail provider.

I haven't seen your code. This plan rests on the assumptions below.

## Assumptions
- **A1** `users` has `id`, a unique `email` and `password_hash`.
- **A2** Passwords are already hashed with bcrypt or argon2. The reset reuses that same function.
- **A3** No mail provider is set up yet.
- **A4** A separate frontend page (or a server-rendered page) shows the "new password" form.

## Decisions
- **D1** Tokens are 32 bytes from `crypto.randomBytes`, sent base64url-encoded in the link. Only the SHA-256 hash is stored, so a database leak gives no usable tokens. SHA-256 is enough here because the token is fully random.
- **D2** Tokens go in a separate `password_reset_tokens` table, not in columns on `users`. This keeps a history, allows more than one pending request and makes invalidation simple.
- **D3** Tokens expire after 30 minutes and work once.
- **D4** The request endpoint always returns the same response, whether or not the email exists.
- **D5** Using the link opens a form, and only submitting the form (a POST) uses up the token. Email security scanners open links automatically and would otherwise burn the token.
- **D6** Mail is sent with `nodemailer` through Postmark, SES or SendGrid. You pick the provider.

## Schema
```sql
CREATE TABLE password_reset_tokens (
  id          bigserial PRIMARY KEY,
  user_id     <users.id type> NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  bytea NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  request_ip  inet
);
CREATE INDEX ON password_reset_tokens (user_id);
```

## Steps
1. **AC1** Write the migration above.
2. **AC2** Add config values: `APP_BASE_URL`, `RESET_TOKEN_TTL_MINUTES`, mail provider credentials and the from address.
3. **AC3** `POST /auth/password-reset/request` with body `{ email }`:
   - Validate the input and normalize the email (trim, lowercase).
   - Rate limit by IP and by email, for example 3 per email per hour.
   - Look up the user. If found, mark their unused tokens as used, insert a new token and send the email **outside the request path** (a queue, or at minimum fire-and-forget with error logging).
   - Always return `202` with the same body.
4. **AC4** Reset link: `${APP_BASE_URL}/reset-password?token=...`. The page sets `Referrer-Policy: no-referrer` and loads no third-party scripts.
5. **AC5** `POST /auth/password-reset/confirm` with body `{ token, password }`:
   - Check the password rules **before** using up the token.
   - In one transaction:
     - `UPDATE password_reset_tokens SET used_at = now() WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now() RETURNING user_id`. This is a single statement, so two requests with the same token can't both succeed.
     - If no row comes back, return a generic `400 invalid or expired token`.
     - Update `users.password_hash`.
     - Mark the user's other unused tokens as used.
     - Revoke the user's existing sessions and refresh tokens (see R5).
6. **AC6** Send a "your password was changed" email after the reset succeeds.
7. **AC7** Add a scheduled job that deletes tokens that expired or were used more than N days ago.
8. **AC8** Tests (below).

## Risks
- **R1** Host header injection: build the link only from `APP_BASE_URL`, never from `req.headers.host`. Otherwise an attacker can make the email point at their own domain.
- **R2** Tokens leaking into logs: remove `token` from access logs, error trackers and query-string logging.
- **R3** Account discovery (email enumeration) through response time: a lookup plus sending mail inline is measurably slower than a miss. Sending mail outside the request (AC3) prevents this.
- **R4** Mail bombing and cost: without limits per email as well as per IP, anyone can flood a user's inbox. `express-rate-limit`'s default memory store counts each instance separately. Use a shared store if you run more than one instance.
- **R5** Stateless JWTs can't be revoked. A stolen token stays valid after the reset unless you add a `password_changed_at` or `token_version` column to `users` and check it on every request.
- **R6** Rate limiting by IP behind a proxy: set `app.set('trust proxy', ...)` correctly, or every client appears to have the same IP.
- **R7** If `users.email` isn't unique ignoring case, a lowercase lookup can match more than one row. Check for duplicates before relying on it.
- **R8** Deliverability: without SPF, DKIM and DMARC on the sending domain, reset emails land in spam.
- **R9** Users who only sign in through SSO or OAuth may have no password. A reset would quietly add password login to their account.

## Tests
- A known and an unknown email get the same status and body.
- An expired token, a used token and a random token are all rejected.
- Two concurrent confirms with the same token: exactly one succeeds.
- A new token invalidates older ones for the same user.
- Old sessions stop working after a reset.
- A password that fails the rules does not use up the token.
- Rate limit returns `429` after the threshold.
- The link host comes from config even when a forged `Host` header is sent.

## Questions
- **Q1** Sessions: `express-session` or JWT? This decides how R5 is handled.
- **Q2** Which mail provider?
- **Q3** Should SSO-only users be allowed to reset (R9)?

The Gmail, Google Drive, Google Calendar and Canva connectors need authorization in your claude.ai connector settings before they can be used. This plan doesn't depend on them.
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
Put a `data-theme` attribute on `<html>`, override the CSS variables under `[data-theme="dark"]`, save the choice in `localStorage`, and set the attribute with an inline script before React loads so the page never flashes the wrong theme.

## Assumptions
- A1: The app renders only in the browser (Vite or CRA). With SSR (Next.js, Remix), step 3 and R2 change.
- A2: Every color already comes from a variable. I haven't checked this against your codebase.
- A3: The toggle has two states, light and dark. When nothing is saved, the OS setting picks the starting theme.

## Steps
1. **Dark palette.** In the global stylesheet, add a block that overrides only the color variables:
   ```css
   :root { color-scheme: light; --bg: #fff; --fg: #111; }
   [data-theme="dark"] { color-scheme: dark; --bg: #121212; --fg: #eee; }
   ```
   `color-scheme` makes scrollbars, form controls and autofill match the theme.
2. **Inline script in `index.html`** in `<head>`, before the app bundle:
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
3. **`useTheme` hook** (`src/theme/useTheme.js`):
   - Initial state is read from `document.documentElement.dataset.theme`, which the script already set. Don't read storage a second time.
   - `toggle()` flips the state, writes `data-theme`, and calls `localStorage.setItem('theme', next)` inside `try/catch`.
   - Plain state is enough when only the toggle reads the theme. Use a context only if other components need it.
4. **`ThemeToggle` component**: a `<button>` with `aria-pressed={theme === 'dark'}` and a text label or `aria-label`. Put it in the header.
5. **Tests**:
   - The toggle flips `data-theme` and writes to `localStorage`.
   - A saved value wins over the OS setting after reload.
   - Nothing crashes when `localStorage` throws.
   - Manual check: hard reload in dark mode shows no light flash.

## Risks
- R1: Hard-coded colors (`#fff` in CSS, inline `style`, SVG `fill`, images with white backgrounds) will stay light. Search for hex, `rgb(` and `hsl(` before calling it done.
- R2: With SSR, the server can't see `localStorage`. You'd need a cookie, or the inline script plus `suppressHydrationWarning` on `<html>`. Otherwise you get a hydration mismatch or a flash.
- R3: `localStorage` can throw when storage is blocked or full. Without the `try/catch` the app crashes on load.
- R4: A strict Content Security Policy blocks inline scripts. You'd need a nonce or hash, or you accept a flash on load.
- R5: Third-party components with their own styles (date pickers, rich text editors, charts) won't follow your variables. Each needs its own dark config or overrides.
- R6: Once someone clicks the toggle, OS theme changes stop applying for them. That comes from A3. If you want a "System" option, the toggle needs three states and a `matchMedia` change listener.
- R7: Other open tabs keep the old theme until reload. A `storage` event listener fixes this if it matters.

## Decision needed
- D1: Two states (A3) or three with "System" (R6). Three states add about 15 lines and a selector in place of a single button.
````

### plan-darkmode on 2

````markdown
# Dark mode toggle plan

Set a `data-theme` attribute on `<html>`, override the CSS variables under `[data-theme="dark"]`, and save the choice in `localStorage`. Apply the saved theme with an inline script before React loads.

## Assumptions
- **A1:** All colors come from variables defined on `:root`. Any hardcoded hex values, inline styles or colors inside SVGs and images will not switch.
- **A2:** The app is client-rendered (Vite or CRA). If it uses server rendering, such as Next.js, see R3.
- **A3:** Each browser keeps its own choice. Syncing the choice to a user account is out of scope.

## Decisions
- **D1: Two-state toggle (light/dark) or three-state (light/dark/system).** I recommend two-state, with the OS setting as the default until the user clicks the toggle. It's simpler UI and still respects the OS preference.
- **D2: Storage.** Use `localStorage` key `theme` with the value `"light"` or `"dark"`. Cookies only matter if the server needs to render the correct theme (R3).

## Steps
1. **CSS:** Keep the light values on `:root`. Add a `[data-theme="dark"] { ... }` block that overrides only the color variables. Add `color-scheme: light` on `:root` and `color-scheme: dark` in the dark block so native form controls and scrollbars match.
2. **Inline script in `index.html` `<head>`, before the bundle:** Read `localStorage.theme`. If it's missing, use `matchMedia('(prefers-color-scheme: dark)')`. Set `document.documentElement.dataset.theme`. Wrap it in `try/catch`.
3. **`useTheme` hook:** Its initial state reads `document.documentElement.dataset.theme`, so React matches what the script already set. `toggle()` updates state, sets the attribute and writes to `localStorage`.
4. **`ThemeToggle` button:** Uses `useTheme`. Add `aria-pressed` or an `aria-label` that states the theme it switches to.
5. **OS preference changes:** While no choice is saved, listen for `matchMedia` `change` events and follow the OS.
6. **Tests:**
   - Toggle flips the attribute and writes to storage.
   - A saved value wins over the OS preference.
   - The app doesn't crash when storage throws.

## Risks
- **R1: Wrong theme flashes on load** if the theme is applied inside React instead of the inline script in step 2.
- **R2: `localStorage` can throw** when storage is blocked or in some private modes. Without `try/catch`, the app crashes on load. With it, the toggle still works but the choice isn't saved.
- **R3: Server rendering causes hydration mismatches** because the server doesn't know the theme. Fixes: keep the inline script and add `suppressHydrationWarning` on `<html>`, or store the theme in a cookie so the server renders it.
- **R4: A strict Content Security Policy blocks the inline script.** Use a nonce or hash, or accept the flash from R1.
- **R5: Other open tabs don't update after a toggle** until reload. Listening for the `storage` event fixes this but adds scope. I left it out unless you want it.
- **R6: Contrast.** Dark values need their own WCAG contrast check. Inverting the light values doesn't guarantee it.

## Next
- Decide D1.
````

### plan-darkmode on 3

````markdown
Put the theme on `<html data-theme="dark">`, override the CSS variables under that selector, save the choice in `localStorage`, and apply it with an inline script before React loads so the page never flashes the wrong theme.

## Assumptions
- A1: The app renders only in the browser (Vite or CRA). With SSR (Next.js, Remix), step 2 changes. See R2.
- A2: The current variables are defined on `:root`.
- A3: I haven't seen the codebase. The working directory has no project files.

## Decisions
- D1: **Toggle type.** I recommend a two-state toggle (light/dark) that follows `prefers-color-scheme` until the user picks one. A three-state toggle (light/dark/system) is more accurate but needs more UI.
- D2: **State sharing.** Use a `useTheme` hook. Only add a React context if more than one component needs to read the theme.
- D3: **Cross-tab sync.** Leave it out unless you ask for it. Other open tabs update on their next load.

## Steps
1. **CSS.** Keep the light values on `:root` and add dark overrides:
   ```css
   :root { color-scheme: light; --bg: #fff; --fg: #111; }
   [data-theme="dark"] { color-scheme: dark; --bg: #121212; --fg: #eee; }
   ```
   `color-scheme` makes native inputs and scrollbars match the theme.
2. **Script to prevent the flash.** Add this to the `<head>` of `index.html`, before the bundle:
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
3. **Hook** (`useTheme.ts`):
   ```ts
   export function useTheme() {
     const [theme, setTheme] = useState(
       () => document.documentElement.dataset.theme as 'light' | 'dark'
     );
     useEffect(() => {
       document.documentElement.dataset.theme = theme;
       try { localStorage.setItem('theme', theme); } catch {}
     }, [theme]);
     const toggle = () => setTheme(t => (t === 'dark' ? 'light' : 'dark'));
     return { theme, toggle };
   }
   ```
   The state starts from the attribute the script set, so the script and React always agree.
4. **Toggle component.** Use a `<button>` with `aria-pressed={theme === 'dark'}` and a label like "Dark mode".
5. **Find colors that skip the variables.** Search for hex, `rgb(`, and `hsl(` values in CSS, inline styles and CSS-in-JS, and move them to variables.

## Risks
- R1: **Colors outside the variables stay light.** This includes hardcoded colors, SVG `fill`s, images with white backgrounds, and third-party components with their own styles. Step 5 only covers your own code.
- R2: **SSR.** On the server, `document` doesn't exist and the server can't read `localStorage`, so step 3 would crash and step 2 would cause a hydration mismatch. With SSR, store the theme in a cookie or add `suppressHydrationWarning` to `<html>`.
- R3: **Storage can fail.** `localStorage` throws when storage is blocked or full. The `try/catch` falls back to the system preference, and the choice isn't saved.
- R4: **CSP.** A strict Content Security Policy blocks the inline script. You would need a nonce or hash, or accept the flash.
- R5: **Stale saved value.** A choice saved while the OS was in dark mode still wins after the OS switches to light. That is how D1 works. Pick three-state if users should be able to go back to following the system.
- R6: **Transitions.** A `transition` on colors animates on first paint. Keep transitions off the root, or enable them after load.

## Tests
- The toggle changes `data-theme` and writes `localStorage.theme`.
- After a reload, the saved theme shows with no flash. Check this manually with network throttling.
- With nothing saved, the theme follows `prefers-color-scheme`. Emulate it in DevTools under Rendering.
- With `localStorage` stubbed to throw, the app still renders.

Unrelated to this plan: the Canva, Gmail, Google Calendar and Google Drive connectors need authorization in your claude.ai connector settings. They won't work until you do that.
````
