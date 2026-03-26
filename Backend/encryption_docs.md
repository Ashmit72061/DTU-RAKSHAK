# DTU Rakshak — Data Encryption Architecture

This document details the implementation of AES-256-GCM encryption applied to sensitive fields (`vehicleNo` and `mobileNo`) in the backend.

## 1. Overview & Security Goals
To ensure privacy, sensitive vehicle records and mobile numbers are stored as completely opaque, encrypted blobs in the PostgreSQL database.
- **Algorithm:** `AES-256-GCM` (Authenticated encryption).
- **Key:** A 32-byte (256-bit) cryptographically strong key injected via the `ENCRYPTION_KEY` environment variable.
- **Initialization Vector (IV):** A unique, random 12-byte IV is generated for every single encrypt operation, ensuring that identical plaintexts result in entirely different ciphertexts.

**What is encrypted?**
- `vehicles.vehicleNo`
- `vehicles.mobileNo`

**What remains plaintext?**
- Non-sensitive search fields (`name`, `dept`, `stickerNo`)
- The raw OCR string (`rawPlate`) from the edge camera (used for debug/audit logs).

---

## 2. The Searchability Problem & Hashing
Because AES-256-GCM produces different outputs every time (even for the same input), we cannot write SQL queries like:
`SELECT * FROM vehicles WHERE vehicleNo = '...'`

### The Solution: Deterministic Hashing
Alongside every encrypted blob, the backend stores a deterministic SHA-256 hash of the **normalized** plaintext value.
- `vehicles.vehicleNoHash`
- `vehicles.mobileNoHash`
- `entry_exit_logs.vehicleNoHash`

**Normalization Rules:**
Before hashing or encrypting, inputs are heavily cleaned so slight typos don't break lookups.
1. **Phones:** `+91 987-654-3210` → `+919876543210` (Strips non-digits, ensures +91 prefix for 10-digit numbers).
2. **Plates:** `dl 3c af 0001` → `DL3CAF0001` (Uppercased, spaces/symbols stripped, OCR artifacts like 'IND' or 'REG' removed).

When the API needs to find a vehicle, it hashes the incoming search string and does an exact-match lookup against the `vehicleNoHash` column.

> **Note:** Because the data is encrypted, SQL `LIKE` queries (partial text search) are strictly impossible on encrypted columns.

---

## 3. Data Flow

### A. Write Flow (Creating/Updating a Vehicle)
1. **Input:** Client sends raw `vehicleNo` and `mobileNo` to `/api/v1/vehicles`.
2. **Normalize:** Backend strips spaces, dashes, and formats the strings.
3. **Hash:** Backend computes [hashField(normalized_value)](Backend/src/utils/crypto.util.js#69-80) for fast lookups.
4. **Encrypt:** Backend computes [encrypt(normalized_value)](Backend/scripts/backfill-encryption.js#26-32) generating a JSON object: `{ iv, content, tag }`.
5. **Database Insert:** Both the Hash string and the Encrypted JSON object are saved to the database.

### B. Read Flow (Fetching a Vehicle / Scan Response)
1. **Database Read:** Backend retrieves the row containing the encrypted JSON blob.
2. **Decrypt:** [decryptVehicle(dbRow)](Backend/src/utils/crypto.util.js#111-143) parses the JSON, reads the IV/Tag/Content, and decrypts the payload back to plaintext.
3. **Strip:** The `Hash` columns and raw encrypted blobs are deleted from the in-memory object.
4. **Response:** The client receives a normal JSON response with plain string fields. *The frontend is completely unaware that encryption is happening.*

### C. Edge Camera Scan Flow
1. **Scan:** Camera sends `{ "vehicle_no": "DL3CAF0001" }`.
2. **Normalize & Hash:** Backend normalizes the plate and calculates the SHA-256 hash.
3. **Lookup:** Backend queries Redis. If a cache miss occurs, it queries PostgreSQL: `SELECT * FROM vehicles WHERE vehicleNoHash = '<hash>'`.
4. **Log Entry:** When recording the `EntryExitLog`, the backend saves both the raw unencrypted plate from the camera (`vehicleNo`) *and* the deterministic hash (`vehicleNoHash`) so logs can be easily joined against the `vehicles` table.

---

## 4. Crypto Utility ([src/utils/crypto.util.js](./src/utils/crypto.util.js))

All encryption logic is centralized in one file.

### [encrypt(plaintext)](./scripts/backfill-encryption.js#26-32)
Generates a random 12-byte IV, encrypts the UTF-8 plaintext using `AES-256-GCM`, and returns a hex-encoded object:
```javascript
{
  "iv": "a1b2c3d4e5f6...",
  "content": "9f8e7d6c5b4a...",
  "tag": "112233445566..."
}
```

### [decrypt({ iv, content, tag })](./src/utils/crypto.util.js#45-68)
Rebuilds the AES decipher using the environment key and the provided IV/Tag.
Throws an error if the auth tag fails validation (meaning the data was tampered with in the DB).

### [hashField(normalizedValue)](./src/utils/crypto.util.js#69-80)
Creates a fast, deterministic SHA-256 hash.

### [decryptVehicle(vehicleObj)](./src/utils/crypto.util.js#111-143)
A middleware-like helper used by controllers just before sending a response. It tries to decrypt `mobileNo` and `vehicleNo`. If decryption fails (e.g., due to legacy unencrypted data during migrations), it gracefully falls back to returning the raw string. It then strips internal fields like `vehicleNoHash` from the response payload.
