# DTU Rakshak — Backend API Docs

**Base URL:** `http://localhost:5000/api/v1`  
**Auth:** `Authorization: Bearer <accessToken>` on all 🔒 routes  
**Content-Type:** `application/json`

---

## Response Shape

```json
{ "statusCode": 200, "data": {}, "message": "...", "success": true }
// Error:
{ "statusCode": 400, "message": "...", "success": false }
```

---

## 🔓 Auth — `/api/v1/auth`

| Method | Endpoint | Body | Returns |
|--------|----------|------|----------|
| GET | `/health` | — | `{ status: "ok" }` |
| POST | `/auth/signup` | `{ email, password }` | `201` OTP sent |
| POST | `/auth/signup/verify-otp` | `{ email, otp }` | `accessToken` + cookie |
| POST | `/auth/signin` | `{ email, password }` | `200` OTP sent |
| POST | `/auth/signin/verify-otp` | `{ email, otp }` | `accessToken` + cookie |
| POST | `/auth/refresh-token` | cookie / `{ refreshToken }` | new `accessToken` |
| POST | `/auth/forgot-password` | `{ email }` | `200` OTP sent |
| POST | `/auth/forgot-password/verify-otp` | `{ email, otp, newPassword }` | `200` password reset |
| POST | `/auth/resend-otp` | `{ email, type }` | `200` OTP resent |
| POST 🔒 | `/auth/logout` | — | clears cookie |
| POST 🔒 | `/auth/update-password` | `{ currentPassword, newPassword }` | `200` password updated |

**2-step signup/signin flow:** credentials → OTP email → verify-otp → get token

---

### POST `/auth/forgot-password`

Initiates the forgot-password flow. Always returns `200` to prevent email enumeration — an OTP is only actually sent if the email is registered and verified.

**Request body:**
```json
{ "email": "user@dtu.ac.in" }
```

**Response `200`:**
```json
{ "statusCode": 200, "data": { "email": "user@dtu.ac.in" }, "message": "If this email is registered, an OTP will be sent.", "success": true }
```

---

### POST `/auth/forgot-password/verify-otp`

Verifies the forgot-password OTP and resets the password in one step. On success, **all active sessions are invalidated** (refresh token cleared from DB).

**Request body:**
```json
{ "email": "user@dtu.ac.in", "otp": "483920", "newPassword": "NewPass@123" }
```

**Response `200`:**
```json
{ "statusCode": 200, "data": null, "message": "Password reset successfully. Please sign in again.", "success": true }
```

> **Note:** After a successful password reset, the user must sign in again — all previous `refresh_token` cookies are invalid.

---

### POST `/auth/resend-otp`

Resends a fresh OTP for any pending flow. Overwrites the existing Redis OTP key with a new OTP and TTL.

**Request body:**
```json
{ "email": "user@dtu.ac.in", "type": "SIGNUP" }
```

> `type` must be one of: `"SIGNUP"` | `"SIGNIN"` | `"FORGOT_PASSWORD"`

**Response `200`:**
```json
{ "statusCode": 200, "data": { "email": "user@dtu.ac.in" }, "message": "OTP resent successfully. Please check your email.", "success": true }
```

> Always returns `200` even if the email is not found (prevents enumeration). Returns `403` if `type` is `"SIGNIN"` and the account is not yet verified.

---

### POST `/auth/update-password` 🔒

Changes the password for the **currently logged-in user**. Requires the current password for verification. On success, all other sessions are invalidated and the current session's cookie is cleared.

**Request body:**
```json
{ "currentPassword": "OldPass@123", "newPassword": "NewPass@456" }
```

**Response `200`:**
```json
{ "statusCode": 200, "data": null, "message": "Password updated successfully. Please sign in again.", "success": true }
```

> **Rules:** `currentPassword` ≠ `newPassword`. Returns `401` if `currentPassword` is wrong.

---

## 🔒 Vehicles — `/api/v1/vehicles`

| Method | Endpoint | Notes |
|--------|----------|-------|
| GET | `/vehicles?search=DL&page=1&limit=15` | Paginated list (max 50) |
| POST | `/vehicles` | Create registered vehicle |
| POST | `/vehicles/bulk` | Bulk import from CSV |
| GET | `/vehicles/:vehicleNo` | Single vehicle  |
| PUT | `/vehicles/:vehicleNo` | Update vehicle |
| DELETE | `/vehicles/:vehicleNo` | Delete vehicle |

> **Security Note:** `vehicleNo` and `mobileNo` are stored with AES-256-GCM encryption. All DB lookups use a deterministic SHA-256 hash (`vehicleNoHash`). The `search` query cannot do partial plate matches — search by `name`, `stickerNo`, or `dept`. For an exact vehicle lookup, use `GET /vehicles/:vehicleNo`.

**POST / PUT body:**
```json
{
  "name": "Rahul Sharma",
  "fathersName": "Suresh Sharma",
  "dept": "CSE",
  "dateOfIssue": "2024-01-15",
  "vehicleType": "2W",
  "stickerNo": "STK-001",
  "vehicleNo": "DL3CAF0001",
  "mobileNo": "9876543210"
}
```
> `vehicleType`: `"2W"` | `"4W"` | `"Heavy"` | `"Electric"`

**POST `/vehicles/bulk` — CSV import:**

- **Content-Type:** `multipart/form-data`
- **Field:** `file` — a `.csv` file (max 5 MB)
- **CSV columns (first row = header):** `name`, `fathersName`, `dept`, `dateOfIssue` (YYYY-MM-DD), `vehicleType`, `stickerNo`, `vehicleNo`, `mobileNo`
- Rows with missing / invalid fields are collected in `errors[]` and skipped; valid rows are inserted with DB-level duplicate skipping.

```json
// Response data shape
{
  "inserted": 42,
  "skipped": 3,
  "errors": [
    { "row": 5, "reason": "Missing required fields: stickerNo" },
    { "row": 9, "reason": "Invalid vehicleType \"bike\" — must be one of: 2W, 4W, Heavy, Electric" }
  ]
}
```

---

## 🔒 Cameras — `/api/v1/cameras`

| Method | Endpoint | Notes |
|--------|----------|-------|
| GET | `/cameras` | All cameras |
| POST | `/cameras` | Create camera |
| POST | `/cameras/bulk` | Bulk import from CSV |
| GET | `/cameras/:id` | Single camera |
| PUT | `/cameras/:id` | Update camera |
| DELETE | `/cameras/:id` | Delete camera |

**POST / PUT body:**
```json
{
  "lat": 28.7507,
  "long": 77.1152,
  "cameraType": "ENTRY",
  "cameraLocation": "Main Gate - South Campus"
}
```
> `cameraType`: `"ENTRY"` | `"EXIT"` | `"SIGHTING"`

---

## Scan Pipeline — `/api/v1/scan`

### Architecture Overview

The scan pipeline is a fully **asynchronous, queue-backed** system. The camera hardware never waits for database processing — it fires a JSON payload and instantly receives `202 Accepted`.

```
Camera Hardware
    │
    │  POST /api/v1/scan  (JSON payload)
    ▼
scan.controller.js  ──►  Validates, hashes jobId, pushes to BullMQ  ──►  202 Accepted
                                           │
                                        Redis
                                    (BullMQ Queue)
                                           │
                                    scan.worker.js
                                           │
                                    scan.service.js
                                    (processScanJob)
                                           │
                           ┌──────────────┴──────────────┐
                           │                             │
                      Redlock (3s mutex              PostgreSQL
                       per vehicle)                  $transaction
```

---

### POST `/api/v1/scan` — Process Camera Payload

> **Auth:** `X-Edge-Api-Key: <secret>` header. Edge camera devices use a shared long-lived API key stored in `EDGE_API_KEY` env var — NOT a user JWT.

**Rate Limit:** 1,000 req/min (generous sanity-check for hardware loops)

**Request Body:**

```json
{
  "camera_id":        "uuid-of-camera",
  "vehicle_no":       "DL 3C AF 0001",
  "raw_plate":        "DL 3C AF 0001",
  "timestamp":        "2025-02-22T09:00:00Z",
  "confidence":       0.94,
  "model_confidence": 0.87
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `camera_id` | ✅ | UUID of the registered camera |
| `vehicle_no` | ✅ | OCR-recognised plate — will be normalised (`DL3CAF0001`) |
| `raw_plate` | ✅ | Verbatim string from the edge OCR device |
| `timestamp` | ❌ | Defaults to `now()` if omitted |
| `confidence` | ❌ | OCR confidence score (0–1) |
| `model_confidence` | ❌ | YOLO model confidence score (0–1) |

**Response `202`:**
```json
{ "statusCode": 202, "data": { "jobId": "md5hash" }, "message": "Scan queued", "success": true }
```

---

### BullMQ Job Processing

The controller hashes `camera_id + vehicleNo + scanTime` into an `MD5 jobId` — this prevents duplicate jobs from camera burst-retries. BullMQ silently drops any duplicate `jobId`.

**Worker concurrency:** 15 parallel jobs — safe for a 4c/16GB VPS.

**Job names handled by the worker:**

| Job Name | Handler | Description |
|----------|---------|-------------|
| `processScanJob` | `processScanJob()` | Main vehicle scan event |
| `checkOverstayBomb` | `processOverstayBomb()` | Delayed 30-minute overstay alarm |

---

### Scan Processing State Machine

Once the worker receives a `processScanJob`, it runs through the following logic:

**Step 1: Acquire Redlock**  
A distributed Redis mutex is acquired for `lock:vehicle:<vehicleNoHash>` (max 3 seconds). This fully serializes concurrent scans of the same vehicle — critical when two cameras fire at the same millisecond.

**Step 2: Resolve Camera**  
Camera config is fetched from Redis (24h TTL). Falls back to PostgreSQL on cache miss.

**Step 3: Resolve Vehicle Auth**  
`isAuthorized` status is resolved via `vehicle:<plate>` Redis key (24h TTL). Falls back to DB on miss.

**Step 4: Load Active Session**  
`active:<plate>` Redis key is checked. Contains `{ logId, entryTime }` if vehicle is currently on campus.

**Step 5: Route by Camera Type**

---

#### `cameraType: "SIGHTING"` (Interior Camera)

Records an interior sighting, attached to the vehicle's current active campus session.

| Condition | Action |
|-----------|--------|
| Active session exists (Redis) | Attach `Sighting` record to session |
| Redis empty, DB session found | Fallback: attach `Sighting` to DB session |
| No session anywhere | Create `ORPHAN` log + `ORPHAN_SIGHTING` 🚨 alert |

---

#### `cameraType: "ENTRY"` — Authorized Vehicle

| Condition | Action |
|-----------|--------|
| No active session | Create `ENTRY` log. Store `active:<plate>` in Redis (24h TTL) |
| Active session exists | 🚨 `CONCURRENT_ENTRY_OVERWRITE` alert. Old session left open. New `ENTRY` created |

---

#### `cameraType: "EXIT"` — Authorized Vehicle

| Condition | Action |
|-----------|--------|
| Active session in Redis | Calculate duration = `scanTime − entryTime`. Close log with `exitTime`. Delete Redis key |
| Redis empty, DB session found | Fallback DB query. Same close logic |
| No session anywhere | Create `ORPHAN` log + 🚨 `EXIT_WITHOUT_ENTRY` alert |

---

#### `cameraType: "ENTRY"` — Unverified Vehicle

| Condition | Action |
|-----------|--------|
| No active session | Create `ENTRY` log. Store `active:<plate>` (24h TTL). Schedule `checkOverstayBomb` (30-min delay) |
| Active session exists | 🚨 `CONCURRENT_ENTRY_OVERWRITE` alert. New `ENTRY` created |

---

#### `cameraType: "EXIT"` — Unverified Vehicle

| Condition | Action |
|-----------|--------|
| Active session in Redis | `duration = scanTime − entryTime`. If `duration > 1800s`: 🚨 `OVERSTAY` alert. Close log either way |
| Redis empty, DB session found | Same close logic with math-safe `scanTime − dbSession.entryTime` |
| No session anywhere | Create `ORPHAN` log + 🚨 `EXIT_WITHOUT_ENTRY` alert |

> **30-minute Overstay Bomb:** When an Unverified vehicle enters, a BullMQ delayed job (`delay: 1800000ms`) is scheduled. At exactly 30 minutes, `processOverstayBomb` wakes up and checks if the vehicle **still has no `exitTime`**. If so, it fires an `ACTIVE_OVERSTAY_ALARM` alert instantly over SSE to all connected dashboards.
>
> Duration is always computed from **`scanTime` (camera timestamp)**, never `Date.now()` — immune to server/queue lag.

---

### GET `/api/v1/scan/logs` — All Logs (Paginated + Filtered)

🔒 Requires admin JWT.

```
?page=1&limit=20
?authorized=true|false
?logType=ENTRY|EXIT|ORPHAN
?cameraId=<uuid>
?from=2025-01-01&to=2025-01-31
```

---

### GET `/api/v1/scan/logs/active` — Vehicles Currently On Campus

🔒 Requires admin JWT.

Returns all logs where `exitTime = null`.

---

### GET `/api/v1/scan/logs/:vehicleNo` — Vehicle History

🔒 Requires admin JWT.

```
?from=2025-01-01&to=2025-02-28
```

---

## Alert System

### Database Storage

Every anomaly is saved to the `alerts` table via `broadcastAlert()`. This helper:
1. Inserts the `Alert` row inside the active Prisma `$transaction`.
2. Emits `NEW_ALERT` on the global Node.js `EventEmitter` — which pushes it instantly to all connected SSE clients.

**Alert Types:**

| `alertType` | Severity | Trigger |
|-------------|----------|---------|
| `ORPHAN_SIGHTING` | 🟡 Medium | Interior camera saw a vehicle with no ENTRY session |
| `CONCURRENT_ENTRY_OVERWRITE` | 🟠 High | Vehicle scanned at ENTRY gate while already inside |
| `EXIT_WITHOUT_ENTRY` | 🟠 High | Vehicle scanned at EXIT gate with no ENTRY record |
| `OVERSTAY` | 🔴 Critical | Unverified vehicle exceeded 30-min window at EXIT |
| `ACTIVE_OVERSTAY_ALARM` | 🔴 Critical | Unverified vehicle still inside at exactly 30-min mark |

**Alert Model:**

```json
{
  "id":          "uuid",
  "alertType":   "OVERSTAY",
  "status":      "OPEN",
  "description": "Unverified vehicle exited. Session exceeded 30m timeframe (2140s).",
  "rawPlate":    "DL 3C AF 0001",
  "cameraId":    "uuid",
  "logId":       "uuid",
  "createdAt":   "2025-03-26T16:34:00Z"
}
```

`status` lifecycle: `OPEN` → `ACKNOWLEDGED` → `RESOLVED`

---

### Real-Time SSE Stream

**`GET /api/v1/alerts/stream`** — 🔒 JWT required. Rate limited at 100 req/15min.

The dashboard makes a persistent HTTP connection. The server keeps the line open and pushes events as they occur.

**Frontend usage:**
```javascript
const stream = new EventSource("/api/v1/alerts/stream", {
    headers: { Authorization: `Bearer ${token}` }
});

stream.onmessage = (e) => {
    const alert = JSON.parse(e.data);
    if (alert.type === "CONNECTED") return; // Handshake
    // alert = { id, alertType, rawPlate, description, cameraId, logId, ... }
    showNotification(alert);
};
```

**Events pushed:**

| Event | When |
|-------|------|
| `CONNECTED` | Immediately on subscription (handshake) |
| `NEW_ALERT` | Any anomaly detected by the scan pipeline |

---

## Redis Key Reference

| Key | Stores | TTL |
|-----|--------|-----|
| `vehicle:<plate>` | `{ isAuthorized, vehicleId }` | 24h |
| `active:<plate>` | `{ logId, entryTime }` | 24h |
| `camera:<id>` | Full camera config object | 24h |
| `lock:vehicle:<hash>` | Redlock mutex | 3s (auto-released) |
| BullMQ internal keys | Job queues, delayed job timers | Managed by BullMQ |

> **Note:** `unauth:<plate>` keys have been removed. Overstay detection is now entirely math-driven (`scanTime − entryTime > 1800s`) and proactive-bomb-driven (BullMQ `checkOverstayBomb`), making it completely immune to Redis eviction timing edge-cases.

---

## Error Reference

| Status | Meaning |
|--------|---------|
| `400` | Bad request / missing required field / invalid plate format |
| `401` | Invalid / expired token or OTP |
| `403` | Account not verified / forbidden |
| `404` | Resource not found (camera, vehicle, log) |
| `409` | Conflict — duplicate vehicleNo / stickerNo / email |
| `422` | Low confidence OCR scan rejected by the worker |
| `429` | Rate limit exceeded (100 req/15min dashboard / 1000 req/min camera) |
| `500` | Internal server error |

**Worker-specific errors (BullMQ retry policy):**

| Error Class | Retries | Behavior |
|-------------|---------|----------|
| `CameraNotFoundError` | 0 | Job dropped — camera UUID is invalid |
| `ValidationError` | 0 | Job dropped — payload missing required fields |
| Generic `Error` | Up to 3 | BullMQ exponential backoff retry |
