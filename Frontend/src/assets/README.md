# `assets/` — Bundled Static Assets

Assets in this directory are **imported in source code** and processed by Vite's asset pipeline. They get hashed filenames in the production build for cache-busting.

## Current Contents

| File | Used | Notes |
|---|---|---|
| `react.svg` | No | Default Vite template asset. Safe to remove. |

## Usage

Import assets directly in your components:

```jsx
import logo from '../assets/my-image.png';
// <img src={logo} alt="..." />
```

Vite will handle bundling, optimization, and URL resolution.

## Assets vs `public/`

| | `src/assets/` | `public/` |
|---|---|---|
| Imported in code | ✅ Yes | ❌ No (referenced by URL path) |
| Hashed filenames | ✅ Yes (cache-busting) | ❌ No |
| Tree-shaken | ✅ Unused imports excluded | ❌ Always included |
| Use for | Icons, illustrations used in components | Favicon, logos referenced in HTML/CSS |
