# DTU Rakshak — Campus Vehicle Monitoring System

> AI-powered real-time vehicle entry/exit tracking for Delhi Technological University  
> Built by **SkillOp Technical Society, DTU**

---

## What It Does

- Camera hardware sends a **JSON payload** (plate number + camera ID + timestamp) to the backend
- Backend checks vehicle registration via **Redis cache → PostgreSQL**
- **Authorized vehicles** (registered with stickers) → entry granted, duration tracked
- **Unverified vehicles** (cabs, autos, delivery) → allowed with a **30-minute stay limit**
- **Interior cameras** → log vehicle sightings inside campus
- Admin dashboard (React frontend) shows live vehicle status, logs, analytics

---

## Project Structure

```
DTU-RAKSHAK/
├── Backend/          ← Express.js API (Node 18+)
├── Frontend/         ← React + Vite dashboard
└── model/            ← Python Flask AI service (future hardware integration)
```

---

## Stack

| Layer | Technology |
|-------|-----------|
| API Server | Node.js + Express |
| Database | PostgreSQL via Supabase |
| Cache / Sessions | Redis (Upstash or local) |
| ORM | Prisma |
| Auth | JWT (access + refresh) + OTP via email |
| Frontend | React + Vite |
| AI Model | Python + YOLO (future) |

---

## First-Time Setup

### Prerequisites
- Node.js ≥ 18
- A PostgreSQL database (free tier on [Supabase](https://supabase.com))
- A Redis instance ([Upstash](https://upstash.com) free tier or local)
- Gmail account for OTP emails

### 1. Clone & install

```bash
git clone <repo-url>
cd DTU-RAKSHAK/Backend
npm install
```

### 2. Configure environment

```bash
cp .env.sample .env   # then edit .env
```

```env
PORT=5000
NODE_ENV=development
CORS_ORIGIN=*

# Supabase → Settings → Database → URI
DATABASE_URL=postgresql://postgres:<password>@db.xxx.supabase.co:5432/postgres

# Upstash → REST URL → use rediss:// format
REDIS_URL=rediss://:password@xxx.upstash.io:6379

# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ACCESS_TOKEN_SECRET=<random-32-byte-hex>
ACCESS_TOKEN_EXPIRY=15m
REFRESH_TOKEN_SECRET=<random-32-byte-hex>
REFRESH_TOKEN_EXPIRY=7d

# Gmail → myaccount.google.com/apppasswords
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@gmail.com
SMTP_PASS=your-app-password

OTP_EXPIRY_MINUTES=5
```

### 3. Setup database

```bash
npm run prisma:generate   # generate Prisma client
npm run prisma:push       # create tables in your DB
```

### 4. Start dev server

```bash
npm run dev               # runs on http://localhost:5000
```

---

## Starting All Services

Open 3 terminals:

```bash
# Terminal 1 — Backend API
cd Backend
npm run dev

# Terminal 2 — Frontend Dashboard
cd Frontend
npm run dev       # http://localhost:5173

# Terminal 3 — AI Model (optional)
cd model
python ai_service.py # http://localhost:5001
```

---

## How It Works — Full Flow

```
[Camera Hardware / Hardware JSON]
        │
        ▼
POST /api/v1/scan
  {camera_id, vehicle_no, timestamp, confidence}
        │
        ├─── Is camera INTERIOR?
        │         └── Log SIGHTING → done
        │
        └─── Gate camera (ENTRY/EXIT/BOTH)
                  │
                  ├── Check Redis: vehicle:DL3CAF0001
                  │     hit  → use cached auth status
                  │     miss → query DB → cache 24h
                  │
                  ├── AUTHORIZED (in vehicles table)?
                  │     no active session  → ENTRY logged + Redis active key set
                  │     active session     → EXIT logged + duration computed + Redis key deleted
                  │
                  └── UNVERIFIED (cab/auto/taxi/delivery)?
                        not seen before    → ENTRY logged + 30-min Redis timer set
                        within 30 min      → EXIT logged + Redis cleaned up
                        over 30 min        → OVERSTAY ALERT 🚨 + Redis cleaned up
```

---

## Database Tables

| Table | Purpose |
|-------|---------|
| `users` | Admin accounts (email + bcrypt password + OTP auth) |
| `vehicles` | Registered campus vehicles with sticker info |
| `cameras` | Campus cameras with type and GPS location |
| `entry_exit_logs` | All entry/exit/sighting events — one shared table |

---

## API Quick Reference

**Base URL:** `http://localhost:5000/api/v1`

| Method | Endpoint | Description |
|---|---|---|
| POST | `/scan` | 🔒 Process hardware scan JSON |
| GET | `/scan/logs` | 🔒 All logs (filterable) |
| GET | `/scan/logs/active` | 🔒 Vehicles currently on campus |
| GET | `/vehicles` | 🔒 List/Add/Update/Delete vehicles |
| POST | `/auth/signin` | Login / Verify OTP |

> 🔒 = requires `Authorization: Bearer <accessToken>` header  
> Full request/response details: see `API_DOCS.md`
