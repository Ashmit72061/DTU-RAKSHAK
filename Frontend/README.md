# DTU Rakshak — Frontend

Smart vehicle campus monitoring system for Delhi Technological University. Built with **React 19 + Vite 7**.

## Quick Start

```bash
npm install
npm run dev       # Dev server at http://localhost:5173
npm run build     # Production build → dist/
npm run preview   # Preview production build
npm run lint      # ESLint
```

> **Requires:** Node.js ≥ 18 and the backend running on port 5000 (Vite proxies `/api` → `http://localhost:5000`).

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 19 |
| Build Tool | Vite 7 |
| Routing | React Router v7 |
| HTTP Client | Axios |
| Charts | Recharts |
| Icons | Lucide React |
| Styling | Vanilla CSS (Inter font) |

## Key Features

- **OTP-based auth** — Email + password, then 6-digit OTP verification
- **Dashboard** — Real-time stats, line/pie charts, recent scan activity
- **Vehicle registry** — Full CRUD with search, pagination, modal forms
- **Camera management** — Register/edit/delete CCTV cameras at campus gates
- **Entry/exit logs** — Tabbed view (All / On-Campus / Unauthorized) with filters

## Project Structure

```
Frontend/
├── public/               # Static assets (DTU logo, favicon)
├── src/
│   ├── main.jsx          # React entry point
│   ├── App.jsx           # Root routing + auth guards
│   ├── api.js            # Axios instance + all API functions
│   ├── index.css         # Global design system
│   ├── components/       # Reusable UI components
│   │   └── Sidebar.jsx
│   ├── pages/            # Route-level page components
│   │   ├── Landing.jsx
│   │   ├── Login.jsx
│   │   ├── Signup.jsx
│   │   ├── Dashboard.jsx
│   │   ├── Vehicles.jsx
│   │   ├── Cameras.jsx
│   │   └── Logs.jsx
│   └── assets/           # Bundled assets (SVGs, images)
├── vite.config.js        # Vite config + API proxy
├── eslint.config.js      # ESLint flat config
├── FRONTEND_DOCS.md      # Comprehensive documentation
└── package.json
```

## Documentation

See **[FRONTEND_DOCS.md](./FRONTEND_DOCS.md)** for:
- Full architecture & data flow diagrams
- Detailed page-by-page reference
- API layer documentation
- Design system & CSS tokens
- Scalability guide for new features

## Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start Vite dev server with HMR |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | Run ESLint on all `.js` and `.jsx` files |
