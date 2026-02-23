# `src/` — Application Source

Root of all application source code. Everything here is bundled by Vite.

## File Overview

| File | Purpose |
|---|---|
| `main.jsx` | React entry point. Creates root, renders `<App />` inside `StrictMode`. Imports `index.css`. |
| `App.jsx` | Root component. Defines all routes, auth guards (`RequireAuth`, `PrivateLayout`), and manages top-level auth state. |
| `api.js` | Centralized Axios instance with JWT interceptors. Exports all API functions (auth, vehicles, cameras, logs). |
| `index.css` | Global stylesheet (~1660 lines). Contains the full design system: CSS variables, layout, landing page, auth pages, dashboard, tables, modals, buttons, forms, animations. |
| `App.css` | Legacy Vite template styles — currently unused. Safe to remove. |

## Subdirectories

| Directory | Contents |
|---|---|
| `components/` | Reusable UI components (currently `Sidebar.jsx`) |
| `pages/` | Route-level page components (Landing, Login, Signup, Dashboard, Vehicles, Cameras, Logs) |
| `assets/` | Bundled static assets (imported in code, processed by Vite) |

## Adding New Files

- **New pages** → Add to `pages/` and register the route in `App.jsx`
- **New shared components** → Add to `components/`
- **New API functions** → Add to `api.js`
- **New styles** → Extend `index.css` or create component-scoped CSS files
