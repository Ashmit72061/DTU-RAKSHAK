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
|--------|----------|------|---------|
| GET | `/health` | — | `{ status: "ok" }` |
| POST | `/auth/signup` | `{ email, password }` | `201` OTP sent |
| POST | `/auth/signup/verify-otp` | `{ email, otp }` | `accessToken` + cookie |
| POST | `/auth/signin` | `{ email, password }` | `200` OTP sent |
| POST | `/auth/signin/verify-otp` | `{ email, otp }` | `accessToken` + cookie |
| POST | `/auth/refresh-token` | cookie / `{ refreshToken }` | new `accessToken` |
| POST 🔒 | `/auth/logout` | — | clears cookie |

**2-step flow:** credentials → OTP email → verify-otp → get token

---

## 🔒 Vehicles — `/api/v1/vehicles`

| Method | Endpoint | Notes |
|--------|----------|-------|
| GET | `/vehicles?search=DL&page=1&limit=15` | Paginated list |
| POST | `/vehicles` | Create registered vehicle |
| POST | `/vehicles/bulk` | Bulk import from CSV |
| GET | `/vehicles/:vehicleNo` | Single vehicle + its logs |
| PUT | `/vehicles/:vehicleNo` | Update vehicle |
| DELETE | `/vehicles/:vehicleNo` | Delete vehicle |

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
> `cameraType`: `"ENTRY"` | `"EXIT"` | `"BOTH"` | `"INTERIOR"`

**POST `/cameras/bulk` — CSV import:**

- **Content-Type:** `multipart/form-data`
- **Field:** `file` — a `.csv` file (max 5 MB)
- **CSV columns (first row = header):** `lat`, `long`, `cameraType`, `cameraLocation`
- `lat` / `long` must be valid numbers; `cameraType` must be one of the enum values above.

```json
// Response data shape
{
  "inserted": 5,
  "skipped": 0,
  "errors": [
    { "row": 3, "reason": "Invalid cameraType \"outdoor\" — must be one of: ENTRY, EXIT, BOTH, INTERIOR" }
  ]
}
```

---

## 🔒 Scan — `/api/v1/scan`

### POST `/scan` — Process hardware JSON

> **Auth:** `X-Edge-Api-Key: <secret>` header — **NOT** a user JWT. Edge devices (YOLO + Flask cameras) use a shared long-lived API key stored in the `EDGE_API_KEY` env var.

Accepts the JSON payload sent by camera hardware. No image upload needed.

```json
{
  "camera_id":  "uuid-of-camera",
  "vehicle_no": "DL3CAF0001",
  "timestamp":  "2025-02-22T09:00:00Z",
  "confidence": 0.94,
  "raw_plate":  "DL 3C AF 0001"
}
```
> `timestamp`, `confidence`, `raw_plate` are optional

**Possible responses by scenario:**

| Event | `isAuthorized` | Response |
|-------|---------------|----------|
| Registered vehicle, no active session | `true` | `ENTRY` granted |
| Registered vehicle, active session exists | `true` | `EXIT` recorded |
| Unverified vehicle, first scan | `false` | `ENTRY` + 30-min window starts |
| Unverified vehicle, seen again < 30min | `false` | `EXIT` within window |
| Unverified vehicle, seen again > 30min | `false` | `OVERSTAY_EXIT` 🚨 alert |
| INTERIOR camera, any vehicle | any | `SIGHTING` log only |

**Sample success response:**
```json
{
  "data": {
    "event": "ENTRY",
    "vehicleNo": "DL3CAF0001",
    "isAuthorized": true,
    "vehicleInfo": { "name": "Rahul", "dept": "CSE", "vehicleType": "2W" },
    "message": "✅ Entry granted — registered vehicle",
    "camera": { "id": "...", "location": "Main Gate" },
    "log": { ... }
  }
}
```

---

### GET `/scan/logs` — All logs (paginated + filtered)

```
?page=1&limit=20
?authorized=true|false
?logType=ENTRY|EXIT|SIGHTING
?cameraId=<uuid>
?from=2025-01-01&to=2025-01-31
```

### GET `/scan/logs/active` — Vehicles currently on campus

Returns all logs where `exitTime = null`. Unverified vehicles include `remainingSeconds` and `isOverdue` from Redis.

### GET `/scan/logs/:vehicleNo` — Vehicle history

```
?from=2025-01-01&to=2025-02-28
```
Also returns `currentlyOnCampus` (bool) and `unauthStatus` (if active 30-min window).

---

## Redis Key Reference

| Key | Stores | TTL |
|-----|--------|-----|
| `vehicle:DL3CAF0001` | `{ isAuthorized, name, dept }` | 24h |
| `active:DL3CAF0001` | entry log ID | 24h |
| `unauth:DL3CAF0001` | `{ logId, entryTime, allowedUntil }` | 30min |

---

## Error Reference

| Status | Meaning |
|--------|---------|
| `400` | Bad request / invalid plate format |
| `401` | Invalid / expired token or OTP |
| `403` | Account not verified |
| `404` | Resource not found |
| `409` | Duplicate (email / vehicleNo / stickerNo) |
| `429` | Rate limit exceeded (100 req / 15min) |
| `500` | Server error |
