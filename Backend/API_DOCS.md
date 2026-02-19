# CCTV Project — Backend API Documentation

## Table of Contents

- [Setup & Installation](#setup--installation)
- [Environment Variables](#environment-variables)
- [Running the Server](#running-the-server)
- [API Overview](#api-overview)
- [Response Format](#response-format)
- [Authentication Flow](#authentication-flow)
- [Endpoints](#endpoints)
  - [Health Check](#1-health-check)
  - [Signup](#2-signup)
  - [Verify Signup OTP](#3-verify-signup-otp)
  - [Signin](#4-signin)
  - [Verify Signin OTP](#5-verify-signin-otp)
  - [Refresh Token](#6-refresh-token)
  - [Logout](#7-logout)
- [Error Codes Reference](#error-codes-reference)

---

## Setup & Installation

### Prerequisites

| Requirement | Version | Purpose |
|---|---|---|
| Node.js | ≥ 18.x | Runtime |
| PostgreSQL | Any (Supabase hosted) | Primary database |
| Redis | ≥ 6.x | Ephemeral OTP storage |

### Step-by-step

```bash
# 1. Clone the repo and navigate to the backend
cd Backend

# 2. Install dependencies
npm install

# 3. Copy the sample env and fill in your values
cp .env.sample .env
# → Edit .env with your credentials (see next section)

# 4. Generate the Prisma client
npm run prisma:generate

# 5. Push the schema to your database (creates the `users` table)
npm run prisma:push

# 6. Start the dev server
npm run dev
```

---

## Environment Variables

Create a `.env` file in the project root. Every variable is **required** — the server will refuse to start if any are missing.

```env
# ──── Server ────
PORT=5000                      # Port the server listens on
NODE_ENV=development           # "development" or "production"
CORS_ORIGIN=*                  # Allowed origins (* for dev, specific URL for prod)

# ──── Database ────
DATABASE_URL=postgresql://user:password@host:5432/dbname

# ──── Redis ────
REDIS_URL=redis://localhost:6379

# ──── JWT ────
ACCESS_TOKEN_SECRET=<random-string>     # openssl rand -hex 32
ACCESS_TOKEN_EXPIRY=15m                 # Access token lifetime
REFRESH_TOKEN_SECRET=<random-string>    # openssl rand -hex 32
REFRESH_TOKEN_EXPIRY=7d                 # Refresh token lifetime

# ──── Email (SMTP) ────
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password            # Gmail → App Passwords

# ──── OTP ────
OTP_EXPIRY_MINUTES=5                   # OTP validity window
```

> **Generating JWT secrets**: Run `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` to generate a secure random string.

> **Gmail App Password**: Go to [Google Account → Security → App Passwords](https://myaccount.google.com/apppasswords) and generate one for "Mail".

---

## Running the Server

```bash
# Development (auto-restart on file changes)
npm run dev

# Production
npm start
```

### Available npm scripts

| Script | Command | Description |
|---|---|---|
| `npm run dev` | `nodemon src/server.js` | Development server with hot-reload |
| `npm start` | `node src/server.js` | Production server |
| `npm run prisma:generate` | `prisma generate` | Regenerate Prisma client after schema changes |
| `npm run prisma:push` | `prisma db push` | Push schema to database |
| `npm run prisma:studio` | `prisma studio` | Open Prisma Studio (DB GUI) |

---

## API Overview

**Base URL**: `http://localhost:5000/api/v1`

All endpoints accept and return **JSON**. Set the header:

```
Content-Type: application/json
```

For protected endpoints, include the access token:

```
Authorization: Bearer <access_token>
```

---

## Response Format

Every response follows a consistent shape.

### Success Response

```json
{
  "statusCode": 200,
  "data": { ... },
  "message": "Descriptive success message",
  "success": true
}
```

### Error Response

```json
{
  "statusCode": 400,
  "message": "Descriptive error message",
  "success": false,
  "errors": [],
  "stack": "..."       // Only in development
}
```

---

## Authentication Flow

The auth system uses a **two-step verification** for both signup and signin.

### Signup Flow

```
Client                          Server                      Email
  │                               │                           │
  ├── POST /auth/signup ─────────►│                           │
  │   { email, password }         │── Generate OTP ──────────►│
  │                               │   Store in Redis (TTL)    │── OTP Email ──►
  │◄── 201 "OTP sent" ───────────┤                           │
  │                               │                           │
  ├── POST /auth/signup/          │                           │
  │   verify-otp ────────────────►│                           │
  │   { email, otp }              │── Verify from Redis       │
  │                               │── Mark user verified      │
  │◄── 200 { accessToken } ──────┤                           │
  │   + refresh_token cookie      │                           │
```

### Signin Flow

```
Client                          Server                      Email
  │                               │                           │
  ├── POST /auth/signin ─────────►│                           │
  │   { email, password }         │── Validate credentials    │
  │                               │── Generate OTP ──────────►│
  │                               │   Store in Redis (TTL)    │── OTP Email ──►
  │◄── 200 "OTP sent" ───────────┤                           │
  │                               │                           │
  ├── POST /auth/signin/          │                           │
  │   verify-otp ────────────────►│                           │
  │   { email, otp }              │── Verify from Redis       │
  │◄── 200 { accessToken } ──────┤                           │
  │   + refresh_token cookie      │                           │
```

### Token Lifecycle

- **Access Token** → Short-lived (default 15min), sent in JSON response body
- **Refresh Token** → Long-lived (default 7 days), sent as `httpOnly` cookie (`refresh_token`)
- When the access token expires, use `/auth/refresh-token` to get a new pair
- On each refresh, the old refresh token is invalidated (rotation)

---

## Endpoints

### 1. Health Check

Check if the server is running.

```
GET /api/v1/health
```

**Auth Required**: No

**Response** `200 OK`:

```json
{
  "statusCode": 200,
  "data": { "status": "ok" },
  "message": "Server is healthy",
  "success": true
}
```

---

### 2. Signup

Register a new user with email and password. Sends an OTP to the provided email for verification.

```
POST /api/v1/auth/signup
```

**Auth Required**: No

**Request Body**:

| Field | Type | Required | Description |
|---|---|---|---|
| `email` | `string` | ✅ | Valid email address |
| `password` | `string` | ✅ | User password (min recommended: 8 chars) |

```json
{
  "email": "user@example.com",
  "password": "SecureP@ss123"
}
```

**Success Response** `201 Created`:

```json
{
  "statusCode": 201,
  "data": {
    "email": "user@example.com"
  },
  "message": "OTP sent to your email. Please verify to complete signup.",
  "success": true
}
```

**Error Responses**:

| Status | Condition |
|---|---|
| `400 Bad Request` | Missing `email` or `password` |
| `409 Conflict` | A verified account with this email already exists |

---

### 3. Verify Signup OTP

Submit the OTP received via email to complete registration. Returns authentication tokens on success.

```
POST /api/v1/auth/signup/verify-otp
```

**Auth Required**: No

**Request Body**:

| Field | Type | Required | Description |
|---|---|---|---|
| `email` | `string` | ✅ | Same email used in signup |
| `otp` | `string` | ✅ | 6-digit OTP from email |

```json
{
  "email": "user@example.com",
  "otp": "482957"
}
```

**Success Response** `200 OK`:

```json
{
  "statusCode": 200,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "email": "user@example.com"
  },
  "message": "Email verified successfully",
  "success": true
}
```

> **Cookie Set**: `refresh_token` — httpOnly, secure (in production), sameSite=strict, maxAge=7d

**Error Responses**:

| Status | Condition |
|---|---|
| `400 Bad Request` | Missing `email` or `otp` |
| `401 Unauthorized` | Invalid or expired OTP |

---

### 4. Signin

Authenticate with email and password. If credentials are valid, sends an OTP for second-factor verification.

```
POST /api/v1/auth/signin
```

**Auth Required**: No

**Request Body**:

| Field | Type | Required | Description |
|---|---|---|---|
| `email` | `string` | ✅ | Registered email |
| `password` | `string` | ✅ | Account password |

```json
{
  "email": "user@example.com",
  "password": "SecureP@ss123"
}
```

**Success Response** `200 OK`:

```json
{
  "statusCode": 200,
  "data": {
    "email": "user@example.com"
  },
  "message": "OTP sent to your email. Please verify to complete sign-in.",
  "success": true
}
```

**Error Responses**:

| Status | Condition |
|---|---|
| `400 Bad Request` | Missing `email` or `password` |
| `401 Unauthorized` | Invalid email or password |
| `403 Forbidden` | Account exists but is not verified |

---

### 5. Verify Signin OTP

Submit the OTP received via email to complete sign-in. Returns authentication tokens on success.

```
POST /api/v1/auth/signin/verify-otp
```

**Auth Required**: No

**Request Body**:

| Field | Type | Required | Description |
|---|---|---|---|
| `email` | `string` | ✅ | Same email used in signin |
| `otp` | `string` | ✅ | 6-digit OTP from email |

```json
{
  "email": "user@example.com",
  "otp": "739214"
}
```

**Success Response** `200 OK`:

```json
{
  "statusCode": 200,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "email": "user@example.com"
  },
  "message": "Signed in successfully",
  "success": true
}
```

> **Cookie Set**: `refresh_token` — httpOnly, secure (in production), sameSite=strict, maxAge=7d

**Error Responses**:

| Status | Condition |
|---|---|
| `400 Bad Request` | Missing `email` or `otp` |
| `401 Unauthorized` | Invalid or expired OTP |
| `404 Not Found` | User does not exist |

---

### 6. Refresh Token

Get a new access token using the refresh token. The refresh token is read from the `refresh_token` cookie (preferred) or from the request body.

```
POST /api/v1/auth/refresh-token
```

**Auth Required**: No (uses refresh token instead)

**Request Body** *(optional — only if not using cookies)*:

| Field | Type | Required | Description |
|---|---|---|---|
| `refreshToken` | `string` | ❌ | Refresh token (if not sent via cookie) |

```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

> If the `refresh_token` cookie is present, the body field is not needed.

**Success Response** `200 OK`:

```json
{
  "statusCode": 200,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs..."
  },
  "message": "Access token refreshed",
  "success": true
}
```

> **Cookie Updated**: A new `refresh_token` cookie replaces the old one (token rotation).

**Error Responses**:

| Status | Condition |
|---|---|
| `401 Unauthorized` | Missing, invalid, expired, or revoked refresh token |

---

### 7. Logout

Invalidate the refresh token and clear the cookie. **Requires authentication.**

```
POST /api/v1/auth/logout
```

**Auth Required**: ✅ Yes

**Headers**:

```
Authorization: Bearer <access_token>
```

**Request Body**: None

**Success Response** `200 OK`:

```json
{
  "statusCode": 200,
  "data": null,
  "message": "Logged out successfully",
  "success": true
}
```

> **Cookie Cleared**: `refresh_token` cookie is removed.

**Error Responses**:

| Status | Condition |
|---|---|
| `401 Unauthorized` | Missing or invalid access token |

---

## Error Codes Reference

| HTTP Status | Code | Meaning | Common Causes |
|---|---|---|---|
| `400` | Bad Request | Invalid input | Missing required fields |
| `401` | Unauthorized | Authentication failed | Invalid credentials, expired token, wrong OTP |
| `403` | Forbidden | Access denied | Unverified account |
| `404` | Not Found | Resource missing | User doesn't exist |
| `409` | Conflict | Duplicate resource | Email already registered |
| `429` | Too Many Requests | Rate limited | More than 100 requests in 15 minutes |
| `500` | Internal Server Error | Server failure | Unexpected error (check logs) |

---

## Rate Limiting

All endpoints are rate-limited:

- **Window**: 15 minutes
- **Max Requests**: 100 per window per IP

When exceeded, the response is:

```json
{
  "statusCode": 429,
  "message": "Too many requests, please try again later.",
  "success": false
}
```

---

## Security Features

| Feature | Implementation |
|---|---|
| Password Hashing | bcrypt (10 salt rounds) |
| OTP Storage | Redis with TTL auto-expiry (not in DB) |
| OTP Format | 6-digit cryptographically secure random number |
| Access Token | JWT, short-lived (configurable, default 15min) |
| Refresh Token | JWT, long-lived (configurable, default 7d), stored in httpOnly cookie |
| Token Rotation | New refresh token on every refresh; old one invalidated |
| Security Headers | Helmet.js |
| CORS | Configurable origin |
| Rate Limiting | 100 req / 15 min per IP |
| Body Size Limit | 16kb |
