# `pages/` — Route-Level Page Components

Each file corresponds to a top-level route in the application. All pages are default-exported React components.

## Page Index

| File | Route | Access | Description |
|---|---|---|---|
| `Landing.jsx` | `/` | Public | Marketing page with features, how-it-works, team sections |
| `Login.jsx` | `/login` | Public | Email/password → 6-digit OTP sign-in |
| `Signup.jsx` | `/signup` | Public | Registration + OTP verification |
| `Dashboard.jsx` | `/dashboard` | Protected | Overview stats, line/pie charts, recent activity table |
| `Vehicles.jsx` | `/vehicles` | Protected | Vehicle registry CRUD with search, pagination, modal forms |
| `Cameras.jsx` | `/cameras` | Protected | Camera CRUD with location and GPS coordinates |
| `Logs.jsx` | `/logs` | Protected | Entry/exit logs with tabs (All / Active / Unauthorized), search, filters |

## Common Patterns

### Protected Pages

All protected pages are wrapped in `RequireAuth` + `PrivateLayout` in `App.jsx`. They render inside the sidebar layout and assume a valid JWT is available.

### Data Fetching

Each page fetches its own data on mount using functions from `../api.js`. There is no shared state between pages — each manages its own local state via `useState`.

### CRUD Modal Pattern (Vehicles, Cameras)

```
modal = null       → page is in default view
modal = 'add'      → form modal opens (empty form)
modal = 'edit'     → form modal opens (pre-filled)
deleteId = <id>    → delete confirmation modal opens
```

### Error Handling

API errors are displayed as inline `alert-error` divs. Button loading states show a CSS spinner.

## Adding a New Page

1. Create `NewPage.jsx` with a default export
2. Add route in `App.jsx` (wrap in `RequireAuth` + `PrivateLayout` if protected)
3. Add any needed API functions in `../api.js`
4. Add sidebar navigation link in `../components/Sidebar.jsx`
