# API Documentation

The Allo Inventory system provides RESTful endpoints to interact with products, warehouses, and manage the complete lifecycle of inventory reservations.

---

## 1. Get Products with Stock

Retrieves a list of all products along with their available stock levels across a specified warehouse.

**Endpoint:** `GET /api/products`

**Query Parameters:**

- `warehouseId` (string, required): The UUID of the warehouse to check stock against.

**Example Request:**

```bash
curl "http://localhost:3000/api/products?warehouseId=22222222-2222-2222-2222-000000000001"
```

**Example Response (200 OK):**

```json
[
  {
    "product": {
      "id": "11111111-1111-1111-1111-000000000001",
      "name": "Limited Edition Sneaker",
      "price": 199.99
    },
    "total": 500,
    "reserved": 50,
    "available": 450
  }
]
```

---

## 2. Get Warehouses

Retrieves a list of all available warehouses in the system.

**Endpoint:** `GET /api/warehouses`

**Example Request:**

```bash
curl "http://localhost:3000/api/warehouses"
```

**Example Response (200 OK):**

```json
[
  {
    "id": "22222222-2222-2222-2222-000000000001",
    "name": "US East Fulfillment",
    "location": "New York, NY"
  }
]
```

---

## 3. Create Reservation (ATOMIC)

Creates a temporary reservation for inventory. This is an **Atomic Operation**. If multiple users request the exact same item and not enough stock is available, only the first to acquire the database lock will succeed.

**Endpoint:** `POST /api/reservations`

**Headers:**

- `Content-Type: application/json`

**Body Payload:**

- `productId` (UUID, required)
- `warehouseId` (UUID, required)
- `quantity` (Integer > 0, required)
- `customerId` (String/UUID, required)

**Example Request:**

```bash
curl -X POST http://localhost:3000/api/reservations \
  -H 'Content-Type: application/json' \
  -d '{
    "productId": "11111111-1111-1111-1111-000000000001",
    "warehouseId": "22222222-2222-2222-2222-000000000001",
    "quantity": 1,
    "customerId": "user_98765"
  }'
```

**Example Responses:**

_Success (201 Created):_

```json
{
  "id": "res_8400-e29b-41d4",
  "customerId": "user_98765",
  "status": "pending",
  "expiresAt": "2026-10-15T14:35:00Z",
  "items": [
    {
      "productId": "11111111-1111-1111-1111-000000000001",
      "warehouseId": "22222222-2222-2222-2222-000000000001",
      "quantity": 1
    }
  ]
}
```

_Conflict / Out of Stock (409 Conflict):_

```json
{
  "error": "INSUFFICIENT_STOCK",
  "message": "Only 0 units available, requested 1",
  "available": 0,
  "requested": 1
}
```

---

## 4. Confirm Reservation

Finalizes a pending reservation (usually called after a successful payment capture). Once confirmed, the inventory remains permanently reserved until shipped.

**Endpoint:** `POST /api/reservations/:id/confirm`

**Example Request:**

```bash
curl -X POST http://localhost:3000/api/reservations/res_8400-e29b-41d4/confirm
```

**Example Responses:**

_Success (200 OK):_

```json
{
  "id": "res_8400-e29b-41d4",
  "status": "confirmed",
  "confirmedAt": "2026-10-15T14:31:00Z"
}
```

_Error - Expired (410 Gone):_

```json
{
  "error": "RESERVATION_EXPIRED",
  "message": "Reservation expired at 2026-10-15T14:30:00Z",
  "expiresAt": "2026-10-15T14:30:00Z"
}
```

---

## 5. Release / Cancel Reservation

Manually cancels a pending or abandoned reservation, immediately returning the stock to the available pool for other customers to purchase.

**Endpoint:** `POST /api/reservations/:id/release`

**Example Request:**

```bash
curl -X POST http://localhost:3000/api/reservations/res_8400-e29b-41d4/release
```

**Example Response (200 OK):**

```json
{
  "success": true,
  "message": "Reservation successfully released and stock restored."
}
```

_(Note: The system also runs a background cron job at `/api/cron/release-expired` to automatically release reservations whose TTL has expired.)_
