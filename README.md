# Allo Inventory Reservation System

## 1. Overview

A high-concurrency, ACID-compliant inventory reservation system built with Next.js, Prisma, and PostgreSQL. It is designed to handle flash sales and heavy spikes in traffic, guaranteeing that no overselling (double-booking) ever occurs, even when hundreds of concurrent requests attempt to purchase the exact same inventory item simultaneously.

This system guarantees stock correctness by leveraging database-level row locks and strict transaction isolation levels, rather than relying on application-level locks which are prone to race conditions in a distributed environment.

## 2. Architecture Diagram

```text
  Client Load (e.g., k6 100 VUs)
          │
          ▼
 ┌─────────────────────────┐
 │ Next.js API Routes      │
 │ (Serverless/Node.js)    │
 └────────┬────────────────┘
          │ Prisma Client
          ▼
 ┌─────────────────────────┐
 │ PostgreSQL Database     │
 │ - Row-level Locking     │
 │ - ACID Transactions     │
 └─────────────────────────┘
```

## 3. Race Condition Solution

The hardest problem in e-commerce inventory is **race conditions**. If two users read `available = 1` at the exact same millisecond, they might both pass validation and deduct the inventory, resulting in `available = -1` (overselling).

**How we solved it:**
We use a pessimistic locking strategy utilizing PostgreSQL's `SELECT ... FOR UPDATE NOWAIT` inside an explicit transaction.

1. **Locking:** When a reservation is requested, we lock the specific inventory row using `FOR UPDATE NOWAIT`.
2. **Atomicity:** The `NOWAIT` modifier ensures that if another concurrent request is currently processing a reservation for this exact product, the new request will immediately fail with a lock acquisition error rather than queueing up and exhausting the database connection pool.
3. **Graceful Degradation:** The API elegantly catches these lock errors and returns a `409 Conflict` (or service unavailable), telling the client that the inventory is highly contested.
4. **Validation:** All stock deduction logic happens entirely inside the locked transaction.

## 4. Getting Started

### Prerequisites

- Node.js (v18+)
- PostgreSQL (Local or Cloud e.g., Neon/Supabase)
- npm or yarn

### Environment Setup

Create a `.env` file in the root directory:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/allo_inventory?schema=public"
```

### Database Setup

Apply migrations and seed the database with initial products and warehouses:

```bash
npm install
npx prisma generate
npx prisma migrate dev
npm run db:seed
```

### Running Locally

Start the development server:

```bash
npm run dev
```

The server will be available at `http://localhost:3000`.

## 5. API Documentation

### Endpoints

| Method | Endpoint                         | Description                                       |
| ------ | -------------------------------- | ------------------------------------------------- |
| `POST` | `/api/reservations`              | Create a new temporary inventory reservation      |
| `POST` | `/api/reservations/[id]/confirm` | Confirm an active reservation (finalize purchase) |
| `POST` | `/api/reservations/[id]/release` | Cancel/release an active reservation back to pool |

### Example Request (Create Reservation)

```bash
curl -X POST http://localhost:3000/api/reservations \
  -H "Content-Type: application/json" \
  -d '{
    "productId": "11111111-1111-1111-1111-000000000001",
    "warehouseId": "22222222-2222-2222-2222-000000000001",
    "quantity": 1,
    "customerId": "user_123"
  }'
```

### Response Codes

- `201 Created`: Reservation successful.
- `400 Bad Request`: Invalid payload or missing fields.
- `404 Not Found`: Product or warehouse doesn't exist.
- `409 Conflict`: Insufficient stock OR high contention (try again).
- `500 Internal Server Error`: Unexpected database failure.

## 6. Features & Architecture

### Pessimistic Row-Level Locking (Race Condition Prevention)
Eliminates overselling completely by utilizing Postgres `FOR UPDATE NOWAIT` inside `ReadCommitted` transactions.

### Reservation Expiry (Automated Cleanup)
Reservations that aren't confirmed before their `expiresAt` timestamp must be released back into the available pool. 
**Approach:** I implemented a **stateless Vercel Cron Job**. Serverless functions spin down, so background workers (`setInterval`) are unreliable. Instead, Vercel pings the secure `/api/cron/release-expired` endpoint every 5 minutes. The endpoint scans the database for expired pending reservations and releases them transactionally.

### Idempotency (Bonus Feature)
To prevent double-charging or double-reserving when clients retry requests (e.g., due to network blips), the `POST /api/reservations` and `POST /api/reservations/[id]/confirm` endpoints support idempotency.
**Approach:** I implemented a distributed caching layer using **Upstash Redis**. When a request includes an `Idempotency-Key` header, the server uses Redis `SET NX` to acquire a lock for that key. If the key already exists, the server short-circuits the database entirely and returns the cached response from the original successful request.

### Graceful Conflict Handling
High-contention returns 409s instantly to protect the DB pool rather than queueing and timing out.

## 7. Testing

### Unit & Integration Tests

We use **Vitest** for isolated unit testing and database-integrated tests.

```bash
npm run test:unit
npm run test:integration
```

### Load Testing

We use **k6** to simulate extreme spike traffic (e.g., flash sales). Tests prove the system can handle intense lock contention without data corruption.

```bash
# Test single-row extreme contention correctness
k6 run load-test.js

# Test distributed scale and throughput (250+ req/sec)
k6 run realistic_load_test.js
```

## 8. Deployment

1. Connect the repository to **Vercel**.
2. Provision a PostgreSQL database (e.g., Neon serverless Postgres).
3. Set `DATABASE_URL` in the Vercel Environment Variables.
4. Add the deployment hook/build command: `npx prisma generate && npx prisma migrate deploy && next build`.

## 9. Trade-offs

- **Pessimistic Locking vs. Optimistic Concurrency:** We chose pessimistic locking (`FOR UPDATE`) for strict correctness. Optimistic locking (using a `version` integer) might offer higher theoretical throughput but results in heavy retry loops on the application server during flash sales.
- **NOWAIT modifier:** We use `NOWAIT` to fail fast. The trade-off is that valid users might get rejected if the lock is held for just a few milliseconds. A short queue or bounded wait (e.g., `pg_advisory_xact_lock`) could smooth this out, but `NOWAIT` maximizes database stability.

## 10. What I'd do differently

If building this for a massive global scale (like Amazon or Ticketmaster):

1. **In-Memory Cache (Redis):** Add a Redis layer in front of PostgreSQL. Maintain a fast `available_count` in Redis to reject requests _before_ they ever hit the database, protecting Postgres entirely once stock hits zero.
2. **Event-Driven Queue:** Instead of synchronous HTTP requests hitting the DB, ingest reservations into Kafka or SQS. A background worker would pull off the queue sequentially, entirely avoiding DB-level lock contention.
3. **Database Sharding:** Shard the inventory tables by `warehouseId` so that heavy load on one warehouse doesn't impact operations on another.
