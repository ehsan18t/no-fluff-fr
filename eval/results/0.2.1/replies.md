# Replies: 0.2.1

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
A database index is a separate sorted structure (usually a B-tree) that maps column values to row locations, so the database can find matching rows without scanning the whole table. You pay for it on every write and in storage and memory.

## When an index makes things worse

- **Write-heavy tables.** Every INSERT, UPDATE of an indexed column, and DELETE must also update each index. A table with 8 indexes does roughly 9 writes per insert. On ingest or event tables this can cut write throughput more than the index speeds up reads.
- **Low-selectivity columns.** On a column like `status` with 3 values, a query matching 30% of rows is slower through the index than a sequential scan, because it does random I/O per row. If the planner's statistics are stale, it may pick the index anyway.
- **Random keys such as UUIDv4.** Inserts land at random spots in the B-tree, causing page splits, fragmentation and poor cache hit rates. Use UUIDv7, ULID or a sequential key if the column is indexed or is the clustered primary key.
- **Index size exceeds memory.** Once indexes no longer fit in the buffer pool or page cache, lookups and maintenance hit disk, and they push hot table pages out of memory too.
- **The planner picks the wrong index.** Adding an index can change a plan that used to be good, for example choosing an index that matches `ORDER BY` and then filtering millions of rows instead of using a selective index. This shows up as a sudden regression in an unrelated query.
- **Redundant indexes.** An index on `(a)` next to one on `(a, b)` adds write cost with almost no read benefit, since `(a, b)` already serves queries on `a`.
- **Frequently updated indexed columns.** In PostgreSQL, updating an indexed column disables HOT updates, so every update writes new index entries and increases bloat and vacuum work. Indexing a `last_seen_at` column is a common case.
- **Building the index on a live table.** A plain `CREATE INDEX` blocks writes for the full build. Use `CREATE INDEX CONCURRENTLY` (PostgreSQL) or `ALGORITHM=INPLACE, LOCK=NONE` (MySQL). Large builds can also cause replication lag.

## Indexes that do nothing

These add write cost without any read benefit:

- Very small tables, where a scan is as fast as a lookup.
- Queries that wrap the column in a function (`WHERE lower(email) = ...`) or cast it. These need an expression index.
- A composite index whose leading column is not in the query.

Before adding an index, compare `EXPLAIN ANALYZE` output with and without it on production-sized data. After adding it, check the usage stats (`pg_stat_user_indexes` or `sys.schema_unused_indexes`) and drop indexes that are never scanned.
````

### explain-index on 2

````markdown
An index is a separate sorted structure (usually a B-tree) that maps column values to row locations, so the database can find matching rows without scanning the whole table. It speeds up reads and costs you on every write and in storage.

## When an index makes performance worse

- **Write-heavy tables.** Every INSERT, UPDATE of an indexed column, and DELETE must also update each index. A table with 8 indexes does roughly 9 writes per insert. Bulk loads and high-throughput event or log tables suffer most.
- **Low-selectivity columns.** On a column like `status` with 3 values, a query matching 30% of rows is faster as a sequential scan than as thousands of random index lookups. If the planner still picks the index (stale statistics, forced hints), the query gets slower.
- **Small tables.** A table that fits in a few pages is cheaper to scan than to traverse an index. The index adds write cost for no read gain.
- **Planner picks the wrong index.** A new index can change existing query plans. For example, the planner uses an index on `created_at` for `ORDER BY ... LIMIT` and walks millions of rows looking for a rare `WHERE` match, where the old plan filtered first. This is the most common cause of a regression right after adding an index.
- **Memory pressure.** Indexes compete with table data for the buffer pool or page cache. Too many large indexes push hot data out of memory and turn reads into disk reads.
- **Redundant indexes.** An index on `(a)` is redundant with one on `(a, b)` for most queries. The extra one only adds write and storage cost.
- **Wide or bloated indexes.** Indexing long text or many columns makes the index large, so fewer entries fit per page and lookups touch more pages. Frequent updates in PostgreSQL also bloat indexes until vacuum or reindex catches up.
- **Lock and replication cost during creation.** A plain `CREATE INDEX` can block writes for the whole build on a large table and cause replica lag. Use `CREATE INDEX CONCURRENTLY` (PostgreSQL) or an online index build (MySQL `ALGORITHM=INPLACE, LOCK=NONE`, SQL Server `ONLINE = ON`).

## Rules for deciding

- Add an index for a specific slow query you have measured, and confirm with `EXPLAIN ANALYZE` (or your engine's equivalent) that the plan uses it and gets faster.
- Put the most selective equality column first in a composite index, then range or sort columns.
- Check plans of other hot queries on the same table after adding it, since plans can change.
- Periodically drop unused indexes. In PostgreSQL, `pg_stat_user_indexes` with `idx_scan = 0` shows candidates. In MySQL, use `sys.schema_unused_indexes`.
````

### explain-index on 3

````markdown
An index is a separate sorted structure (usually a B-tree) holding copies of one or more columns plus pointers to the rows. It lets the database find matching rows without scanning the whole table. You pay for it on every write and in storage.

## When an index makes performance worse

- **Write-heavy tables.** Every INSERT, UPDATE of an indexed column, and DELETE must also update each index. A table with 8 indexes does roughly 9 writes per insert. Logging, event, and queue tables often suffer most.
- **Low-selectivity columns.** An index on `status` with 3 values, or a boolean, matches a large share of rows. Reading the index and then fetching each row is slower than a sequential scan. The planner usually ignores the index, but you still pay the write cost. A partial index (`WHERE status = 'pending'`) fixes this when you query the rare value.
- **Queries that return a large fraction of the table.** Past roughly 5 to 20% of rows, depending on the engine and on disk layout, random row lookups cost more than one sequential read.
- **Redundant indexes.** An index on `(a)` is covered by an existing `(a, b)` index. The extra one adds write cost and memory pressure with no read benefit.
- **Memory pressure.** Indexes compete with table data for the buffer cache. Too many indexes on a large table push hot data out of memory, and unrelated queries get slower.
- **Lock contention and page splits.** Indexes on random keys (UUIDv4) cause inserts to land all over the B-tree. This causes page splits, fragmentation, and worse cache locality. Sequential keys (bigint, UUIDv7) avoid it.
- **Bad plan choices.** Stale statistics or a misleading index can make the planner pick an index scan that is slower than the plan it used before. This shows up as a sudden regression after you add an index.
- **Building it on a live table.** A plain `CREATE INDEX` can block writes for the whole build. On Postgres use `CREATE INDEX CONCURRENTLY`. On MySQL, check that the online DDL applies to your case.

## When adding one

- Base it on real slow queries, and check the plan with `EXPLAIN ANALYZE` before and after.
- Put equality columns first in composite indexes, then range or sort columns. `(a, b)` does not help a query that filters only on `b`.
- Find unused indexes periodically and drop them. On Postgres, check `pg_stat_user_indexes` for `idx_scan = 0`. On MySQL, use `sys.schema_unused_indexes`.
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
A process has its own memory space. Threads run inside one process and share its memory. Choose threads when tasks need to share a lot of state cheaply. Choose processes when you need isolation or real CPU parallelism in a runtime that blocks it.

| | Process | Thread |
|---|---|---|
| Memory | Separate. Sharing needs IPC, pipes, sockets or shared memory | Shared heap. Each thread has only its own stack |
| Failure | A crash stays in that process | A segfault or unhandled fault kills every thread |
| Cost to start | Higher, especially on Windows where there is no `fork` | Low |
| Communication | Serialization cost on every message | Direct access, but needs locks |
| Main bug risk | IPC overhead and serialization bugs | Race conditions and deadlocks, which are hard to reproduce |
| Security boundary | Yes. You can drop privileges or sandbox it | No |

**Pick processes when:**
- One task crashing must not take down the others, such as browser tabs, plugin hosts or workers running untrusted input.
- You need CPU parallelism in CPython (the GIL is still the default build), or in Node without worker_threads.
- Tasks need different privileges, or you want to restart one without a full restart.
- Tasks share little data, so the IPC cost stays small.

**Pick threads when:**
- Tasks read or change large shared data, where copying it between processes would cost more than locking.
- You need many short tasks and startup cost matters.
- The work is I/O bound and your language has no async option you want to use. For high concurrency I/O, async (one thread with an event loop) usually beats both.

**Rules that decide most cases:**
- Java, C#, Go, Rust, C++: default to threads (or goroutines and tasks). The runtime runs them in parallel and the tooling for safe sharing is mature.
- Python CPU work: `multiprocessing` or `ProcessPoolExecutor`. The free-threaded 3.13+ build removes this limit, but many C extensions are not yet safe on it.
- Mixed designs are common and often the best: a few processes for isolation, each with a thread pool for throughput. Nginx, Postgres and Chrome all work like this.
````

### explain-thread on 2

````markdown
A process has its own memory space, and threads inside one process share memory. Pick threads when tasks need to share state cheaply, and processes when you need isolation or true CPU parallelism in a runtime that blocks it.

| | Process | Thread |
|---|---|---|
| Memory | Separate address space | Shared with other threads in the process |
| Crash impact | Contained to that process | Can take down the whole process |
| Communication | IPC (pipes, sockets, shared memory), needs serialization | Direct access to shared data, needs locks |
| Creation and switch cost | Higher, especially on Windows where there is no `fork` | Lower |
| Security boundary | Yes, can run with different privileges | No |

**Pick threads when:**
- Tasks share large in-memory state and copying it would be expensive.
- Work is I/O-bound and you want lower overhead than processes. For very high concurrency, async I/O often beats both.
- The runtime runs threads in parallel on multiple cores (Java, C#, Go, Rust, C++).

**Pick processes when:**
- One task failing must not kill the others, such as plugins, untrusted code, or browser tabs.
- You need a privilege or sandbox boundary.
- The runtime has a global lock that blocks CPU parallelism in threads. CPython before free-threaded builds is the main case, so use `multiprocessing` there for CPU-bound work.
- You want to scale past one machine later, since process-style message passing moves to a network more easily than shared memory does.

**Costs to plan for:**
- Threads bring race conditions and deadlocks that are hard to reproduce. Keep shared mutable state small and prefer message queues even between threads.
- Processes bring serialization overhead on every message. If messages are large or frequent, that can erase the parallelism gain.
````

### explain-thread on 3

````markdown
A process has its own memory space, and a thread is an execution path that shares memory with other threads in the same process. Pick based on whether you need isolation or cheap shared state.

| | Process | Thread |
|---|---|---|
| Memory | Separate address space | Shared heap, own stack |
| Crash impact | Contained to that process | A segfault or unhandled fault kills the whole process |
| Communication | IPC (pipes, sockets, shared memory), needs serialization | Direct access to shared objects, needs locks |
| Creation and switch cost | Higher, especially on Windows where there is no `fork` | Lower |
| Scaling | Can spread across machines | Single machine only |

**Use processes when:**
- A failure in one unit must not take down the others, such as running plugins, untrusted code, or per-tab browser renderers.
- The runtime has a global lock that blocks parallel CPU work. CPython before free-threading builds is the common case, so CPU-bound Python work goes in `multiprocessing` or `ProcessPoolExecutor`.
- You need different privileges or resource limits per unit.
- The work may later move to separate machines. Process boundaries already force a message-passing design.

**Use threads when:**
- Units share large in-memory state and copying or serializing it would cost more than the work.
- The work is CPU-bound in a runtime without a global lock (Java, C#, Go, Rust, C++).
- You need low-latency handoff between units, such as a UI thread and a worker.

**Consider neither for I/O-bound concurrency at high counts.** Thousands of network connections are cheaper with async I/O (`async/await`, epoll/IOCP event loops) or green threads such as goroutines, because OS threads cost about 1 MB of reserved stack each and context switches add up.

**Main downside of threads:** data races and deadlocks are the default failure mode and are hard to reproduce. If you pick threads, keep shared mutable state small and prefer message queues or immutable data between threads.
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
`forEach` ignores the promise each async callback returns, so it starts all the writes and returns immediately. `console.log` runs on the next line, before any write finishes.

Use `map` to collect the promises and wait for all of them:

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

- Your current version also loses errors. A failed write becomes an unhandled rejection that `saveAll`'s caller can't catch. With `Promise.all`, the first failure rejects `saveAll`.
- `Promise.all` opens every file at once. For large arrays that can hit `EMFILE` (too many open files). If that happens, write one file at a time with `for (const item of items) { await fs.promises.writeFile(...) }`, which is slower.
````

### debug-foreach on 2

````markdown
`forEach` ignores the promises its async callback returns, so `saveAll` never waits for the writes and logs right away.

- `saveAll` also resolves before the writes finish, and a failed write becomes an unhandled rejection instead of rejecting `saveAll`.

Fix, writes run in parallel:

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

If you need one write at a time, use `for (const item of items) { await fs.promises.writeFile(...) }` instead. It is slower for large lists.
````

### debug-foreach on 3

````markdown
`forEach` ignores the promises your async callback returns, so `saveAll` never waits for the writes and logs immediately.

- Errors are lost too: a failed write becomes an unhandled rejection instead of rejecting `saveAll`.

Parallel writes:

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

Sequential writes, if order matters or you have many files:

```js
async function saveAll(items) {
  for (const item of items) {
    await fs.promises.writeFile(`out/${item.id}.json`, JSON.stringify(item));
  }
  console.log("saved");
}
```

- `Promise.all` opens every file at once. With thousands of items that can hit `EMFILE` (too many open files), so use the loop or a concurrency limiter.
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
The default list is created once, when the function is defined, so every call that omits `tags` appends to that same list.

Fix it by defaulting to `None` and creating a new list inside the function:

```python
def add_tag(tag, tags=None):
    if tags is None:
        tags = []
    tags.append(tag)
    return tags
```

- Use `is None`, not `if not tags`. Otherwise a caller who passes their own empty list gets a new list back and their list stays unchanged.
- This function still changes a list the caller passes in. If callers don't expect that, copy it first with `tags = list(tags)`.
````

### debug-default-arg on 2

````markdown
The default `[]` is created once, when `def` runs, so every call that omits `tags` appends to that same list.

Use `None` as the default and build a new list inside the function:

```python
def add_tag(tag, tags=None):
    if tags is None:
        tags = []
    tags.append(tag)
    return tags
```

- Use `is None`, not `if not tags`. Otherwise a caller who passes their own empty list gets a new list back, and their list stays empty.
- When a caller passes a list, the function still changes that list in place. If callers should not see that, use `tags = list(tags) if tags is not None else []`.
````

### debug-default-arg on 3

````markdown
The default `tags=[]` is created once, when the function is defined, so every call that omits `tags` appends to that same list.

Fix it by using `None` as the default and creating a new list inside the function:

```python
def add_tag(tag, tags=None):
    if tags is None:
        tags = []
    tags.append(tag)
    return tags
```

- Use `is None`, not `if not tags`. With `if not tags`, a caller who passes their own empty list gets a new list back, and their list is never changed.
- This applies to any mutable default, such as `{}` and `set()`, and to dataclass fields, where you use `field(default_factory=list)`.
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
`service nginx start` starts nginx as a background daemon and then exits. The container lives only as long as its main process (PID 1), so when that command returns, the container stops.

Fix: run nginx in the foreground as PID 1.

```dockerfile
CMD ["nginx", "-g", "daemon off;"]
```

- Use the exec (JSON array) form so nginx is PID 1 and gets `SIGTERM` directly from `docker stop`. The shell form wraps it in `/bin/sh -c`, which does not forward signals, so stop waits 10 seconds and then kills it.
- Also add `EXPOSE 80` and run with `-p 8080:80` if you need to reach it from the host.
- To have nginx logs show in `docker logs`, symlink them to stdout/stderr as the official nginx image does:
  ```dockerfile
  RUN ln -sf /dev/stdout /var/log/nginx/access.log && ln -sf /dev/stderr /var/log/nginx/error.log
  ```
````

### debug-docker on 2

````markdown
`service nginx start` starts nginx as a background daemon and then exits. That shell command is PID 1, so when it exits, Docker stops the container.

Run nginx in the foreground as PID 1 instead:

```dockerfile
CMD ["nginx", "-g", "daemon off;"]
```

- Use the exec (JSON) form so nginx gets `docker stop` signals directly. The shell form wraps it in `/bin/sh`, which does not forward SIGTERM, so stops wait out the 10 second timeout and then SIGKILL.
- nginx logs go to files under `/var/log/nginx`, so `docker logs` shows nothing. To get logs there, add this to the Dockerfile:

```dockerfile
RUN ln -sf /dev/stdout /var/log/nginx/access.log && ln -sf /dev/stderr /var/log/nginx/error.log
```
````

### debug-docker on 3

````markdown
`service nginx start` launches nginx as a background daemon and then returns. A container lives only as long as its main process (PID 1), so when that script exits, the container stops.

Run nginx in the foreground instead:

```dockerfile
CMD ["nginx", "-g", "daemon off;"]
```

- Use the JSON (exec) form shown above. The shell form wraps nginx in `/bin/sh`, so `docker stop` signals go to the shell instead of nginx. nginx then gets killed after the 10 second timeout rather than shutting down cleanly.
- The Ubuntu nginx package writes logs to `/var/log/nginx/`, so `docker logs` will show nothing. To send them to Docker, add this to the Dockerfile:
  ```dockerfile
  RUN ln -sf /dev/stdout /var/log/nginx/access.log && ln -sf /dev/stderr /var/log/nginx/error.log
  ```
- If you don't need Ubuntu specifically, `FROM nginx` already runs in the foreground and logs to stdout.
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
PostgreSQL.

- Users, orders and invoices are relational data. Orders reference users, invoices reference orders, and you will join across them for billing, reporting and support queries. Postgres does this natively with foreign keys enforcing it.
- Invoices need strict correctness. Multi-row ACID transactions (create order, reserve stock, write invoice, all or nothing) are the default in Postgres. MongoDB supports them, but they are opt-in, add overhead, and the data model steers you away from them.
- Money and totals need schema guarantees. `NUMERIC`, `CHECK` constraints and `NOT NULL` stop bad data at write time. In MongoDB that validation lives in app code or optional schema validators.
- Flexible fields still work. Use `JSONB` columns for things like product attributes or payment provider payloads, with GIN indexes if you query them.
- Reporting and accounting exports are SQL-shaped. Aggregations across users, orders and invoices are simpler in SQL than in aggregation pipelines.

Choose MongoDB instead only if most of your data is document-shaped with no cross-entity queries, or your team already runs MongoDB in production and has no Postgres experience. Neither applies to an orders and invoices domain by default.
````

### compare-db on 2

````markdown
PostgreSQL.

- Users, orders and invoices are relational: an invoice references an order, which references a user. Postgres enforces those links with foreign keys, so you cannot end up with an invoice pointing at a deleted order.
- Money needs multi-row transactions. Creating an order, its line items and an invoice must succeed or fail together. Postgres does this by default. MongoDB supports it, but it is opt-in and slower, so the schema tends to get bent around avoiding it.
- Invoices need exact amounts. Use `numeric` in Postgres, never floats. MongoDB has `Decimal128`, but drivers and ORMs make it easy to write a plain float by accident.
- Reporting (revenue per month, unpaid invoices per customer) is plain SQL joins and aggregates. In MongoDB the same queries mean `$lookup` pipelines or copying data between documents.
- For flexible fields such as product attributes or payment provider payloads, use a `jsonb` column. That covers the main case where MongoDB would help.

MongoDB is the better pick only if most of your data has no fixed shape and few links between records, and that does not describe this app.
````

### compare-db on 3

````markdown
PostgreSQL.

- Users, orders and invoices are relational data. Orders reference users, invoices reference orders, and you will join across them for reports and account pages. Postgres does this natively with foreign keys, so an invoice cannot point at a deleted order.
- Invoices are financial records, so you need multi-row transactions and constraints (unique invoice numbers, non-null totals, check constraints on amounts). Postgres enforces these in the database. MongoDB has transactions, but schema and referential integrity end up in application code, where bugs create bad data silently.
- Store money as `numeric` (or integer cents), never float.
- For parts that vary per record, such as order line metadata or payment provider payloads, use a `jsonb` column. That gives you most of what MongoDB offers without a second database.
- MongoDB fits better only if most of your data is document-shaped with no cross-entity queries, or if you need built-in horizontal sharding at a scale a single Postgres instance cannot handle. Neither applies to this data model at launch.
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
**REST (HTTP/JSON) with an OpenAPI spec per service, unless one of the gRPC triggers below applies to you.**

Why REST fits a team of five:
- **Debugging:** `curl`, browser devtools, logs and your ingress all read JSON as-is. gRPC needs `grpcurl` and reflection or proto files at hand, and payloads in logs are binary unless you add decoding.
- **Kubernetes load balancing:** a normal ClusterIP Service balances per connection, and gRPC keeps long-lived HTTP/2 connections. All calls from one client pod then go to one server pod. The fix is client-side balancing against a headless Service, or a mesh like Linkerd. Either one is extra setup and extra things to run.
- **Tooling cost:** protobuf toolchain, codegen in CI, and `buf` for breaking-change checks. That work is justified at scale, but at eight services it is mostly overhead.

Pick gRPC instead if any of these hold:
- A hot path makes thousands of calls per second where JSON encoding or latency shows up in profiles.
- You need streaming, such as server push or bidirectional streams.
- Services use several languages and you want generated, typed clients without writing them by hand.
- Contract drift between services already causes incidents.

Downsides to plan for:
- REST only stays safe if you generate clients from the OpenAPI spec and check spec changes in CI. Without that, handwritten clients drift, and that drift is the main thing gRPC would have prevented.
- Using gRPC for only one or two hot paths is reasonable, but it means maintaining two toolchains and two sets of middleware for auth, retries and tracing.
````

### compare-rpc on 2

````markdown
REST, unless one of the conditions below already applies to you.

- **Why REST by default:** with five people, the cost that matters is debugging and onboarding time. JSON over HTTP works with curl, browser devtools, your existing ingress, and every log and tracing tool with no extra setup.
- **What gRPC costs you:** a shared proto repo or package, codegen in every service's build, a versioning discipline for breaking changes, and grpcurl or similar for manual calls. With eight services that is real ongoing work for a small team.
- **Kubernetes gotcha if you pick gRPC:** it runs over long-lived HTTP/2 connections, so a normal ClusterIP Service balances per connection, not per request, and one pod can get all the traffic. You need client-side balancing through a headless Service, or a mesh such as Linkerd or Istio. Teams often find this only under load.
- **Get REST's main missing piece anyway:** a typed contract. Write OpenAPI specs and generate clients from them, so breaking changes fail at build time and not in production.

Switch to gRPC if any of these is true:

| Condition | Why gRPC wins |
|---|---|
| Services use several languages and you keep breaking each other's contracts | Generated clients from one proto remove schema drift |
| You need streaming (server push, bidirectional) between services | Built in, where REST needs WebSockets or SSE on the side |
| Profiling shows serialization or payload size as a real bottleneck, often at thousands of requests per second per call path | Protobuf is smaller and faster to parse |
| You already run a mesh | The load balancing problem above is already solved |

Mixing is fine: keep REST at the edge and for most calls, and use gRPC only on the one or two high-volume or streaming paths.
````

### compare-rpc on 3

````markdown
**REST (HTTP/JSON with an OpenAPI spec) by default. Switch to gRPC only if one of the conditions below applies.**

Why REST fits a team of five with eight services:
- **Debugging:** you can inspect and replay calls with curl, browser devtools and plain logs. gRPC needs grpcurl, reflection or the .proto files at hand, and that slows down on-call work.
- **Kubernetes needs nothing extra:** standard Services, ingress, readiness probes and most service meshes handle HTTP/1.1 with no setup. gRPC runs on long-lived HTTP/2 connections, so kube-proxy balances per connection, not per request, and traffic sticks to one pod. The fix is a headless Service with client-side balancing, or a mesh like Linkerd or Istio. That is one more component to own.
- **Less build tooling:** gRPC means protoc or buf in every service's build, generated code checked in or generated in CI, and a shared proto repo with versioning rules.

You can get most of gRPC's main benefit, typed contracts, without gRPC: write OpenAPI specs, generate clients from them, and check for breaking changes in CI with a tool like oasdiff.

Pick gRPC if any of these apply:
- You need streaming, such as server push or bidirectional flows. REST alternatives like SSE or WebSockets are harder to run.
- Profiling shows JSON serialization or per-call latency matters, as with high fan-out or thousands of calls per request path.
- The services are in several languages and hand-written clients keep drifting from the servers.
- You already run a mesh that handles HTTP/2 balancing.

Mixing both is fine: REST everywhere, gRPC only on the one or two paths that meet a condition above. Do not split the eight services into two camps for style reasons alone.
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
`request()` in `src/http.js` now retries failed requests up to 3 times with exponential backoff (500 ms, 1 s, 2 s), and the per-attempt timeout goes from 10 s to 30 s.

**Behavior**
- A 5xx response, a network error or a timeout triggers a retry. After the last attempt the original error is thrown as before.
- `retries` is a new optional third parameter with a default of 3, so existing callers need no changes.

**Issues to raise**
- **F1: 4xx responses are retried.** The `HTTP ${res.status}` error is thrown inside the `try`, so the `catch` retries it. A 404 or 401 now takes about 3.5 s to fail instead of failing at once. The `catch` should rethrow HTTP errors below 500.
- **F2: Non-idempotent requests are retried.** POST and PATCH requests that time out or get a 5xx may have already run on the server, so retrying can create duplicates. Retries should be limited to GET, HEAD, PUT and DELETE, or require callers to opt in.
- **F3: Worst-case latency grows from 10 s to about 124 s.** That is 4 attempts at 30 s plus 3.5 s of sleep. Any caller with its own deadline or a UI waiting on the call is affected.
- **F4: Callers cannot cancel.** `options.signal` is overwritten by the timeout signal. This bug existed before, but it matters more now that a call can run for 2 minutes. Combining signals with `AbortSignal.any([options.signal, AbortSignal.timeout(30000)])` fixes it.
- **F5: No jitter and `Retry-After` is ignored.** Many clients failing together will retry at the same moments, which adds load to a server that is already failing.

JSON parse errors are not retried, because `res.json()` is returned without `await` and rejects outside the `try`. That is probably the intended behavior.
````

### summarize-retry on 2

````markdown
`request()` in `src/http.js` now retries failed requests up to 3 times (4 attempts total) with exponential backoff of 500ms, 1s and 2s. The per-attempt timeout goes from 10s to 30s.

Issues for the reviewer:

- **F1:** Every method is retried, including POST, PATCH and other non-idempotent calls. A 5xx or timeout after the server has already applied the write will send it again and can duplicate side effects.
- **F2:** 4xx responses are also retried, which is probably not intended. The `throw new Error(\`HTTP ${res.status}\`)` sits inside the `try`, so the `catch` treats it like a network error. A 404 or 401 now costs 4 requests and about 3.5s before it fails.
- **F3:** The worst case for a caller is now about 123.5s (4 × 30s plus 3.5s of backoff), up from 10s. Any caller or upstream timeout shorter than that will cut the request off mid-retry.
- **F4:** `return res.json()` is not awaited, so a JSON parse failure rejects outside the `try` and is not retried. This is fine as behavior, but it differs from how every other failure is handled.
- **F5:** The backoff has no jitter, so many clients that fail together will retry together against a struggling server.

Suggested fix for F1 and F2: retry only on network errors, timeouts and 5xx, and only for idempotent methods unless the caller opts in.
````

### summarize-retry on 3

````markdown
`request()` in `src/http.js` now retries failed requests up to 3 times with exponential backoff (500ms, 1s, 2s), and the per-attempt timeout goes from 10s to 30s.

**What changed**
- New optional third argument `retries` (default 3). Existing callers get retries without any change on their side.
- 5xx responses and thrown errors (network failure, timeout) are retried. After the last attempt the error is thrown as before.

**Issues to raise**
- **F1, 4xx responses are retried.** The `throw new Error(\`HTTP ${res.status}\`)` sits inside the `try`, so the `catch` retries it. A 404 or 401 takes 4 requests and about 3.5s to fail. The 4xx throw should be moved out of the `try`, or the `catch` should rethrow it.
- **F2, non-idempotent requests are retried.** POST, PATCH and similar requests go through the same path, so a 5xx or timeout after the server has already applied the write can repeat it. Retries should be limited to GET, HEAD, PUT and DELETE, or require callers to opt in.
- **F3, the worst case is now about 2 minutes.** 4 attempts × 30s plus 3.5s of backoff is 123.5s, against 10s before. Callers or UI that assumed a 10s bound will hang much longer. Confirm that 30s per attempt is intended, or use one overall deadline.
- **F4, 429 and `Retry-After` are ignored.** Rate-limited requests fail right away, while overloaded 503s are retried on a fixed schedule with no jitter. Many clients retrying at the same moment will hit the server together.
- **F5, callers cannot cancel.** `options.signal` is still overwritten by the timeout signal. This was already true, but it matters more now that one call can run for 2 minutes. `AbortSignal.any([options.signal, timeout])` fixes it.

JSON parse errors are not retried, because `return res.json()` is not awaited inside the `try`. That is probably the right behavior, but it looks accidental.
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
The plan below is generic: I did not find or read the app's code in this directory, so file paths, the mailer, and the migration tool are assumptions to check against the repo.

## Schema

New table rather than columns on `users`, so a user can have several outstanding requests and you keep a record of each:

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

Match `user_id`'s type to `users.id`. If `users.id` is a uuid, use uuid here too.

## Steps

1. **Migration** for the table above, using whatever migration tool the app already has.
2. **`POST /auth/forgot-password`** with body `{ email }`:
   - Normalize the email the same way signup does, then look up the user.
   - If the user exists: generate `crypto.randomBytes(32)`, store `sha256(token)` with `expires_at = now() + 30 min`, and email `https://<APP_URL>/reset-password?token=<base64url token>`.
   - Always return the same 202 response whether or not the email exists.
3. **`POST /auth/reset-password`** with body `{ token, password }`, in one transaction:
   - Hash the token and run `SELECT ... WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now() FOR UPDATE`.
   - Validate the password with the same rules as signup.
   - Update `users.password_hash` using the app's existing hasher (bcrypt or argon2).
   - Set `used_at = now()` on this token and on every other unused token for that user.
   - Invalidate the user's existing sessions or refresh tokens.
4. **Frontend page** at `/reset-password` that reads `token` from the query string and POSTs it. It must not send the token to any third party, so no analytics scripts on that page.
5. **Rate limits** on both endpoints, per IP and per email, for example 5 requests per email per hour.
6. **Cleanup job** that deletes rows where `expires_at < now() - interval '7 days'`. This is optional at low volume.
7. **Tests**: valid reset, expired token, reused token, unknown email returns the same response, two concurrent resets with one token (only one succeeds), old session rejected after reset.

## Decisions to confirm

- **D1:** Store only the SHA-256 of the token. A database leak then does not expose working reset links. Use a plain hash, not bcrypt, because the token already has 256 bits of entropy and must be looked up by value.
- **D2:** Use a 30-minute expiry with single use. Longer windows make links in old inboxes usable for longer.
- **D3:** Log the user out everywhere on reset. The main reason people reset is a suspected compromise. With stateless JWTs and no revocation list, this needs a `password_changed_at` or `token_version` column on `users` that the auth middleware checks.
- **D4:** Send email through the app's existing mailer if it has one. If not, pick a transactional provider (Postmark, SES, Resend), and configure SPF, DKIM and DMARC before launch, or reset emails will land in spam.

## Risks

- **R1:** Timing differences let attackers find out which emails have accounts, even when the response body is identical. Send the email from a queue or after the response, not inline, so both paths take similar time.
- **R2:** Building the link from the request's `Host` header lets an attacker point the reset link at their own domain. Build it from a fixed `APP_URL` env var.
- **R3:** If a user's email is case-sensitive in the `users` table but signup lowercases it, lookups can miss or match the wrong row. Check how emails are stored before writing the query.
- **R4:** Without step 5, the forgot-password endpoint can be used to flood any inbox and burn your email provider's sending reputation.

Next: point me at the app's route, db and mailer files so I can map these steps onto real paths.
````

### plan-reset on 2

````markdown
Add a `password_reset_tokens` table and two endpoints, `POST /auth/forgot-password` and `POST /auth/reset-password`. Store only a hash of the token, and make it single-use and short-lived. I haven't seen the codebase, so this assumes `users.email` is unique and passwords are already hashed with bcrypt or argon2.

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
   CREATE INDEX ON password_reset_tokens (user_id);
   ```
   If sessions are JWTs, also add `users.password_changed_at timestamptz` (see D2).

2. **`POST /auth/forgot-password`** with body `{ email }`
   - Look up the user with `lower(email) = lower($1)`.
   - If the user exists, delete their unused tokens. Then generate `crypto.randomBytes(32).toString('base64url')`, store `sha256(token)` with `expires_at = now() + 30 min`, and email the link.
   - Always return the same 200 response, whether or not the email matched. Send the email through a queue or after the response, so response time also doesn't reveal which emails have accounts.
   - Rate limit per IP and per email address, for example 5 per hour. Without this, the endpoint can be used to spam any inbox.

3. **Reset link**
   - Build it from a configured `APP_BASE_URL`, never from `req.headers.host`. Otherwise an attacker can send a forged Host header so the victim receives a link pointing to the attacker's domain.
   - Use `https://app/reset-password#token=...`. A fragment is never sent to servers, so the token stays out of access logs and `Referer` headers. The page then POSTs the token to the API.
   - Set `Referrer-Policy: no-referrer` on the reset page.

4. **`POST /auth/reset-password`** with body `{ token, password }`
   - Validate the password with your existing signup rules.
   - Claim the token atomically, so two concurrent requests can't both use it:
     ```sql
     UPDATE password_reset_tokens
     SET used_at = now()
     WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
     RETURNING user_id;
     ```
   - In the same transaction:
     - update `users.password_hash`
     - delete the user's other tokens
     - revoke sessions (D2)
   - Return one generic "invalid or expired link" error for every failure case.

5. **Email sending**
   - Use nodemailer with your provider (D3).
   - Send a separate "your password was changed" notice after a successful reset. It lets the owner react if someone else did the reset.

6. **Cleanup**
   - Run a daily job: `DELETE FROM password_reset_tokens WHERE expires_at < now() - interval '1 day'`.

7. **Tests**
   - Unknown email returns the same response as a known one.
   - Expired, used and wrong tokens are rejected.
   - Two concurrent resets with one token: only one succeeds.
   - Old sessions stop working after a reset.
   - The rate limit returns 429.

## Decisions to make

| Code | Decision | Recommendation |
|---|---|---|
| D1 | Token lifetime | 30 minutes. Longer lifetimes widen the window if an inbox is compromised. |
| D2 | Session revocation | Server sessions: delete the user's rows in the session store. JWTs: reject tokens with `iat < password_changed_at`, which adds a DB or cache read per request. |
| D3 | Email provider | Postmark or SES. Sending from your own SMTP server tends to land in spam, which makes the feature look broken. |

## Risks

- **R1:** Behind a proxy, IP rate limiting only works if `app.set('trust proxy', ...)` is configured correctly. Without it, every request looks like it comes from the proxy's IP.
- **R2:** If existing users have mixed-case emails with duplicates that differ only by case, the `lower()` lookup can match two rows. Check with `SELECT lower(email), count(*) FROM users GROUP BY 1 HAVING count(*) > 1` before shipping.
````

### plan-reset on 3

````markdown
Add a `password_reset_tokens` table, two endpoints (request and confirm), and a transactional email. Store only a hash of the token and make each token single-use and short-lived. This plan is not based on your code, so check the assumptions first.

## Assumptions

- **A1** `users` has a unique `email` and a `password_hash` made with bcrypt or argon2. Reuse that same hashing helper for the new password.
- **A2** Emails are matched the same way signup stores them (for example `lower(email)`). If the match rules differ, some users will never get a reset email.
- **A3** Sessions are either stored on the server or are JWTs. With JWTs, see R1.

## Steps

1. **Migration.** Create `password_reset_tokens` with these columns:
   - `id`
   - `user_id` referencing `users(id)` with `ON DELETE CASCADE`
   - `token_hash text UNIQUE NOT NULL`
   - `expires_at timestamptz NOT NULL`
   - `used_at timestamptz`
   - `created_at`

   Use a separate table rather than columns on `users`. This keeps a record of issued tokens and leaves the users row alone until the reset is actually confirmed.
2. **Token.** Generate it with `crypto.randomBytes(32).toString('base64url')`. Store `sha256(token)` in the table and put only the raw token in the email. SHA-256 is enough because the token is random and long, and it lets you look the token up directly. If the database leaks, the stored hashes cannot be used as reset links.
3. **`POST /auth/password-reset/request { email }`**
   - Always return the same 202 response, whether or not the account exists.
   - Do not `await` the email send before responding. Otherwise response time reveals which emails are registered.
   - If the user exists, delete their unused tokens, insert a new one with a 30 minute expiry, and send the email.
   - Rate limit by IP and by email, for example with `express-rate-limit`. If the app is behind a proxy, set `trust proxy` or every request will count against the proxy's IP.
4. **Email.**
   - Build the link from a configured `APP_BASE_URL`, never from `req.headers.host`. A forged Host header would otherwise send the reset link to an attacker's domain.
   - Send through nodemailer and your existing provider (SES, Postmark or similar).
5. **Reset page.**
   - Serve the page with `Referrer-Policy: no-referrer`, so the token is not passed to third-party scripts or links.
   - The page sends the token in a POST body, not a query string.
   - Strip the token from access logs.
6. **`POST /auth/password-reset/confirm { token, newPassword }`**, in one transaction:
   - Run `SELECT ... WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now() FOR UPDATE`. The row lock stops two concurrent requests from both using the same token.
   - Validate `newPassword` with the same rules as signup.
   - Update `users.password_hash`, set `used_at`, and delete the user's other tokens.
   - Revoke the user's existing sessions and refresh tokens.
   - Return 204. Use one generic error for an invalid, expired or used token.
7. **Confirmation email.** Send a "your password was changed" email so the owner notices if someone else reset it.
8. **Cleanup.** Run a daily job: `DELETE FROM password_reset_tokens WHERE expires_at < now() - interval '1 day'`.
9. **Tests** for:
   - unknown email (same response and similar timing)
   - expired, reused and tampered tokens
   - two confirm requests with the same token at once
   - old sessions rejected after a reset

## Risks

- **R1** Stateless JWTs cannot be revoked. Add `users.password_changed_at` and reject tokens issued before it, or users with a stolen session stay logged in after a reset.
- **R2** Some email security scanners open links automatically. That is harmless only if opening the page does not use up the token, which is why it is consumed on POST in step 6 and not on page load.
- **R3** If the app has no email provider set up yet, that is a dependency outside the code: domain verification, and SPF and DKIM records. Start it first, because reset emails without them tend to land in spam.

Next: confirm A1 and A3 against the existing auth code, since R1 changes step 6.
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
Store an explicit choice in `localStorage`, apply it as a `data-theme` attribute on `<html>` from an inline script before first paint, and let React only toggle that attribute.

I haven't looked at your code. The plan assumes a client-rendered app (Vite or CRA) with the variables defined on `:root`.

## Steps

1. **Dark values in CSS.** Keep the current `:root` block as light. Add a `[data-theme="dark"]` block that overrides only the color variables. Set `color-scheme` in both blocks so native inputs and scrollbars also switch.
   ```css
   :root { color-scheme: light; /* existing vars */ }
   :root[data-theme="dark"] { color-scheme: dark; --bg: #111; --fg: #eee; }
   ```

2. **Inline script in `index.html` `<head>`, before the CSS and the bundle.** React mounts after first paint, so setting the theme from React makes returning dark-mode users see a white flash. If nothing is stored, fall back to the OS setting.
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
   The `try` is needed because `localStorage` throws when storage is blocked, for example with some privacy settings.

3. **`useTheme` hook.** Initialize state from `document.documentElement.dataset.theme`, not from `localStorage`, so React and the page agree on the first render.
   ```js
   export function useTheme() {
     const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'light');
     const toggle = () => {
       const next = theme === 'dark' ? 'light' : 'dark';
       document.documentElement.dataset.theme = next;
       try { localStorage.setItem('theme', next); } catch (e) {}
       setTheme(next);
     };
     return { theme, toggle };
   }
   ```
   Use a context only if more than the toggle button needs to read `theme`. Components that only need colors already get them through the CSS variables.

4. **Toggle button.** A `<button>` with `aria-pressed={theme === 'dark'}` and a text or `aria-label`, placed wherever global controls live.

## Decisions

- **Only save explicit choices.** A first-time visitor follows the OS setting, and nothing is written until they click. The downside is that a user can't go back to "follow system" without a third option. Add a light/dark/system control only if someone asks for it.
- **Don't listen for live OS theme changes.** Skipping this keeps the hook simple. Add a `matchMedia` change listener only if following system changes mid-session matters to you.

## Risks

- **Hardcoded colors won't switch.** Any color set directly instead of through a variable stays light, including inline styles, third-party component CSS, SVG `fill` values and images with white backgrounds. Grep for hex, `rgb(` and named colors before calling this done.
- **Server rendering needs extra setup.** If the app is Next.js or uses another SSR setup, the inline script goes in the root document and `<html>` needs `suppressHydrationWarning`. Otherwise React warns about the attribute mismatch.

Next: grep the stylesheets for hardcoded colors to size step 1.
````

### plan-darkmode on 2

````markdown
Plan: set a `data-theme` attribute on `<html>`, override the CSS variables under it, and apply the stored choice in an inline script before React loads so there is no flash of the wrong theme.

## Steps

1. **CSS overrides.** Keep the current variables as the light theme on `:root` and add a dark block. Set `color-scheme` so scrollbars, form controls and autofill also switch.
   ```css
   :root { color-scheme: light; /* existing vars */ }
   [data-theme="dark"] { color-scheme: dark; --bg: #111; --text: #eee; /* ... */ }
   ```
2. **Inline script in `index.html` `<head>`**, before the CSS and bundle. React effects run after first paint, so setting the theme there makes dark users see a white flash on every load.
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
3. **`useTheme` hook** (or a small context if several components read it). Initialize state from `document.documentElement.dataset.theme` so it matches what the script set. On change, write the attribute and `localStorage.setItem('theme', t)` inside `try/catch`, because storage throws when it is blocked.
4. **Toggle component** that calls the hook's setter. Use `aria-pressed` or a label that names the target theme.
5. **Audit for colors outside variables.** Search for hard-coded hex, `rgb(`, inline `style` colors, SVG `fill`, and third-party component themes. These will not switch and are usually most of the real work.

## Decisions

- **D1: Two states or three.** A light/dark toggle is simpler, but once a user clicks it they stop following their OS setting. Add a "system" option only if that matters. It requires storing `system` and listening to the `matchMedia` change event.
- **D2: Sync across tabs.** A `storage` event listener updates other open tabs. Without it, other tabs keep the old theme until they reload.

## Assumptions

- The app is client-rendered (Vite or CRA). With Next.js or other SSR, put the script in the document head via the framework's script mechanism and render the toggle icon only after mount. Otherwise the server HTML and the client theme differ and cause a hydration mismatch.
- The script must be inline, not an external file, or it cannot run before first paint. If a Content Security Policy blocks inline scripts, add a hash or nonce for it.

Next: run the step 5 search first, since its size decides how long this takes.
````

### plan-darkmode on 3

````markdown
Store the choice in `localStorage`, apply it as a `data-theme` attribute on `<html>` from an inline script before React loads, and let a small hook own the toggle.

## Steps

1. **CSS.** Keep current values as the light theme under `:root` and add a dark override block. `color-scheme` makes native scrollbars, form controls and autofill match, which variables alone do not.
   ```css
   :root { color-scheme: light; --bg: #fff; --text: #111; }
   :root[data-theme="dark"] { color-scheme: dark; --bg: #111; --text: #eee; }
   ```

2. **Inline script in `index.html` `<head>`.** This must run before first paint. A `useEffect` runs after paint, so saved-dark users would see a white flash on every load.
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
   The `try` is there because `localStorage` throws when storage is blocked, such as in some private modes and sandboxed iframes.

3. **`useTheme` hook.** Initialize from the attribute the script already set, so the DOM stays the single source of truth and the script and React cannot disagree.
   ```js
   export function useTheme() {
     const [theme, setTheme] = useState(() => document.documentElement.dataset.theme);
     useEffect(() => {
       document.documentElement.dataset.theme = theme;
       try { localStorage.setItem('theme', theme); } catch {}
     }, [theme]);
     const toggle = () => setTheme(t => (t === 'dark' ? 'light' : 'dark'));
     return { theme, toggle };
   }
   ```
   Wrap it in a context only if more than the toggle button needs to read the theme.

4. **Toggle button.** Use `aria-pressed={theme === 'dark'}` or a label that names the target, like "Switch to light theme", so screen readers announce the state.

## Decisions for you

- **D1: System preference.** With the plan above, the OS setting only picks the theme until the first click, and after that the saved choice always wins. If you want a "system" option that keeps following OS changes, store three values (`light`, `dark`, `system`) and add a `matchMedia` change listener. That means a 3-way control instead of a toggle.
- **D2: Cross-tab sync.** Other open tabs keep the old theme until reload. Adding a `storage` event listener in the hook fixes this in about 5 lines.

## Risks

- **R1: Colors outside variables will not switch.** Hardcoded hex values in CSS or inline styles, SVGs with fixed `fill`, images, and third-party widgets stay unchanged. Grep for `#[0-9a-f]{3,6}` and `rgb(` before calling it done.
- **R2: SSR breaks step 3.** If this is Next.js or any SSR setup, `document` does not exist on the server. Initializing state from it will crash or cause a hydration mismatch. You would need `suppressHydrationWarning` on `<html>` and a toggle icon that renders only after mount. The plan assumes a client-only app such as Vite or CRA.
- **R3: CSP blocks the inline script.** If you have a Content Security Policy, the script in step 2 needs a nonce or hash.
````
