# DTU Rakshak — Frontend Documentation

> **Comprehensive reference** for the DTU Rakshak campus vehicle monitoring frontend.
> Built with **React 19 + Vite 7 + Vanilla CSS**.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack & Dependencies](#2-tech-stack--dependencies)
3. [Getting Started](#3-getting-started)
4. [Directory Structure](#4-directory-structure)
5. [Architecture & Data Flow](#5-architecture--data-flow)
6. [Routing & Navigation](#6-routing--navigation)
7. [Authentication Flow](#7-authentication-flow)
8. [API Layer (`api.js`)](#8-api-layer-apijs)
9. [Components Reference](#9-components-reference)
   - 9.1 [Sidebar](#91-sidebar)
10. [Pages Reference](#10-pages-reference)
    - 10.1 [Landing Page](#101-landing-page)
    - 10.2 [Login](#102-login)
    - 10.3 [Signup](#103-signup)
    - 10.4 [Dashboard](#104-dashboard)
    - 10.5 [Vehicles](#105-vehicles)
    - 10.6 [Cameras](#106-cameras)
    - 10.7 [Logs (Entry / Exit)](#107-logs-entry--exit)
11. [Styling & Design System](#11-styling--design-system)
12. [Build & Dev Configuration](#12-build--dev-configuration)
13. [Conventions & Patterns](#13-conventions--patterns)
14. [Scalability Guide](#14-scalability-guide)

---

## 1. Project Overview

DTU Rakshak is a **campus vehicle monitoring system** for Delhi Technological University. The frontend provides:

| Capability | Description |
|---|---|
| **OTP-based Authentication** | Email + password → 6-digit OTP verification |
| **Dashboard** | Real-time stats, line/pie charts, recent scan logs |
| **Vehicle Registry** | Full CRUD for registered campus vehicles |
| **Camera Management** | Register/edit/delete CCTV cameras at campus gates |
| **Entry/Exit Logs** | Tabbed view (All / On-Campus / Unauthorized) with search, filters, and pagination |
| **Landing Page** | Public-facing page with features, how-it-works, and team sections |

---

## 2. Tech Stack & Dependencies

### Runtime Dependencies

| Package | Version | Purpose |
|---|---|---|
| `react` | ^19.2.0 | UI library |
| `react-dom` | ^19.2.0 | DOM renderer |
| `react-router-dom` | ^7.13.0 | Client-side routing |
| `axios` | ^1.13.5 | HTTP client for API calls |
| `recharts` | ^3.7.0 | Charts (Line, Pie) on Dashboard |
| `lucide-react` | ^0.575.0 | Icon library (Sidebar, buttons, tables) |

### Dev Dependencies

| Package | Purpose |
|---|---|
| `vite` ^7.3.1 | Build tool and dev server |
| `@vitejs/plugin-react` ^5.1.1 | React support for Vite (Babel / Fast Refresh) |
| `eslint` ^9.39.1 | Linting |
| `eslint-plugin-react-hooks` | Hooks rules enforcement |
| `eslint-plugin-react-refresh` | HMR-safe component export rules |

---

## 3. Getting Started

```bash
# 1. Install dependencies
cd Frontend
npm install

# 2. Start dev server (port 5173 by default)
npm run dev

# 3. Build for production
npm run build

# 4. Preview production build
npm run preview

# 5. Lint
npm run lint
```

> **Note:** The Vite dev server proxies `/api` requests to `http://localhost:5000` (the backend). Ensure the backend is running before using the app.

---

## 4. Directory Structure

```
Frontend/
├── index.html              # SPA entry point (mounts #root)
├── package.json            # Dependencies and scripts
├── vite.config.js          # Vite configuration + API proxy
├── eslint.config.js        # ESLint flat config
├── public/
│   ├── dtu-logo.png        # DTU logo (used across the app)
│   └── vite.svg            # Favicon
└── src/
    ├── main.jsx            # React entry — renders <App /> into #root
    ├── App.jsx             # Root component: routing, auth guards, layout
    ├── App.css             # Legacy Vite template styles (unused)
    ├── api.js              # Axios instance, interceptors, all API functions
    ├── index.css           # Global stylesheet — entire design system (~1660 lines)
    ├── assets/
    │   └── react.svg       # Default Vite asset (unused)
    ├── components/
    │   └── Sidebar.jsx     # Navigation sidebar for authenticated views
    └── pages/
        ├── Landing.jsx     # Public landing/marketing page
        ├── Login.jsx       # Sign-in with OTP verification
        ├── Signup.jsx      # Registration with OTP verification
        ├── Dashboard.jsx   # Overview stats, charts, recent activity
        ├── Vehicles.jsx    # Vehicle CRUD table with modal forms
        ├── Cameras.jsx     # Camera CRUD table with modal forms
        └── Logs.jsx        # Entry/exit log viewer with tabs and filters
```

---

## 5. Architecture & Data Flow

```
┌──────────────────────────────────────────────────────┐
│                    index.html                         │
│                   <div id="root">                     │
└───────────────────────┬──────────────────────────────┘
                        │
                   main.jsx
                   (StrictMode + createRoot)
                        │
                    App.jsx
                 ┌──────┴───────┐
                 │  BrowserRouter │
                 └──────┬───────┘
                        │
          ┌─────────────┼─────────────────┐
          │             │                 │
     Public Routes   Auth Guard     Catch-all
     /  /login       (RequireAuth)    → /
     /signup              │
                  ┌───────┴────────┐
                  │  PrivateLayout  │
                  │  (Sidebar + X)  │
                  └───────┬────────┘
                          │
            ┌─────────────┼──────────────┐──────────┐
        /dashboard    /vehicles     /cameras      /logs
```

### Data Flow per Page

1. Page component mounts → calls API functions from `api.js`
2. `api.js` uses the shared Axios instance with:
   - **Request interceptor** → attaches `Authorization: Bearer <JWT>` from `localStorage`
   - **Response interceptor** → auto-clears storage and redirects to `/login` on 401
3. Backend response populates React state → UI renders
4. User actions (forms, buttons) trigger API calls → reload data on success

---

## 6. Routing & Navigation

Defined in `App.jsx`:

| Path | Component | Access | Description |
|---|---|---|---|
| `/` | `Landing` | Public | Marketing/landing page |
| `/login` | `Login` | Public (redirects if authed) | Email + password → OTP |
| `/signup` | `Signup` | Public (redirects if authed) | Registration + OTP |
| `/dashboard` | `Dashboard` | **Protected** | Stats, charts, recent logs |
| `/vehicles` | `Vehicles` | **Protected** | Vehicle registry table |
| `/cameras` | `Cameras` | **Protected** | Camera management table |
| `/logs` | `Logs` | **Protected** | Entry/exit log viewer |
| `*` | — | — | Redirects to `/` |

### Auth Guards

- **`RequireAuth`** — Wrapper component. Checks `localStorage.getItem('accessToken')`. If absent, redirects to `/login`.
- **`PrivateLayout`** — Wraps protected pages with the `Sidebar` component.
- **Already-authenticated redirect** — Login and Signup redirect to `/dashboard` if a token exists.

---

## 7. Authentication Flow

### Login (`Login.jsx`)

```
┌───────────────┐    signIn()     ┌─────────────┐   verifySigninOtp()   ┌──────────┐
│  Credentials  │ ──────────────► │  OTP Input   │ ──────────────────► │ Dashboard │
│  (email+pass) │    POST         │  (6 digits)  │     POST             │ (authed)  │
└───────────────┘  /auth/signin   └─────────────┘  /auth/signin/       └──────────┘
                                                    verify-otp
```

- **Step 1 (`credentials`):** User enters email + password → calls `signIn()` → on success, switches to step 2.
- **Step 2 (`otp`):** User enters 6-digit OTP → calls `verifySigninOtp()` → stores `accessToken` and `email` in `localStorage` → calls `onLogin()` prop to update App state.

### Signup (`Signup.jsx`)

Same two-step pattern but uses `signUp()` and `verifySignupOtp()`.
Additional field: **Confirm Password** (client-side match validation before API call).

### OTP Input UX

- 6 individual `<input>` fields, each `maxLength={1}`, `inputMode="numeric"`
- Auto-focus advances to next field on digit entry
- Backspace on empty field returns focus to previous field
- Refs managed via `useRef` array

### Token Storage

| Key | Value | Set When |
|---|---|---|
| `accessToken` | JWT string | OTP verification succeeds |
| `email` | User's email | OTP verification succeeds |

Cleared on logout (`localStorage.clear()`) or on 401 response (via Axios interceptor).

---

## 8. API Layer (`api.js`)

### Axios Instance

```js
const API = axios.create({ baseURL: '/api/v1' });
```

The `/api` prefix is proxied by Vite to `http://localhost:5000` in development.

### Interceptors

| Type | Behavior |
|---|---|
| **Request** | Attaches `Authorization: Bearer <token>` header from `localStorage` |
| **Response (error)** | On `401`, clears `localStorage` and redirects to `/login` |

### Exported API Functions

#### Auth

| Function | HTTP | Endpoint | Payload |
|---|---|---|---|
| `signIn(data)` | POST | `/auth/signin` | `{ email, password }` |
| `verifySigninOtp(data)` | POST | `/auth/signin/verify-otp` | `{ email, otp }` |
| `signUp(data)` | POST | `/auth/signup` | `{ email, password }` |
| `verifySignupOtp(data)` | POST | `/auth/signup/verify-otp` | `{ email, otp }` |
| `logout()` | POST | `/auth/logout` | — |

#### Vehicles

| Function | HTTP | Endpoint | Params/Payload |
|---|---|---|---|
| `getVehicles(params)` | GET | `/vehicles` | `{ search, page, limit }` |
| `getVehicle(vehicleNo)` | GET | `/vehicles/:vehicleNo` | — |
| `createVehicle(data)` | POST | `/vehicles` | Vehicle object |
| `updateVehicle(vehicleNo, data)` | PUT | `/vehicles/:vehicleNo` | Vehicle object |
| `deleteVehicle(vehicleNo)` | DELETE | `/vehicles/:vehicleNo` | — |

#### Cameras

| Function | HTTP | Endpoint | Params/Payload |
|---|---|---|---|
| `getCameras()` | GET | `/cameras` | — |
| `createCamera(data)` | POST | `/cameras` | Camera object |
| `updateCamera(id, data)` | PUT | `/cameras/:id` | Camera object |
| `deleteCamera(id)` | DELETE | `/cameras/:id` | — |

#### Scan / Logs

| Function | HTTP | Endpoint | Params/Payload |
|---|---|---|---|
| `getLogs(params)` | GET | `/scan/logs` | `{ page, limit, authorized }` |
| `getActiveLogs()` | GET | `/scan/logs/active` | — |
| `getVehicleLogs(vehicleNo)` | GET | `/scan/logs/:vehicleNo` | — |
| `scanPlate(formData)` | POST | `/scan` | `FormData` (multipart) |

---

## 9. Components Reference

### 9.1 Sidebar

**File:** `src/components/Sidebar.jsx`

The persistent navigation sidebar rendered in all authenticated views via `PrivateLayout`.

#### Structure

```
┌─────────────────────┐
│  🏛 DTU Rakshak     │  ← Logo + brand
│  Campus Security    │
├─────────────────────┤
│  Main               │  ← Section label
│  □ Dashboard        │  ← NavLink items
│  □ Vehicles         │
│  □ Cameras          │
│  □ Entry/Exit Logs  │
├─────────────────────┤
│  [A] Admin          │  ← User avatar + info
│  DTU Campus         │
│  [Sign Out]         │  ← Logout button
└─────────────────────┘
```

#### Navigation Items

| Route | Icon | Label |
|---|---|---|
| `/dashboard` | `LayoutDashboard` | Dashboard |
| `/vehicles` | `Car` | Vehicles |
| `/cameras` | `Camera` | Cameras |
| `/logs` | `ClipboardList` | Entry/Exit Logs |

#### Logout Behavior

1. Calls `logout()` API (server-side session cleanup)
2. Clears `localStorage`
3. Navigates to `/login`

#### Key Details

- Active link highlighted with green left border + green text (via `NavLink`'s `isActive` prop)
- User email initial shown as avatar badge
- Email read from `localStorage` with fallback `admin@dtu.ac.in`

---

## 10. Pages Reference

### 10.1 Landing Page

**File:** `src/pages/Landing.jsx`

The public-facing marketing page. Contains no API calls.

#### Sections

| Section | ID | Description |
|---|---|---|
| **Navbar** | — | Brand + anchor links (Features, How It Works, Team) + Sign In / Register CTAs |
| **Hero** | — | Full-screen dark gradient with headline, description, stats, floating particles, orbiting icons, and DTU logo |
| **Features** | `#features` | 3×2 grid of feature cards (Detection, Access, Duration, Alerts, Analytics, Multi-Camera) |
| **How It Works** | `#how` | 4-step pipeline (Camera → AI Detection → Auth Check → Log & Alert) |
| **Team** | `#team` | 4-column team member cards |
| **Footer** | — | DTU branding + copyright |

#### Custom Hook: `useScrollReveal()`

- Uses `IntersectionObserver` (threshold 0.12) to add CSS class `revealed` when elements with class `reveal` scroll into view
- Used for scroll-triggered fade-in animations on feature/step/team cards

#### Floating Particles

- 30 particles generated with random position, size, duration, delay, and opacity
- Rendered as `<div className="particle">` elements with CSS animation

---

### 10.2 Login

**File:** `src/pages/Login.jsx`

#### Props

| Prop | Type | Description |
|---|---|---|
| `onLogin` | `() => void` | Callback to update App-level auth state |

#### State Machine

| State | UI | Actions |
|---|---|---|
| `step = 'credentials'` | Email + password form | Submit → `signIn()` → move to `otp` step |
| `step = 'otp'` | 6-digit OTP input grid | Submit → `verifySigninOtp()` → store token → `onLogin()` |

#### Error Handling

- API errors surfaced via red `alert-error` banner
- Falls back to generic messages: `'Invalid credentials'` / `'Invalid OTP'`
- Loading state with spinner on submit button

---

### 10.3 Signup

**File:** `src/pages/Signup.jsx`

Identical architecture to Login with these differences:

| Aspect | Difference |
|---|---|
| **Extra field** | "Confirm Password" with client-side match check |
| **API calls** | `signUp()` + `verifySignupOtp()` |
| **Step names** | `'form'` → `'otp'` (instead of `'credentials'` → `'otp'`) |
| **CTA text** | "Create Account" / "Verify & Create Account" |

---

### 10.4 Dashboard

**File:** `src/pages/Dashboard.jsx`

The main overview page. Fetches all data on mount using `Promise.all`.

#### Data Sources (on mount)

```js
Promise.all([
  getLogs({ limit: 50 }),
  getActiveLogs(),
  getVehicles({ limit: 1 }),    // just need total count
  getCameras()
])
```

#### Stat Cards (top row)

| Stat | Source | Color |
|---|---|---|
| Registered Vehicles | `vehiclesRes.data.data.total` | Green |
| Active Cameras | `camerasRes.data.data.length` | Blue |
| Vehicles on Campus | `activeRes.data.data.count` | Amber |
| Unauthorized Today | Count of `!isAuthorized` from logs | Red |

#### Charts

| Chart | Library | Data |
|---|---|---|
| **Line Chart** — "Vehicle Entries Last 7 Days" | `recharts` `LineChart` | Logs grouped by day (`entryTime`) |
| **Pie Chart** — "Authorization Status" | `recharts` `PieChart` (donut) | Authorized vs Unauthorized count |

#### Recent Activity Table

Shows the 8 most recent scan logs with columns:

| Column | Source |
|---|---|
| Vehicle No. | `l.vehicleNo` (styled as `.plate`) |
| Camera | `l.camera.cameraLocation` |
| Entry Time | `l.entryTime` (formatted `en-IN`) |
| Duration | `l.vehicleDuration` (formatted `Xh Ym`) |
| Status | Badge: `✓ Authorized` (green) / `✗ Unauthorized` (red) |

#### Helper Functions

- **`fmt(seconds)`** — Converts seconds to human-readable duration (`2h 15m` or `15m`)

---

### 10.5 Vehicles

**File:** `src/pages/Vehicles.jsx`

Full CRUD management for the campus vehicle registry.

#### State

| State | Type | Purpose |
|---|---|---|
| `vehicles` | `array` | Current page of vehicles |
| `total` | `number` | Total count (for pagination) |
| `search` | `string` | Search query (plate, name, dept) |
| `page` | `number` | Current page (1-indexed) |
| `modal` | `null \| 'add' \| 'edit'` | Controls modal visibility and mode |
| `form` | `object` | Form data (bound to modal inputs) |
| `deleteId` | `string \| null` | Vehicle number pending deletion |

#### Vehicle Form Fields

| Field | Key | Type | Notes |
|---|---|---|---|
| Owner Name | `name` | text | Required |
| Father's Name | `fathersName` | text | Required |
| Vehicle No. | `vehicleNo` | text | Required, auto-uppercased, **disabled on edit** |
| Sticker No. | `stickerNo` | text | Required |
| Department | `dept` | text | Required |
| Vehicle Type | `vehicleType` | select | Options: `2W`, `4W`, `Heavy`, `Electric` |
| Mobile No. | `mobileNo` | text | Required |
| Date of Issue | `dateOfIssue` | date | Required |

#### Features

- **Search** — Filters by plate, name, or department (server-side via `getVehicles({ search })`)
- **Pagination** — 15 items per page, rendered as numbered buttons
- **Add/Edit Modal** — Shared form with conditional behavior based on `modal` state
- **Delete Confirmation** — Separate modal with "cannot be undone" warning

---

### 10.6 Cameras

**File:** `src/pages/Cameras.jsx`

CRUD management for CCTV cameras at campus gates.

#### Camera Form Fields

| Field | Key | Type | Notes |
|---|---|---|---|
| Camera Location | `cameraLocation` | text | e.g., "Main Gate, Gate 2" |
| Camera Type | `cameraType` | select | `ENTRY`, `EXIT`, `BOTH` |
| Latitude | `lat` | number | GPS coordinate |
| Longitude | `long` | number | GPS coordinate |

#### Table Columns

| Column | Details |
|---|---|
| Location | Camera location name |
| Type | Badge with color coding: `ENTRY`→green, `EXIT`→red, `BOTH`→blue |
| Coordinates | `lat, long` (4 decimal places, monospace) |
| Camera ID | First 8 chars of UUID |
| Registered | Creation date (`en-IN`) |
| Actions | Edit / Delete buttons |

#### Patterns

- Same modal and delete-confirmation pattern as Vehicles
- No pagination (typically a small number of cameras)

---

### 10.7 Logs (Entry / Exit)

**File:** `src/pages/Logs.jsx`

Comprehensive vehicle movement log viewer.

#### Tabs

| Tab | Key | Data Source |
|---|---|---|
| **All Logs** | `all` | `getLogs({ page, limit, authorized })` |
| **On Campus** | `active` | `getActiveLogs()` — vehicles currently inside |
| **Unauthorized** | `unauthorized` | Filtered client-side from `logs` |

#### Filters & Search

- **Search** — Client-side filter on `vehicleNo` (uppercased) and `camera.cameraLocation`
- **Authorization filter** (All Logs tab only) — `<select>` with options: All / Authorized / Unauthorized
- These filters reset paginated page state

#### Table Columns

| Column | Source |
|---|---|
| Vehicle No. | `.plate` styled badge |
| Camera / Gate | Location + type (small text) |
| Entry Time | `en-IN` locale formatted |
| Exit Time | `en-IN` formatted or "Still Inside" (muted) |
| Duration | `fmt()` helper: `Xh Ym Zs` |
| Status | `✓ Auth` (green) / `✗ Unauth` (red) badge |
| Event | `Exited` (gray) / `Entry` (amber) badge |

#### Pagination

- 20 items per page
- Only rendered on the "All Logs" tab

---

## 11. Styling & Design System

**File:** `src/index.css` (~1660 lines, pure CSS — no preprocessors)

### CSS Custom Properties (Design Tokens)

```css
:root {
  --green:    #27AE60;     --green-dk:  #1e8449;    --green-lt: #eafaf1;
  --red:      #e74c3c;     --red-lt:    #fdf0ef;
  --amber:    #f39c12;     --amber-lt:  #fef9ec;
  --blue:     #2980b9;     --maroon:    #8B1A1A;
  --sidebar:  #0d1117;     --bg:        #f4f6f9;
  --card:     #ffffff;     --border:    #e1e4e8;
  --text:     #1a1a2e;     --muted:     #6c757d;
  --shadow:   0 2px 12px rgba(0,0,0,.08);
  --radius:   12px;
  --font:     'Inter', sans-serif;
}
```

### Font

- **Inter** (Google Fonts) — weights 300–800

### Style Sections

| Section | Lines (approx) | Description |
|---|---|---|
| Reset & Global | 1–52 | Box-sizing, font, link/button resets |
| Landing Page | 54–452 | Navbar, hero, features grid, steps, team, footer |
| Auth Pages | 454–557 | Centered card, OTP input grid |
| Dashboard Layout | 559–714 | Sidebar, main area, topbar |
| Cards & Stats | 734–800 | Card base, stats grid, stat icons |
| Charts | 800+ | Chart card titles |
| Tables | 800+ | Table styling, `.plate` badge, `.badge` colors |
| Buttons | 800+ | `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-danger`, `.btn-full` |
| Forms | 800+ | `.form-group`, `.form-input`, `.form-select`, `.form-row`, `.form-actions` |
| Modals | 800+ | Overlay, modal card, header, close button |
| Animations | 800+ | Particle float, ring pulse, orbit, scroll reveal, hero entrance |
| Tabs | 800+ | `.tabs`, `.tab`, `.tab.active` |
| Utilities | 800+ | `.spinner`, `.toolbar`, `.search-wrap`, `.empty`, `.badge` variants |

### Key CSS Classes

| Class | Usage |
|---|---|
| `.layout` | Flex container for sidebar + main content |
| `.main` | Right content area (margin-left = sidebar width) |
| `.card` | White rounded card with border and shadow |
| `.badge .green / .red / .blue / .gray / .amber` | Colored status badges |
| `.plate` | Vehicle number plate styled badge |
| `.modal-overlay` + `.modal` | Centered modal dialog system |
| `.btn-primary` | Green solid button |
| `.btn-secondary` | Gray outline button |
| `.btn-danger` | Red button |
| `.btn-full` | Full-width button |
| `.reveal` / `.revealed` | Scroll-triggered animation classes |

---

## 12. Build & Dev Configuration

### `vite.config.js`

```js
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      }
    }
  }
})
```

- **Plugin:** `@vitejs/plugin-react` (Babel + Fast Refresh)
- **Proxy:** All `/api/*` requests forwarded to the Express backend on port 5000
- **No path rewrite** — requests hit the backend as-is (e.g., `/api/v1/auth/signin`)

### `eslint.config.js`

- ESLint v9 flat config format
- Ignores `dist/` directory
- Applies to `**/*.{js,jsx}` files
- Extends: `js.configs.recommended`, `react-hooks`, `react-refresh`
- Custom rule: `no-unused-vars` ignores variables starting with uppercase or underscore

### `index.html`

- Standard SPA shell mounting `<div id="root">`
- Loads `src/main.jsx` as ES module

---

## 13. Conventions & Patterns

### State Management

- **No external state library** — all state is local (`useState`)
- Auth token stored in `localStorage` (not React context)
- Each page independently fetches its own data on mount

### Modal Pattern (Vehicles, Cameras)

All CRUD pages follow the same modal pattern:

```
modal state:  null → 'add' → saves → null
              null → 'edit' → saves → null

deleteId state: null → vehicleNo → confirms → null
```

- Modal opens by setting `modal` to `'add'` or `'edit'`
- Form state is reset (add) or populated (edit) before opening
- On save success: modal closes + data reloads
- Delete uses a separate confirmation modal

### Error Handling

- API errors shown as inline `alert-error` banners
- Fallback messages for network failures
- Loading spinners (CSS `.spinner` class) replace button text during async operations

### Form UX

- All inputs use controlled components
- Vehicle number auto-uppercased on change
- Vehicle number is disabled during edit (primary key)
- DateOfIssue formatted to `YYYY-MM-DD` for HTML date inputs

---

## 14. Scalability Guide

### Adding a New Protected Page

1. Create `src/pages/NewPage.jsx`
2. Import in `App.jsx`
3. Add route inside the protected routes block:
   ```jsx
   <Route path="/new-page" element={
     <RequireAuth><PrivateLayout><NewPage /></PrivateLayout></RequireAuth>
   } />
   ```
4. Add navigation entry in `Sidebar.jsx`:
   ```js
   { to: '/new-page', icon: SomeIcon, label: 'New Page' },
   ```

### Adding a New API Endpoint

1. Add the function in `api.js`:
   ```js
   export const getNewResource = (params) => API.get('/new-resource', { params });
   ```
2. Import and use in your page component

### Adding New Components

1. Create in `src/components/`
2. Follow the existing pattern: default export, props-based interface
3. Use CSS classes from `index.css` or extend the stylesheet

### State Management Upgrade Path

If the app grows beyond a few pages sharing state, consider:

1. **React Context** for auth state (lift from `localStorage` checks)
2. **React Query / TanStack Query** for server-state caching and refetching
3. **Zustand** for lightweight global state if context becomes unwieldy

### CSS Architecture Upgrade Path

The current monolithic `index.css` works well at this scale. For growth:

1. Split into per-section CSS files (imported in respective components)
2. Or adopt **CSS Modules** (Vite supports them natively with `.module.css`)
3. Keep the design tokens (CSS variables) in a dedicated `tokens.css`

---

*Last updated: 2026-02-23*
