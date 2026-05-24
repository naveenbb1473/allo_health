# Architecture

## System Design

The Allo Inventory system is designed around a modern Serverless web stack utilizing Next.js, with a strong focus on transactional integrity at the database layer to guarantee no double-booking during flash sales.

### Data Model

```text
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│     Product     │       │    Warehouse    │       │   Reservation   │
├─────────────────┤       ├─────────────────┤       ├─────────────────┤
│ id (UUID)       │       │ id (UUID)       │       │ id (UUID)       │
│ name (String)   │       │ name (String)   │       │ customerId      │
│ description     │       │ location        │       │ status (Enum)   │
│ price (Decimal) │       └────────┬────────┘       │ expiresAt       │
└────────┬────────┘                │                └────────┬────────┘
         │                         │                         │
         │    ┌────────────────────┴──┐                      │
         │    │         Stock         │                      │
         └────┤                       ├──────────────┐       │
              │ id (UUID)             │              │       │
              │ productId (FK)        │              ▼       ▼
              │ warehouseId (FK)      │       ┌───────────────────────┐
              │ totalUnits (Int)      │       │    ReservationItem    │
              │ reservedUnits (Int)   │       ├───────────────────────┤
              └───────────────────────┘       │ id (UUID)             │
                                              │ reservationId (FK)    │
                                              │ productId (FK)        │
                                              │ warehouseId (FK)      │
                                              │ quantity (Int)        │
                                              └───────────────────────┘
```

### API Flow

1. **Client** calls `POST /api/reservations` with payload (productId, warehouseId, quantity).
2. **Next.js Serverless Route** initializes a Prisma Transaction.
3. **Database** executes `SELECT * FROM "Stock" ... FOR UPDATE NOWAIT`.
4. If available stock >= quantity:
   - Create `Reservation` and `ReservationItem` records.
   - Update `Stock` reservedUnits.
5. Transaction commits, releasing the lock.
6. Returns `201 Created` to client.

### Atomic Operation Deep Dive

Instead of relying on optimistic locking or application-level read-modify-write loops, we use pessimistic locking at the database level.

```sql
SELECT *
FROM "Stock"
WHERE "productId" = $1
  AND "warehouseId" = $2
FOR UPDATE NOWAIT
```

**Why it works:**

- `FOR UPDATE` acquires a write lock on the specific stock row. No other transaction can modify or lock this row until the current transaction completes.
- `NOWAIT` immediately aborts any concurrent transaction trying to lock the exact same row. This is a deliberate "Fail-Fast" design choice that instantly returns a 409 Conflict to the user, preventing database connection pool exhaustion during massive traffic spikes (e.g., ticket sales or sneaker drops).
- Because the condition check (`total - reserved >= quantity`) happens strictly inside this lock, it is mathematically impossible to oversell inventory.

### Concurrency Model

PostgreSQL handles the concurrency constraint. By running the Prisma transaction with `isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted` (or `Serializable`), we guarantee that our transaction acts as the single source of truth at that microsecond.
The Next.js API acts entirely statelessly.

---

## Scalability

### Current Limits

- **PostgreSQL Connection Pool:** Depending on the database provider (e.g., Supabase/Neon), the pool limits concurrent connections (usually ~100-500 connections).
- **Vercel Serverless Functions:** Can scale to thousands of concurrent executions instantly.
- **The Bottleneck:** The single row lock on the `Stock` table. If 1,000 users try to buy the exact same product from the exact same warehouse at the exact same millisecond, 1 succeeds and 999 get 409 conflicts.

### How to Scale

#### 10x Scale (1,000 concurrent req/sec)

- **Implement a fast-reject cache (Redis):** Keep an eventually consistent copy of `available` stock in Redis. If Redis says `available = 0`, return a 409 instantly without ever opening a PostgreSQL connection.

#### 100x Scale (10,000 concurrent req/sec)

- **Database Sharding:** Shard the `Stock` table geographically or logically so that database locks are distributed across multiple database instances.
- **Connection Pooling:** Use PgBouncer or Prisma Accelerate to multiplex thousands of serverless function connections into a smaller pool of active Postgres connections.

#### 1000x Scale (100,000 concurrent req/sec)

- **Event-Driven Architecture (Kafka/SQS):** Change the synchronous reservation API into an asynchronous queue. Users are placed in a "Waiting Room" and reservation requests are appended to an SQS queue. A dedicated background worker consumes the queue sequentially and processes database reservations, eliminating row-lock contention completely.
