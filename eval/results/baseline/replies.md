# Replies: baseline

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
A database index is a separate data structure, usually a B-tree, that stores sorted values from one or more columns with pointers to their rows. The database can then find matching rows without scanning the whole table.

## What an index speeds up
- `WHERE` lookups on the indexed columns
- `JOIN` conditions on the indexed columns
- `ORDER BY` and `GROUP BY`, when the index order matches
- Queries answered entirely from the index (covering index), with no table read

## Cost of every index
- Every `INSERT` and `DELETE` must update each index on the table.
- Every `UPDATE` that touches an indexed column must update that index.
- It uses disk space and memory in the buffer cache.
- The query planner has more plans to evaluate.

## When an index makes performance worse

| Code | Case | Why it hurts |
|---|---|---|
| F1 | Write-heavy tables (logs, events, queues) | Each write pays the index cost, but few reads benefit. |
| F2 | Low-selectivity columns (booleans, status with 3 values) | The index matches a large share of rows. Random row lookups then cost more than a sequential scan. |
| F3 | Small tables | A full scan fits in a few pages and is already fast. The index adds a lookup step. |
| F4 | Redundant indexes | An index on `(a)` is covered by an existing one on `(a, b)`. This doubles write cost for no read gain. |
| F5 | Frequently updated indexed columns | Each change moves the entry within the index, causing churn, bloat, and page splits. |
| F6 | Too many indexes on one table | Write latency grows with each index, and indexes compete for cache memory, which pushes hot data out. |
| F7 | Random keys such as UUIDv4 on a clustered or B-tree index | Inserts land at random positions, which causes page splits, fragmentation, and poor cache locality. |
| F8 | Planner picks the index incorrectly | Stale statistics can make the planner choose an index scan that is slower than a table scan. |
| F9 | Bulk loads | Maintaining indexes row by row is much slower than dropping them and rebuilding after the load. |

## When an index exists but goes unused
- Functions on the column, such as `WHERE LOWER(email) = ...`, unless you create an expression index
- Leading wildcards, such as `LIKE '%foo'`
- Composite indexes queried without their leading column
- Implicit type casts in the comparison

In these cases you pay the write cost and get no read benefit.

## Rule of thumb
Add an index for a specific slow query you have measured. Confirm the plan with `EXPLAIN ANALYZE`. Periodically remove unused indexes, for example those with `idx_scan = 0` in PostgreSQL's `pg_stat_user_indexes`.
````

### explain-index on 2

````markdown
A database index is a separate, sorted data structure (usually a B-tree) that maps column values to row locations. The database uses it to find matching rows without scanning the whole table.

## How it works
- **Without an index:** `WHERE email = 'x'` reads every row, which is O(n).
- **With an index on `email`:** the database walks the B-tree to the matching entries, which is O(log n), then fetches only those rows.
- **Cost:** every index is another copy of the indexed columns. It uses disk and memory, and it must be updated whenever the table changes.
- **Composite indexes** like `(a, b)` help queries that filter on `a` or on `a` and `b`. Filtering on `b` alone gets little or no benefit.

## When an index makes performance worse

| Code | Situation | Why it hurts |
|---|---|---|
| W1 | Write-heavy tables | Every INSERT, DELETE and UPDATE of an indexed column must also update each index. With many indexes, writes slow down and lock contention and log volume go up. |
| W2 | Low-selectivity columns (`is_active`, `status`) | If a value matches a large share of the table, looking up each row through the index means random reads. That is slower than one sequential scan. |
| W3 | Wrong plan from the query planner | With stale statistics or skewed data, the planner can pick a worse index. A common case is `ORDER BY created_at LIMIT 10` walking the index and throwing away millions of rows that fail the filter. |
| W4 | Redundant indexes | An index on `(a)` next to one on `(a, b)` adds write cost and memory use but no read gain. |
| W5 | Memory pressure | Indexes compete with table data for the buffer pool. Once they no longer fit in RAM, cache misses rise for all queries. |
| W6 | Random keys (UUIDv4) as the primary key in MySQL/InnoDB or SQL Server clustered tables | Inserts land on random pages, which causes page splits, fragmentation and poor cache locality. |
| W7 | Index on a column that is updated often (PostgreSQL) | PostgreSQL can no longer do its cheap in-page (HOT) updates on that table, so table and index bloat grow. |
| W8 | Building an index on a large live table | A plain `CREATE INDEX` blocks writes until it finishes. Use `CREATE INDEX CONCURRENTLY` in PostgreSQL or `ONLINE = ON` in SQL Server. |

## Deciding whether to add one
- Add an index only for queries that run often and match a small share of rows.
- Compare the plan with `EXPLAIN ANALYZE` before and after on data the size of production. Small test tables hide W2 and W3.
- Remove indexes that never get used. In PostgreSQL, look for `idx_scan = 0` in `pg_stat_user_indexes`. Stats reset on restart, so check over a period that covers all your workloads first.
````

### explain-index on 3

````markdown
A database index is a separate sorted data structure, usually a B-tree, that maps column values to row locations so the database can find matching rows without scanning the whole table.

## What it does
- Turns lookups, range filters, `ORDER BY`, and joins on the indexed columns from a full table scan (O(n)) into a tree search (O(log n)).
- Stores a copy of the indexed column values plus a pointer to each row, so it uses its own disk space and memory.
- Is maintained by the database on every write to the table.

## When an index makes performance worse

| Code | Case | Why it hurts |
|------|------|--------------|
| W1 | Write-heavy tables | Every `INSERT`, `UPDATE` of an indexed column, and `DELETE` must also update each index. Ten indexes means roughly ten extra writes per row change. |
| W2 | Low-selectivity columns | On a column like `status` with 3 values, a query matching 30% of rows is faster as a sequential scan. Following the index costs a random I/O per row. If the planner picks the index anyway, often due to stale statistics, queries slow down. |
| W3 | Redundant or overlapping indexes | An index on `(a)` is usually covered by an existing index on `(a, b)`. The extra one adds write cost and memory pressure with no read benefit. |
| W4 | Memory pressure | Indexes compete with table data for the buffer cache. Too many indexes push hot data out of RAM and increase disk reads for everything. |
| W5 | Small tables | A table that fits in a few pages is scanned faster than the index is traversed. |
| W6 | Wide or random keys | Large keys (long strings) make the tree deeper and bigger. Random keys like UUIDv4 as a clustered primary key cause page splits and fragmentation on insert. |
| W7 | Bulk loads | Maintaining indexes row by row during a large import is much slower than dropping them, loading, then rebuilding. |
| W8 | Index builds on live tables | Creating an index can lock the table or consume heavy I/O. In PostgreSQL use `CREATE INDEX CONCURRENTLY`. In MySQL check that the `ALTER` is online for your engine and version. |

## When an index is ignored, so it only costs
- Functions or casts on the column: `WHERE LOWER(email) = ...` skips an index on `email` unless it is an expression index.
- Leading wildcards: `LIKE '%foo'` cannot use a B-tree.
- Wrong column order: an index on `(a, b)` does not help `WHERE b = ?`.
- Type mismatches between the column and the parameter.

## How to decide
1. Find the slow query and run `EXPLAIN ANALYZE` (PostgreSQL) or `EXPLAIN` (MySQL).
2. Add the index and compare the plan and timing on production-sized data.
3. Check write latency on the table afterward.
4. Remove unused indexes periodically. In PostgreSQL, `pg_stat_user_indexes` with `idx_scan = 0` shows candidates.
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
A process has its own memory space. A thread runs inside a process and shares that process's memory with the other threads in it.

## Differences

| Aspect | Process | Thread |
|---|---|---|
| Memory | Separate address space | Shares heap and globals, has its own stack |
| Communication | IPC: pipes, sockets, shared memory, message queues | Direct access to shared variables |
| Crash impact | A crash stays inside that process | A crash kills the whole process |
| Creation cost | Higher. On Windows, `CreateProcess` is especially slow | Lower |
| Context switch | Slower, because the address space changes | Faster |
| Sync bugs | Rare, because nothing is shared by default | Data races and deadlocks are common. You need locks or atomics |
| Security boundary | Yes, the OS enforces isolation | No |

## Pick processes when

- **Isolation matters:** you run untrusted code or plugins, or one component failing must not take down the others. Browsers use one process per tab for this reason.
- **Your runtime has a global lock:** CPU-bound Python work under the GIL needs `multiprocessing`. Python 3.13+ free-threaded builds relax this, but many libraries don't support them yet.
- **You need to scale past one machine later:** code that already talks through IPC moves to network messaging easily.
- **Components need different privileges or lifecycles:** for example, a sandboxed renderer or a worker you can restart on its own.

## Pick threads when

- **Tasks share a lot of state:** copying that state between processes would cost more than locking it.
- **CPU-bound work runs in a runtime without a global lock:** C, C++, Rust, Go, Java, and .NET use all cores with threads.
- **Low latency matters:** threads avoid IPC serialization and slow startup.
- **You need many workers:** hundreds of threads are fine. Hundreds of processes waste memory.

## Consider neither for I/O-bound work

- For many concurrent network or disk waits, async I/O (`async/await`, epoll, IOCP) handles thousands of connections on a few threads with less memory than one thread per connection.

## Risks

- **R1:** Shared memory between threads leads to races that tests often miss. Use tools like ThreadSanitizer, or pass messages over channels.
- **R2:** Processes cost more per request if you spawn them often. Use a pool instead of creating one per task.
- **R3:** `fork` in a multithreaded program copies only the calling thread, and locks held by the others can stay locked forever. Spawn fresh processes instead.
````

### explain-thread on 2

````markdown
A process has its own memory space. A thread runs inside a process and shares that process's memory with the other threads in it.

## Differences

| Aspect | Process | Thread |
|---|---|---|
| Memory | Separate address space | Shared heap and globals, own stack |
| Isolation | A crash or memory bug stays in that process | A crash or memory bug can take down the whole process |
| Creation and switching cost | Higher | Lower |
| Communication | IPC (pipes, sockets, shared memory, message queues) | Direct access to shared data |
| Data safety | No shared state by default | Needs locks, atomics or channels to avoid races |
| Security boundary | Yes, can drop privileges or sandbox | No |
| Scaling | Can spread across machines | Limited to one machine |

## Pick processes when

- **Isolation matters:** untrusted code, plugins, browser tabs, or workers that may crash or leak memory.
- **Security matters:** you need separate privileges or sandboxing per unit.
- **The runtime blocks parallel threads:** CPython with the GIL (before free-threaded 3.13+ builds) runs CPU-bound Python code on one core at a time, so use `multiprocessing`.
- **Work is independent:** little shared state, so IPC cost stays low.
- **You may scale out later:** a process design moves to multiple machines more easily.

## Pick threads when

- **Tasks share a lot of data:** copying it over IPC would be too slow.
- **You need many parallel units cheaply:** thread pools in Java, C#, Go, Rust or C++.
- **Latency between tasks matters:** no serialization or context-switch overhead from IPC.
- **CPU-bound work runs in a runtime with real thread parallelism:** JVM, .NET, native code.

## Pick neither when

- **The work is mostly I/O waiting** (network servers, API calls). Async I/O (`async`/`await`, event loops) or green threads handle thousands of connections with less overhead than one thread or process per connection.

## Risks
- **R1:** Threads give you data races, deadlocks and bugs that are hard to reproduce. Plan the sync strategy up front.
- **R2:** Processes cost more memory and startup time. On Windows there is no `fork`, so spawning a process is slower than on Linux.
- **R3:** A common default is processes for isolation plus threads or async inside each one. Web servers like Gunicorn and Nginx work this way.
````

### explain-thread on 3

````markdown
A process has its own memory space. A thread runs inside a process and shares that process's memory with the other threads in it.

## Differences

| Aspect | Process | Thread |
|---|---|---|
| Memory | Separate address space | Shared with other threads in the process |
| Crash impact | Only that process dies | One bad thread can take down the whole process |
| Creation and switch cost | Higher (new address space, handles, page tables) | Lower |
| Communication | IPC: pipes, sockets, shared memory, message queues | Direct access to the same variables |
| Data safety | Isolated by default | Needs locks or other synchronization to avoid races |
| Scaling | Can spread across machines | One machine only |

## Pick processes when

- **Isolation matters.** Untrusted code, plugins, or components that crash often. Browsers run each tab this way.
- **Security boundaries are needed.** Different privileges or sandboxing per worker.
- **Your runtime blocks parallel threads.** CPython's GIL stops threads from running Python code in parallel on CPU-bound work, so use `multiprocessing` there. Free-threaded Python 3.13+ changes this, but many C extensions don't support it yet.
- **You may later scale across hosts.** Message passing between processes moves to a network more easily than shared memory does.

## Pick threads when

- **Workers share a lot of state.** Copying or serializing that state between processes would cost too much.
- **Tasks are many, small and short-lived.** Process startup cost would dominate, especially on Windows, which has no `fork`.
- **You need low-latency coordination.** Examples are a UI thread plus background workers, or a game loop plus asset loading.
- **Work is I/O-bound.** Threads spend most of their time waiting, so the GIL and switch overhead don't matter much. For very high concurrency, async I/O on one thread often beats both.

## Risks with threads

- R1: Race conditions and deadlocks. These bugs don't show up reliably and are hard to reproduce.
- R2: Memory corruption in one thread breaks every thread, because they all share the same memory.
- R3: Adding more threads than you have cores doesn't speed up CPU-bound work. Extra switching can make it slower.

## Default

Use threads, or a thread pool, for I/O-bound or tightly coupled work inside one trusted program. Use processes when you need fault isolation, a security boundary, or true CPU parallelism in a runtime with a GIL.
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
`forEach` ignores the promise each async callback returns, so it kicks off every write and returns right away. `console.log("saved")` runs while the writes are still in progress.

- `await` inside the callback only pauses that callback, not `saveAll`.
- `saveAll`'s own promise also resolves before the files are written, so `await saveAll(items)` doesn't wait for the writes.
- If a write fails, the error becomes an unhandled rejection that `saveAll` never sees.

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

If you need to write one file at a time, for example to limit open file handles, use a loop:

```js
for (const item of items) {
  await fs.promises.writeFile(`out/${item.id}.json`, JSON.stringify(item));
}
```

With `Promise.all`, the first failed write rejects `saveAll`, but the other writes keep going. Use `Promise.allSettled` if you need the result of every write.
````

### debug-foreach on 2

````markdown
`forEach` doesn't wait for async callbacks. It starts every write and returns right away, so `console.log("saved")` runs before any write finishes.

- `forEach` ignores what the callback returns. Each `async` callback returns a promise, and nothing waits for it.
- Because nothing waits for those promises, `saveAll` also finishes before the files are written. Any `await saveAll(...)` in your code has the same bug.
- If a write fails, the error becomes an unhandled promise rejection. The caller never sees it.

## Fix

To write all files at the same time:

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

To write one file at a time:

```js
async function saveAll(items) {
  for (const item of items) {
    await fs.promises.writeFile(`out/${item.id}.json`, JSON.stringify(item));
  }
  console.log("saved");
}
```

## Choosing
- **`Promise.all`:** faster. With thousands of items it can hit the limit on open files (`EMFILE`). It rejects on the first failure, but the other writes keep running.
- **`for...of`:** slower, but only one file is open at a time. It stops at the first failure.
````

### debug-foreach on 3

````markdown
`forEach` ignores the promises your async callback returns, so `saveAll` never waits for the writes.

- Each callback runs until its first `await`, starts `writeFile`, and returns a pending promise.
- `forEach` throws those promises away and returns right away.
- `console.log("saved")` runs next, while the writes are still in progress.
- `saveAll` resolves before the writes finish, so `await saveAll(items)` doesn't wait for them either.
- If a write fails, the promise rejects with nothing handling it. Callers never see the error, and Node may crash the process with an unhandled rejection.

## Fix

To write all files in parallel:

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

To write one file at a time:

```js
async function saveAll(items) {
  for (const item of items) {
    await fs.promises.writeFile(`out/${item.id}.json`, JSON.stringify(item));
  }
  console.log("saved");
}
```

- `Promise.all` rejects on the first failed write, but the other writes keep going. Use `Promise.allSettled` if you need the result of every write.
- If the list is very large, the parallel version can hit the open file limit (`EMFILE`). In that case, use the loop or write in batches.
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
The default list is created once, when the function is defined, and every call without a `tags` argument reuses that same list.

## Fix

Use `None` as the default and create a new list inside the function:

```python
def add_tag(tag, tags=None):
    if tags is None:
        tags = []
    tags.append(tag)
    return tags
```

## Why it happens
- Python evaluates default values once, at `def` time, not on each call.
- `tags.append` changes that shared list in place, so tags from earlier calls stay in it.
- `add_tag.__defaults__` shows the leftover tags.

## Behavior to check
- Callers that pass their own list still have that list changed in place. Use `tags = list(tags)` before appending if they should get a copy instead.
- Code that relied on tags building up across calls will break with this fix. Search for callers that do this before changing it.
````

### debug-default-arg on 2

````markdown
The default list is created once, when the function is defined, and every call without `tags` reuses that same list.

## Why
- Python evaluates default argument values one time, when `def` runs, not on each call.
- `tags.append(tag)` changes that shared list in place, so the tags pile up across calls.

```python
add_tag("a")  # ['a']
add_tag("b")  # ['a', 'b']
```

## Fix
Use `None` as the default and create a new list inside the function:

```python
def add_tag(tag, tags=None):
    if tags is None:
        tags = []
    tags.append(tag)
    return tags
```

## Caveat
- If a caller passes in their own list, it still gets changed in place. If callers shouldn't see that change, copy it first with `tags = list(tags)`.
````

### debug-default-arg on 3

````markdown
The default list `[]` is created once, when the function is defined, so every call that skips `tags` appends to that same list.

## Why
- Python evaluates default values one time, at `def`, not on each call.
- `tags.append` changes that one shared list in place.
- `add_tag("a")` returns `["a"]`, then `add_tag("b")` returns `["a", "b"]`.

## Fix
Use `None` as the default and create a new list inside the function:

```python
def add_tag(tag, tags=None):
    if tags is None:
        tags = []
    tags.append(tag)
    return tags
```

## Risk
- If you pass in your own list, the function still changes that list. To leave the caller's list untouched, return a new list with `return [*(tags or []), tag]`.
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
Your container stops because `service nginx start` starts nginx as a background daemon and then exits, and Docker stops the container when PID 1 exits.

## Why
- The `CMD` process runs as PID 1. The container lives only as long as PID 1 does.
- `service nginx start` runs the init script, which starts nginx in the background and returns right away.
- Once the script returns, PID 1 is gone, so the container exits. The nginx it started goes with it.

## Fix
Run nginx in the foreground as PID 1:

```dockerfile
CMD ["nginx", "-g", "daemon off;"]
```

- `daemon off;` keeps nginx in the foreground.
- The exec (JSON array) form makes nginx PID 1 with no shell in between. It then gets `SIGTERM` from `docker stop` and shuts down cleanly.

## Avoid
- `CMD service nginx start && tail -f /dev/null` keeps the container up, but Docker would be watching `tail` instead of nginx. If nginx crashes, the container keeps running. Stop signals also don't reach nginx.

## Check
```
docker run -d -p 8080:80 myimage
docker ps
docker logs <container>
```
If it still exits, `docker logs` will show the nginx error, such as a config syntax error.
````

### debug-docker on 2

````markdown
`service nginx start` launches nginx in the background and returns right away. The container stops when its main process (PID 1) exits, so it stops as soon as that command finishes.

## Fix
Run nginx in the foreground as the main process:

```dockerfile
CMD ["nginx", "-g", "daemon off;"]
```

- **`daemon off;`** keeps nginx in the foreground, so the container keeps running.
- **Exec form (JSON array)** makes nginx PID 1 instead of a shell. `docker stop` then reaches nginx and it shuts down cleanly.

## Also check
- **Logs:** Ubuntu's nginx package writes logs to `/var/log/nginx/`, so `docker logs` will show nothing. To see them there, add this to the Dockerfile:
  ```dockerfile
  RUN ln -sf /dev/stdout /var/log/nginx/access.log && ln -sf /dev/stderr /var/log/nginx/error.log
  ```
- **Config errors:** if it still exits after the fix, run `docker logs <container>` or `docker run --rm myimage nginx -t` to check for a bad nginx config.
- **Simpler base:** the official `nginx` image already has the foreground setup and log redirects built in, if you don't need Ubuntu.
````

### debug-docker on 3

````markdown
The container exits because `service nginx start` starts nginx as a background daemon and then returns. Docker stops the container when the main process (PID 1) exits.

## Fix
Run nginx in the foreground so it stays PID 1:

```dockerfile
CMD ["nginx", "-g", "daemon off;"]
```

## Notes
- **Use the exec (JSON array) form.** The shell form `CMD nginx ...` runs nginx under `/bin/sh -c`. Then nginx is not PID 1 and does not receive `SIGTERM` from `docker stop`, so the container waits out the timeout and gets killed.
- **Logs.** Ubuntu's nginx writes to `/var/log/nginx/*.log`, so `docker logs` shows nothing. If you want logs there, add this before the `CMD`:
  ```dockerfile
  RUN ln -sf /dev/stdout /var/log/nginx/access.log && ln -sf /dev/stderr /var/log/nginx/error.log
  ```
- **Alternative base image.** The official `nginx` image already does all of this. Use it unless you need Ubuntu for another reason.

## Verify
```sh
docker run -d -p 8080:80 myimage
docker ps
curl localhost:8080
```

If it still exits, run `docker logs <container>`. A config error makes nginx exit at startup, and that error will show up there.
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

- **Relational data:** a user has many orders, an order has many invoices. Foreign keys and joins fit this directly.
- **Transactions:** creating an order, its invoice and a stock or balance update must succeed or fail together. PostgreSQL has had full ACID transactions from the start. MongoDB added multi-document transactions later, and they cost more and are easier to misuse.
- **Enforced integrity:** `NOT NULL`, `UNIQUE`, `CHECK` and foreign keys stop orphaned invoices and duplicate invoice numbers at the database level. In MongoDB, your application code has to enforce this.
- **Money:** use the `numeric` type for exact amounts. Floats cause rounding errors.
- **Reporting:** revenue per month, unpaid invoices and top customers are simple SQL queries. The same reports take more work in MongoDB's aggregation pipeline.
- **Flexible fields:** if some data varies in shape, like product attributes or payment provider payloads, store it in a `jsonb` column. You don't need a second database for it.

## When MongoDB would be the better pick
- Most of your data has no fixed shape and you rarely query across entities.
- You expect write volume that one Postgres primary can't handle, and you need built-in sharding from day one. That is uncommon for a new app, so check it against real numbers before choosing on that basis.

## Assumption
- A1: You have no existing MongoDB setup or team skills that would change the cost of running it.
````

### compare-db on 2

````markdown
Use PostgreSQL.

- **The data is relational.** An order belongs to a user and an invoice belongs to an order. Foreign keys enforce those links, so you cannot end up with an invoice pointing at a deleted order.
- **Money needs ACID transactions.** Creating an order, reserving stock and issuing an invoice should succeed or fail together. Postgres has always worked this way. MongoDB supports multi-document transactions, but they are an add-on to its design, not the default path.
- **Invoices need a fixed structure.** Tax, totals and legal fields should follow a strict schema with `NUMERIC` amounts and `CHECK` constraints. Mongo's flexible schema is a drawback for this kind of data.
- **Reporting is SQL.** Revenue per month, unpaid invoices per customer and similar questions are simple joins and aggregates.
- **You still get flexibility.** A `JSONB` column can hold the parts that vary, such as product attributes or payment provider payloads.

## When MongoDB would be the better choice
- Most of your data has no fixed shape and is read as whole documents with few cross-entity queries. Users, orders and invoices do not fit that description.
- Your team already runs Mongo in production and has no Postgres experience.

## Assumption
- A1: This is a normal-sized app. Postgres on a single node with read replicas handles millions of orders. If you expect write volume beyond one node from day one, that changes the question, but most apps never reach that point.
````

### compare-db on 3

````markdown
**Use PostgreSQL.** Users, orders and invoices are relational financial data, and that is what PostgreSQL is built for.

## Why
- **Relationships:** users have orders and orders have invoices. Foreign keys stop you from creating an invoice for an order that doesn't exist, or deleting a user who still has orders.
- **Transactions:** creating an order, its invoice and a payment record must all succeed or all fail. PostgreSQL does this by default. MongoDB supports multi-document transactions, but it was designed around single documents, and you have to opt in for every write.
- **Constraints:** unique invoice numbers, non-negative totals and required fields are enforced by the database, not only by app code.
- **Reporting:** revenue per month, orders per customer and unpaid invoices are simple SQL joins and aggregates. The same queries are more awkward in MongoDB's aggregation pipeline.
- **Flexible data:** `jsonb` columns cover the few fields that really vary, such as product attributes or metadata. You don't need a document database for that.

## When MongoDB would be the better choice
- Most data is independent documents with no joins, such as event logs or a CMS.
- The schema changes often and you don't need data integrity guarantees.
- Neither describes a system with orders and invoices.

## Design risks for either database
- **R1:** Store money as `numeric(12,2)` or integer cents, never `float`, which causes rounding errors.
- **R2:** Freeze each invoice when you issue it. Copy line items, prices, tax and the billing address into the invoice rows instead of pointing to current product or user data. Otherwise past invoices change when a price or address changes.
- **R3:** Generate invoice numbers with a sequence or a locked counter table. Many countries require gapless sequential numbers, and computing `max + 1` in app code creates duplicates when two invoices are issued at once.

## Assumption
- **A1:** This is a typical web app, not one with extreme write volume or multi-region needs. At that scale, PostgreSQL is still the default choice but needs more planning.
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
**Use REST (HTTP/JSON with an OpenAPI spec)** unless one of the gRPC triggers below applies.

## Why REST for your setup
- Five people running eight services means ops time is the constraint. REST can be debugged with curl, browser dev tools, and the logs and ingress you already have.
- Kubernetes Services balance REST traffic across pods without extra work.
- An OpenAPI spec with generated clients gives you most of the typed-contract benefit of gRPC.
- Your external APIs are probably already REST, so you keep one stack.

## Switch to gRPC if any of these apply
- You need streaming, such as server push, bidirectional flows, or long-lived feeds.
- Serialization or latency shows up in profiles on busy call paths. Assume it doesn't until you measure it.
- Services in several languages keep breaking each other's contracts, and OpenAPI discipline hasn't fixed that.

## Risks if you pick gRPC
- **R1:** gRPC keeps HTTP/2 connections open for a long time, so a standard Kubernetes Service sends all of a client's calls to one pod. Fixing this takes a headless Service with client-side load balancing, or a service mesh such as Linkerd or Istio. It is the most common production surprise.
- **R2:** Debugging needs grpcurl or similar tools, and proto files need a shared repo plus versioning rules.
- **R3:** Browsers and external clients can't call gRPC directly, so they need a gateway or grpc-gateway.

## Assumptions
- **A1:** Nothing is streaming-heavy or latency-critical today.
- **A2:** Your team doesn't already run protobuf tooling or a mesh. If it does, gRPC costs much less to adopt.

If you do go gRPC later, you don't have to switch everything. Use it only on the service pairs that meet a trigger.
````

### compare-rpc on 2

````markdown
Use REST (HTTP/JSON with an OpenAPI spec) unless one of the gRPC triggers below applies to you.

## Why REST fits a team of five
- **Tooling:** curl, browser dev tools, logs and API gateways read JSON directly. gRPC needs grpcurl, reflection and proto-aware proxies.
- **Kubernetes load balancing:** gRPC keeps HTTP/2 connections open for a long time, so a standard ClusterIP Service sends all calls from one client pod to one server pod. Fixing that means a headless Service with client-side load balancing, or a service mesh such as Linkerd or Istio. Five people shouldn't take on that work without a clear payoff.
- **Contracts:** Generating clients from OpenAPI gets you most of the typed-contract benefit people want from protobuf.
- **Hiring and onboarding:** Anyone new already knows REST.

## When to pick gRPC instead
| Code | Trigger |
|---|---|
| O1 | You need streaming, either server push or bidirectional |
| O2 | Heavy call volume where JSON encoding or latency shows up in profiles |
| O3 | Services in 3 or more languages where strict schema evolution rules matter |
| O4 | You already run a service mesh, so the load balancing problem is already handled |

## Assumptions
- A1: None of O1 to O4 applies today. If one does, use gRPC for those specific calls only. Mixing is fine.
- A2: The services talk to each other synchronously. If most of the traffic is events, a queue matters more than this choice.

## Risk
- R1: REST without a spec drifts over time. Require an OpenAPI file per service and generate clients from it in CI.
````

### compare-rpc on 3

````markdown
**Use REST (HTTP/JSON) with OpenAPI specs.** Five people running eight services will lose more time to gRPC tooling and operations than they gain in speed.

## Why REST
- **Debugging:** curl, browser devtools, logs and proxies can read the traffic directly. With gRPC you need grpcurl and the proto files.
- **No codegen pipeline:** gRPC needs a shared proto repo, versioned generated clients and a codegen step in CI for every service. That is ongoing work for a small team.
- **Contracts:** OpenAPI gives you typed clients and schema checks, which covers most of what gRPC's contracts would give you.
- **Kubernetes works as is:** ingress, health checks and most observability tools handle HTTP/1.1 JSON without setup.

## gRPC risk on Kubernetes
- **R1:** A normal ClusterIP Service balances per connection. gRPC keeps HTTP/2 connections open for a long time, so one client pod can send all its traffic to a single server pod. To fix it you need a headless Service with client-side load balancing, or a service mesh (Linkerd, Istio). Either one is more to run.
- **R2:** Proto changes that break compatibility, such as renumbering or reusing field numbers, fail silently at runtime. You need linting like `buf breaking` in CI to catch them.

## When to switch to gRPC
Switch only for the service pair that needs it, not the whole system.
- You need streaming, such as server push or bidirectional streams.
- A measured latency or CPU problem traces back to JSON serialization on a high-traffic path.
- Payloads are large and bandwidth costs you money.

## Assumptions
- **A1:** Calls are mostly request/response, with no streaming today.
- **A2:** No one has measured a performance problem between services.
- **A3:** You don't already run a service mesh. If you do, R1 mostly goes away and gRPC costs less, but the codegen work still makes REST the better default.
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
`request()` in `src/http.js` now retries failed requests with exponential backoff and has a longer timeout.

## Changes
- **Retries:** new third parameter `retries`, default 3, so up to 4 attempts. Existing callers keep working without changes.
- **Retry triggers:** HTTP 5xx responses, and any error thrown inside the `try`, including network errors and timeouts.
- **Backoff:** waits 500ms, 1s, then 2s between attempts, with no jitter.
- **Timeout:** 10s to 30s per attempt.
- **After the last attempt:** the last error is thrown. A final 5xx throws `HTTP <status>`.

## Risks
- **R1, bug:** 4xx responses are also retried. The `throw new Error(...)` for `!res.ok` is inside the `try`, so the `catch` retries it. A 404 or 401 makes 4 attempts and waits 3.5s before failing. Either check `err` in the `catch` or move the 4xx throw out of the `try`.
- **R2:** Non-idempotent requests like POST and PATCH get retried too. After a timeout or a 5xx, the server may already have applied the request, so a retry can apply it twice.
- **R3:** A failing call can now take about 123.5s before it throws: 4 attempts × 30s plus 3.5s of backoff. Callers that relied on failing within 10s will now wait much longer.
- **R4:** The retry does not replace `options.signal` with a caller signal. `AbortSignal.timeout` still overrides any `options.signal`, so callers can't cancel, and now that covers the whole retry loop. This existed before the change but matters more with retries.
- **R5:** If `options.body` is a stream, it's used up by the first attempt, so retries send an empty or broken body.
- **R6:** Without jitter, many clients that fail at once all retry at the same moments, which adds load to a server that is already failing.

## Notes
- `return res.json()` is not awaited inside the `try`, so a JSON parse error rejects right away without a retry. That's probably the right behavior, but it's easy to break if someone adds `await` later.
- The diff has no tests.
````

### summarize-retry on 2

````markdown
This change adds retry with exponential backoff to `request()` in `src/http.js` and raises the per-attempt timeout from 10s to 30s.

## Behavior changes
- **New parameter:** `retries`, default 3, so up to 4 attempts in total.
- **Retried:** 5xx responses, network errors and timeouts.
- **Backoff:** 500ms, 1000ms, then 2000ms between attempts, with no jitter.
- **Timeout:** 30s per attempt, up from 10s.
- **Unchanged:** after the last attempt it throws `HTTP <status>` or the original error.

## Risks
- **R1, 4xx responses are retried (bug).** `throw new Error(...)` runs inside the `try`, so the `catch` retries every failed response, including 4xx. A 404 or 401 costs 4 requests and about 3.5s before it fails. The 5xx check suggests the intent was to retry only 5xx.
- **R2, repeated side effects.** Every method is retried, including POST and PATCH. If the server acted on a request but then timed out or returned 5xx, the retry repeats the action.
- **R3, much longer worst case.** One call can now take about 123.5s (4 × 30s plus 3.5s of backoff), up from 10s. Callers and upstream timeouts may need to change.
- **R4, stream bodies.** A `ReadableStream` body is used up by the first attempt, so later attempts fail or send an empty body.
- **R5, JSON parse errors skip the retry logic.** `return res.json()` has no `await`, so a parse failure rejects outside the `try`. That is probably the right outcome, but it looks accidental.
- **R6, caller `signal` is ignored.** `options.signal` is still overwritten, as before. With retries, a caller can no longer cancel a call that may run for 2 minutes.
- **R7, `Retry-After` is ignored.** The header on 503 responses is not used.

## Suggested fixes
- **R1:** track whether the error came from a response, and only retry network errors and 5xx.
- **R2:** limit retries to idempotent methods by default.
- **R6:** combine the caller's signal with the timeout using `AbortSignal.any`.

None of this was run. The findings come from reading the diff only.
````

### summarize-retry on 3

````markdown
This change makes `request()` in `src/http.js` retry failed requests up to 3 times, waiting longer before each retry, and raises the per-attempt timeout from 10s to 30s.

## Changes
- **New `retries` parameter:** the third parameter defaults to 3, so a call makes up to 4 attempts. Existing callers keep working without changes.
- **Retry triggers:** 5xx responses and any error thrown inside the `try` block.
- **Backoff:** waits 500ms, 1000ms, then 2000ms between attempts, with no randomness added.
- **Timeout:** each attempt now has 30s instead of 10s.
- **After the last retry:** a 5xx throws `HTTP <status>` and a network error or timeout is rethrown as is.

## Findings
- **F1, 4xx is retried by mistake:** the `HTTP ${res.status}` error is thrown inside `try`, so `catch` catches it and retries. A 400, 401, 403 or 404 gets 4 attempts and about 3.5s of added delay before failing. The 5xx check suggests only server errors were meant to be retried.
- **F2, POST can run more than once:** every HTTP method is retried. If a POST or PATCH reaches the server but then times out or gets a 5xx, it is sent again and its side effects can repeat.
- **F3, much longer worst case:** a failing call can now take 4 × 30s + 3.5s = about 123s, up from 10s. Callers and any upstream timeouts that relied on the 10s limit need checking.
- **F4, JSON errors are not retried:** `return res.json()` is not awaited, so a bad response body rejects outside the `try` block and fails right away. This may be fine, but it is not consistent with the other errors.
- **F5, response body left unread:** when a 5xx is retried, its body is never read. In Node's `fetch`, an unread body can keep its connection open until garbage collection. Under heavy retrying this could exhaust the connection pool.
- **F6, 429 ignores `Retry-After`:** a 429 is only retried because of F1, and the fixed backoff ignores the server's `Retry-After` header.

## Not verified
- The diff has no tests, so the retry behavior has not been tested.
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
The plan uses a single-use, hashed, short-lived token stored in a new Postgres table. There are two endpoints: one requests a reset and one confirms it. I haven't read your codebase, so the assumptions below need checking first.

## Assumptions
- **A1** `users` has a unique `email` column and a `password_hash` column.
- **A2** The app already hashes passwords with bcrypt or argon2. The reset flow reuses that same function.
- **A3** The app can't send email yet.
- **A4** Logins create sessions or refresh tokens that are stored somewhere the app can revoke them.

## Decisions
- **D1** Store the token in a database table, not a signed JWT. A table row can be used once and revoked, and a JWT can't.
- **D2** Tokens expire after 30 minutes.
- **D3** Pick an email provider: Postmark, SES or Resend, sent through their SDK or through SMTP with `nodemailer`. You decide which.
- **D4** A successful reset logs the user out of all sessions.

## Steps
1. **Migration**
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
2. **Email module:** a `sendMail(to, subject, text, html)` wrapper for the D3 provider. Settings come from env vars: `MAIL_FROM`, API key, `APP_URL`.
3. **`POST /auth/password-reset/request`** with body `{ email }`
   - Always return the same `202` response, whether or not the email exists.
   - Look up the user with `lower(email)`.
   - If the user exists:
     - Delete their unused tokens.
     - Generate `crypto.randomBytes(32)` and store its SHA-256 hash with `expires_at = now() + 30 min`.
     - Email the link `${APP_URL}/reset-password?token=<raw token>`.
   - Send the email after responding, so response time doesn't reveal whether the account exists.
4. **`POST /auth/password-reset/confirm`** with body `{ token, newPassword }`, all in one transaction:
   - Hash the token and run `SELECT ... FOR UPDATE WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()`.
   - If no row matches, return `400` with a generic "invalid or expired link" message.
   - Check `newPassword` against the existing password policy.
   - Update `users.password_hash`.
   - Set `used_at` on the token and delete the user's other tokens.
   - Revoke all sessions and refresh tokens (D4).
   - Commit, then send a "your password was changed" email.
5. **Rate limiting** on both endpoints, per IP and per email. Example: 5 requests per 15 minutes.
6. **Frontend reset page:** reads the token from the URL, posts it to `/confirm` and sets `Referrer-Policy: no-referrer`.
7. **Cleanup:** a daily job that deletes expired and used tokens.
8. **Tests:**
   - Unknown email gets the same response as a known one.
   - Expired token is rejected.
   - A token can't be used twice.
   - Two concurrent confirms with one token: only one succeeds.
   - Sessions are revoked after a reset.
   - Rate limit triggers.

## Risks
- **R1** Building the link from the request's `Host` header lets an attacker send users a link to their own domain. Build it only from `APP_URL`.
- **R2** Raw tokens can leak through request logs, error trackers or the `Referer` header. Remove `token` from logs and keep step 6's header.
- **R3** Without rate limits, attackers can flood users' inboxes and burn your provider quota.
- **R4** Without SPF, DKIM and DMARC on the sending domain, reset emails will land in spam. This needs DNS access.
- **R5** If A4 is wrong and sessions are stateless JWTs, D4 needs a `password_changed_at` column on `users` that JWT checks compare against.

Next step: confirm A1 through A4 against the actual code before writing the migration.
````

### plan-reset on 2

````markdown
Plan: store a hashed, single-use, 30-minute token in a new Postgres table, add two endpoints (request and confirm), and send the link through a transactional email provider. I haven't seen your code, so this is based on the assumptions below.

## Assumptions
- **A1** `users` has a unique `email` column and a `password_hash` column.
- **A2** Passwords are already hashed with bcrypt or argon2. Reset uses the same function.
- **A3** Auth uses either server-side sessions or JWTs. This decides how D3 works.
- **A4** A migration tool is in place, such as knex, node-pg-migrate or Prisma.

## Decisions
- **D1** Email provider. Use Postmark, SES or Resend through its API. Use nodemailer SMTP only if you already run SMTP.
- **D2** Token lifetime. Use 30 minutes and allow one use.
- **D3** Log out other sessions after a reset. With sessions, delete the user's session rows. With JWTs, add `users.password_changed_at` and reject tokens issued before it.
- **D4** Do not log the user in automatically after a reset. Send them to the login page.

## Steps
1. **AC1** Migration:
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
   If D3 uses JWTs, also add `users.password_changed_at timestamptz`.
2. **AC2** Email module: a `sendPasswordResetEmail(to, link)` function plus a "your password was changed" email. Read provider keys from env.
3. **AC3** `POST /auth/password-reset/request` with body `{ email }`:
   - Normalize the email with `trim().toLowerCase()` and look up the user.
   - If the user exists, delete their unused tokens. Then create a token with `crypto.randomBytes(32).toString('base64url')` and store its SHA-256 hash with `expires_at = now() + 30 min`.
   - Build the link from `APP_BASE_URL` in env: `${APP_BASE_URL}/reset-password?token=...`.
   - Send the email without awaiting it, or through a queue, so response time is the same whether or not the user exists.
   - Always return `202` with the same body.
4. **AC4** `POST /auth/password-reset/confirm` with body `{ token, newPassword }`, in one transaction:
   - Check `newPassword` against your existing password rules.
   - Run `SELECT ... WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now() FOR UPDATE`. If there is no row, return `400` with a generic "invalid or expired link" message.
   - Update `users.password_hash`, and `password_changed_at` if you use it.
   - Set `used_at` on this token and delete the user's other tokens.
   - Log out other sessions as decided in D3.
   - Commit, then send the "password changed" email.
5. **AC5** Rate limits. On request: 5 per IP per 15 minutes and 3 per email per hour. On confirm: 10 per IP per 15 minutes.
6. **AC6** Reset page on the frontend. It reads `token` from the URL, sets `Referrer-Policy: no-referrer`, and submits to AC4.
7. **AC7** Cleanup job: delete rows where `expires_at < now() - interval '1 day'`.
8. **AC8** Tests:
   - Unknown email and known email return the same response.
   - Expired, used and wrong tokens are rejected.
   - A token cannot be used twice, including two requests at once.
   - Old sessions or JWTs are rejected after a reset.
   - The new password logs in and the old one fails.

## Risks
- **R1** Attackers can find which emails have accounts if the response body, status or timing differs. AC3 handles this, and AC8 must test it.
- **R2** Building the link from `req.headers.host` lets an attacker send users a link to their own domain. Use only `APP_BASE_URL`.
- **R3** The token can leak through access logs that record query strings, or through the Referer header. Remove `token` from logs and set the header from AC6.
- **R4** If JWTs are used and D3 is skipped, stolen tokens keep working after a reset.
- **R5** If `users.email` is stored with mixed case and has no case-insensitive unique index, lookups can miss users or match the wrong one. Check before AC3.
- **R6** Reset emails will land in spam if the sending domain has no SPF, DKIM and DMARC records. Set these up with the D1 provider before launch.
- **R7** Storing the raw token instead of its hash means a database leak gives attackers working reset links.

Next: confirm A3 (sessions or JWTs), because it decides how D3 and AC4 are built.
````

### plan-reset on 3

````markdown
# Plan: password reset by email

Store a hashed, single-use, 30-minute reset token in a new `password_reset_tokens` table. Email a link that carries the raw token. Accept the new password with a POST that uses the token once, then signs the user out of every existing session.

## Assumptions
- **A1** Passwords are already hashed with bcrypt or argon2. Reset will use the same hash function.
- **A2** `users.email` is unique and matched without regard to case, using `citext` or `lower(email)`.
- **A3** The app has server-side sessions or a way to revoke tokens. If it uses stateless JWTs, see D4.
- **A4** The frontend has a page at `/reset-password` that can read the token from the URL.

## Decisions
- **D1** Put tokens in their own table, not in columns on `users`. This allows several pending requests, an audit trail and easy cleanup.
- **D2** Store only the SHA-256 hash of the token. If the database leaks, the stored tokens cannot be used. A fast hash is safe here because the token has 256 bits of randomness.
- **D3** Tokens expire after 30 minutes and work only once. A new request cancels any older unused tokens.
- **D4** A successful reset revokes all sessions. With JWTs, add `users.password_changed_at` and reject tokens issued before it.

## Steps
1. **Migration**
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
2. **Email sender**
   - Add a mailer module that wraps nodemailer SMTP or a provider SDK such as Postmark, SES or Resend.
   - Read `MAIL_FROM` and `APP_URL` from config.
3. **`POST /auth/password-reset/request`** with body `{ email }`
   - Validate the email format.
   - Always return `202` with the same body, whether or not the account exists.
   - If the user exists:
     - Generate the token with `crypto.randomBytes(32).toString('base64url')`.
     - Store its hash with `expires_at = now() + 30 min`.
     - Mark older unused tokens for that user as used.
   - Send the email after the response is sent, or from a job queue, so response time does not reveal whether the account exists.
   - Build the link from `APP_URL`, never from the `Host` header: `${APP_URL}/reset-password#token=...`.
4. **`POST /auth/password-reset/confirm`** with body `{ token, newPassword }`
   - Check the password against the same rules as signup.
   - In one transaction:
     - Run `SELECT ... WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now() FOR UPDATE`.
     - Update `users.password_hash`.
     - Set `used_at`.
     - Delete the user's other tokens.
     - Revoke sessions (D4).
   - If the token is invalid or expired, return a generic `400`.
   - After a successful reset, send a "your password was changed" email.
5. **Rate limiting**
   - `request`: about 5 per IP per 15 minutes and 3 per email per hour.
   - `confirm`: about 10 per IP per 15 minutes.
6. **Reset page**
   - Read the token from the URL fragment. The page must not use up the token when it loads.
   - Set `Referrer-Policy: no-referrer`.
7. **Cleanup**
   - Run a daily job that deletes rows where `expires_at < now() - interval '1 day'`.
8. **Tests**
   - Unknown and known emails get identical responses.
   - Expired, used and wrong tokens are rejected.
   - A token cannot be used twice, even by concurrent requests.
   - Old sessions are invalid after a reset.
   - A new request cancels older tokens.
   - Rate limits trigger.

## Risks
- **R1** Account enumeration through different responses or response times. Covered by step 3.
- **R2** Email security scanners open links before the user does. If a GET used up the token, users would find their links already dead. Only the POST in step 4 uses it.
- **R3** The token could leak through access logs, the `Referer` header or analytics scripts on the reset page. The URL fragment and `no-referrer` reduce this. Keep third-party scripts off that page.
- **R4** An attacker who can set the `Host` header could get a reset link pointing at their own domain. Always build the link from `APP_URL`.
- **R5** Without session revocation, an attacker already signed in stays signed in after the reset.
- **R6** Email delivery can fail silently. Log failures from the provider and set up SPF, DKIM and DMARC for `MAIL_FROM`.

## Questions
- **Q1** Which email provider, and are SPF, DKIM and DMARC already set up for the sending domain?
- **Q2** Does the app use sessions or JWTs? This decides how D4 is built.
- **Q3** Is 30 minutes the right expiry, or does a policy set it?

Next: answer Q1 and Q2, then the plan can be matched to the actual code.
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
Put a `data-theme` attribute on `<html>`, override the CSS variables under `[data-theme="dark"]`, save the choice in `localStorage`, and set the attribute from an inline script in `index.html` before React loads.

## Assumptions
- A1: I haven't seen the code. I have no file access in this session.
- A2: This is a client-rendered SPA (Vite or CRA). If it's Next.js or another SSR setup, step 3 changes (see R2).
- A3: The current variables live in `:root` and hold the light theme.

## Decisions for you
- D1: **Two or three states.** Light/dark only, or light/dark/system? I recommend three. With no saved choice, the app follows `prefers-color-scheme`.
- D2: **Where the toggle goes.** Header or settings page.

## Steps
1. **CSS.** Add a `[data-theme="dark"]` block that redefines the same variable names with dark values. Add `color-scheme: light` to `:root` and `color-scheme: dark` to the dark block so scrollbars and form controls match.
2. **Storage key.** Use `localStorage` key `theme` with the values `light`, `dark`, or nothing (nothing means follow the system).
3. **Script to prevent the flash.** Add an inline `<script>` in `index.html` `<head>`, before the CSS and bundle. It reads `theme`, falls back to `matchMedia('(prefers-color-scheme: dark)')`, and sets `document.documentElement.dataset.theme`. Wrap it in `try/catch`.
4. **`useTheme` hook.** It reads the current value on first render. `setTheme(value)` updates the attribute, writes `localStorage` (or removes the key for `system`), and updates state. There's no need for context unless more than one component reads the theme.
5. **System changes.** While on `system`, listen for `change` events on the `matchMedia` query and update the attribute.
6. **Toggle component.** A `<button>` with an `aria-label` that says what it switches to, or a 3-option segmented control if you choose three states in D1.
7. **Sweep for hardcoded colors.** Search the CSS and JSX for hex, `rgb(`, and named colors that don't use variables. Anything found stays light in dark mode.

## Risks
- R1: **Flash of the light theme** on load if step 3 is skipped or runs after the bundle.
- R2: **SSR hydration mismatch.** The server can't read `localStorage`. You'd need a cookie or `suppressHydrationWarning` on `<html>` (for example, `next-themes`).
- R3: **Hardcoded colors** in SVGs, images, charts, and third-party components won't follow the variables.
- R4: **`localStorage` can throw** in some privacy modes. The `try/catch` falls back to the system theme without saving.
- R5: **Content Security Policy.** If the CSP blocks inline scripts, the step 3 script needs a nonce or hash.

## Testing
- Reload in each state and confirm there's no flash (throttle the network in DevTools).
- Change the OS theme while on `system`.
- Check contrast of the dark values against WCAG AA.

Next: decide D1.
````

### plan-darkmode on 2

````markdown
Put dark values under `[data-theme="dark"]` in CSS, set that attribute from an inline script in `index.html` before React loads, and save the user's choice in `localStorage`.

## Assumptions
- **A1** The app renders in the browser only (Vite or CRA). With Next.js or other SSR, the inline script goes in the root layout and `<html>` needs `suppressHydrationWarning`.
- **A2** Every color already comes from a CSS variable. Hardcoded colors will stay light in dark mode.
- **A3** I haven't seen the codebase. File names below are placeholders.

## Steps
1. **Dark palette.** In the global stylesheet, override only the color variables:
   ```css
   :root { color-scheme: light; }
   :root[data-theme="dark"] {
     color-scheme: dark;
     --bg: #121212;
     --text: #e6e6e6;
     /* ...one override per color variable */
   }
   ```
   `color-scheme` switches native scrollbars and form controls too.
2. **Set the theme before first paint.** Add this to `<head>` in `index.html`, above the stylesheet:
   ```html
   <script>
     try {
       var t = localStorage.getItem('theme');
       if (t !== 'light' && t !== 'dark') {
         t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
       }
       document.documentElement.dataset.theme = t;
     } catch (e) {}
   </script>
   ```
   If you do this inside React instead, users with a saved dark theme see a white flash on every load.
3. **`useTheme` hook.** Read the starting value from `document.documentElement.dataset.theme` so it matches the script. When the theme changes, update the attribute and call `localStorage.setItem('theme', t)` inside try/catch.
4. **`ThemeToggle` component.** A `<button>` that calls `setTheme`. Give it `aria-pressed` or an `aria-label` that says which theme it switches to.
5. **Check it by hand.**
   - Reload with each saved value.
   - Clear storage and change the OS theme.
   - Look for a flash with CPU throttling on.
   - Test in a private window.

## Decisions
- **D1** Two-state toggle (light/dark) that follows the OS theme until the user clicks it. I recommend this over a three-way light/dark/system control because it's simpler and covers most users. The catch is that after one click, the app stops following OS changes.
- **D2** No syncing between open tabs. If you want it, add a `storage` event listener to the hook.

## Risks
- **R1** Hardcoded colors won't switch: inline styles, SVG `fill`, images with white backgrounds and third-party component styles. Search for `#`, `rgb(` and `hsl(` outside the variable definitions.
- **R2** A strict Content Security Policy will block the inline script. You'd need a hash or nonce for it.
- **R3** If `localStorage` is blocked (some privacy settings, sandboxed iframes), the toggle still works but the choice won't be saved. The try/catch stops it from crashing.
````

### plan-darkmode on 3

````markdown
Set a `data-theme` attribute on `<html>`, override the CSS variables under `[data-theme="dark"]`, save the choice in `localStorage`, and apply it with an inline script before React loads.

## Assumptions
- **A1** The app is client-rendered (Vite or CRA). SSR changes D2 and R4.
- **A2** Light-theme variables are defined on `:root`.
- **A3** I did not inspect your code. This plan is generic.

## Decisions
- **D1** Use `data-theme` on `<html>` rather than state passed through props. CSS does the switching and React only flips one attribute.
- **D2** Use `localStorage`. Switch to a cookie only if the server must render the correct theme.
- **D3** With no saved choice, follow the OS `prefers-color-scheme`. Save only when the user clicks the toggle.

## Steps
1. **CSS.** Add dark overrides next to the existing variables:
   ```css
   :root { color-scheme: light; }
   [data-theme="dark"] {
     color-scheme: dark;
     --bg: #121212;
     --text: #e6e6e6;
     /* override every color variable */
   }
   ```
   `color-scheme` makes scrollbars and form controls match.
2. **Inline script** in `index.html` `<head>`, before the bundle:
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
3. **Hook** `useTheme.js`:
   ```js
   import { useState, useCallback } from 'react';

   export function useTheme() {
     const [theme, setTheme] = useState(
       () => document.documentElement.dataset.theme || 'light'
     );
     const toggle = useCallback(() => {
       setTheme((prev) => {
         const next = prev === 'dark' ? 'light' : 'dark';
         document.documentElement.dataset.theme = next;
         try { localStorage.setItem('theme', next); } catch (e) {}
         return next;
       });
     }, []);
     return { theme, toggle };
   }
   ```
   Wrap it in a context only if more than one component needs to read the theme.
4. **Toggle component:**
   ```jsx
   const { theme, toggle } = useTheme();
   <button onClick={toggle} aria-pressed={theme === 'dark'}>Dark mode</button>
   ```
5. **Audit** for colors that bypass the variables (R3).

## Risks
- **R1** Setting the theme in `useEffect` instead of the inline script causes a flash of the light theme on load.
- **R2** `localStorage` can throw when storage is blocked. The `try/catch` blocks cover this.
- **R3** Hardcoded hex values, inline styles, SVG fills, images, and third-party component styles will not switch.
- **R4** With SSR (such as Next.js), the server does not know the theme. That causes a hydration mismatch unless you inject the script in the document head and add `suppressHydrationWarning` on `<html>`, or read a cookie on the server.
- **R5** A strict Content Security Policy blocks the inline script. Add a nonce or hash for it.
````
