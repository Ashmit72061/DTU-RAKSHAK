# `components/` — Reusable UI Components

Shared components used across multiple pages. Currently contains the sidebar navigation.

## Components

### `Sidebar.jsx`

The persistent left-side navigation panel rendered in all authenticated (dashboard) views.

| Feature | Details |
|---|---|
| **Brand area** | DTU logo + "DTU Rakshak" title + "Campus Security" subtitle |
| **Navigation** | 4 links — Dashboard, Vehicles, Cameras, Entry/Exit Logs |
| **Active state** | Green left border + green text via `NavLink` |
| **User info** | Email initial avatar + "Admin" label |
| **Logout** | Calls `logout()` API → clears `localStorage` → navigates to `/login` |

**Dependencies:** `react-router-dom` (`NavLink`, `useNavigate`), `lucide-react` (icons), `api.js` (`logout`)

## Adding New Components

1. Create a new `.jsx` file in this directory
2. Use a default export for the component
3. Import and use CSS classes from `../index.css` or create a co-located CSS file
4. If the component needs sidebar navigation, add an entry to the `nav` array in `Sidebar.jsx`
