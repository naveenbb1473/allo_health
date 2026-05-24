# Code Quality Standards

## TypeScript Rules

* Use `strict: true` in `tsconfig.json`.
* No `any` types. Use `unknown` first, then narrow safely.
* Export shared request/response types from `lib/schemas`.
* All async functions must have explicit return types.
* Prefer discriminated unions over loose object shapes.
* Use readonly types where mutation is not intended.
* Avoid implicit `null` and `undefined` handling.
* All environment variables must be typed and validated.

## API Endpoints

* All route handlers must use `try-catch`.
* All errors must be logged with structured context.
* All requests must be validated using Zod schemas.
* All responses must use correct HTTP status codes.
* Never expose internal stack traces to clients.
* Use typed response objects consistently.
* All mutation endpoints must be idempotent where possible.
* Reservation endpoints must be concurrency-safe.

### Standard Status Codes

* `200 OK` — Successful read/update
* `201 Created` — Reservation successfully created
* `400 Bad Request` — Validation failure
* `401 Unauthorized` — Authentication required
* `403 Forbidden` — Access denied
* `404 Not Found` — Resource missing
* `409 Conflict` — Insufficient stock / concurrency conflict
* `410 Gone` — Reservation expired
* `500 Internal Server Error` — Unexpected server failure

## Database Standards

* All database access must use Prisma or raw SQL.
* Raw SQL is allowed only for concurrency-critical operations.
* All reservation operations must execute inside transactions.
* No N+1 queries. Use `select`, `include`, or batching.
* All indexes must be documented.
* All constraints must be enforced at the database layer.
* Database is the single source of truth for inventory state.
* Never trust frontend inventory state for correctness.

### Required Constraints

* `reserved_units >= 0`
* `reserved_units <= total_units`
* Unique `(productId, warehouseId)` stock rows
* Unique product SKU values
* Positive reservation quantities only

### Transaction Rules

* Reservation creation must be atomic.
* Confirmation must re-check expiry state inside the transaction.
* Release operations must decrement reserved stock exactly once.
* Expired cleanup jobs must be idempotent.
* Avoid long-running transactions.

## Logging & Observability

* Use Winston for structured application logs.
* Use Sentry for production error monitoring.
* Log all reservation lifecycle events:

  * reservation created
  * reservation confirmed
  * reservation released
  * reservation expired
* Include correlation/request IDs in logs where possible.
* Never log secrets or sensitive credentials.

## Testing Standards

* All services must have unit tests.
* All APIs must have integration tests.
* Critical flows must have end-to-end coverage.
* All concurrency edge cases must be tested.
* Coverage target: `>80%`.
* Reservation race conditions must be validated with load tests.

### Required Test Scenarios

* Successful reservation
* Reservation conflict (`409`)
* Expired reservation confirmation (`410`)
* Concurrent reservation attempts for last unit
* Double release prevention
* Idempotent retry handling
* Expiry cleanup correctness
* Transaction rollback behavior

### Performance Validation

* Use `k6` for concurrency/load testing.
* Demonstrate:

  * exactly one success for final inventory unit
  * all competing requests fail safely
  * zero overselling under concurrent load

## Frontend Standards

* Use React hooks only.
* Keep business logic out of UI components.
* Use optimistic UI updates carefully.
* Show all backend validation errors to the user.
* Never silently swallow API failures.
* Countdown timers must remain synchronized with server expiry.
* Use loading and disabled states during mutations.
* All forms must validate client-side and server-side.

## Security Standards

* Validate all external input.
* Never trust client-provided inventory values.
* Use environment variables for secrets.
* Prevent duplicate reservation side effects.
* Sanitize logs and error payloads.
* Protect cron endpoints using secret tokens.

## Git Commit Standards

### Commit Format

```text
<type>: <description>
```

### Allowed Types

* `feat`
* `fix`
* `refactor`
* `test`
* `docs`
* `chore`

### Rules

* One logical change per commit.
* Commits should be atomic and reversible.
* Write descriptive commit messages.
* Push working code only.
* Never commit secrets or `.env.local` files.

### Good Examples

```text
feat: implement atomic reservation transaction
fix: prevent double release during expiry cleanup
test: add concurrent reservation integration tests
docs: explain reservation concurrency strategy
```

## Code Review Checklist

Before pushing:

* [ ] No `console.log()` statements remain
* [ ] All TypeScript errors resolved
* [ ] All tests passing
* [ ] No unused imports
* [ ] Complex logic documented clearly
* [ ] Error messages are user-friendly
* [ ] No hardcoded secrets
* [ ] API responses are typed correctly
* [ ] Reservation transactions tested under concurrency
* [ ] No unnecessary re-renders in frontend components
* [ ] Database indexes verified
* [ ] Linting passes successfully
* [ ] Load tests executed for reservation flow

## Engineering Principles

* Prefer correctness over premature optimization.
* Keep concurrency correctness inside PostgreSQL.
* Use the database as the authority for inventory state.
* Favor simple and observable systems over clever abstractions.
* Optimize for maintainability and debuggability.
* Build defensive systems that fail safely under concurrency.
