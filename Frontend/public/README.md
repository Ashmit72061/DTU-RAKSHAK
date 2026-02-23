# `public/` — Static Public Assets

Files in this directory are served as-is at the root URL. They are **not processed by Vite** — no hashing, no bundling.

## Current Contents

| File | Purpose | Referenced By |
|---|---|---|
| `dtu-logo.png` | DTU university logo | Navbar, hero, sidebar, footer, auth pages |
| `vite.svg` | Favicon | `index.html` `<link rel="icon">` |

## How to Use

Reference files by their root-relative path:

```html
<img src="/dtu-logo.png" alt="DTU" />
```

```jsx
// In JSX
<img src="/my-file.png" />
```

## When to Use `public/` vs `src/assets/`

Use `public/` for files that:
- Need a **predictable, fixed URL** (e.g., favicon, Open Graph images)
- Are referenced in `index.html` directly
- Are used by path in CSS (`background-image: url('/...')`)
- Don't benefit from hash-based cache-busting

Use `src/assets/` for everything else (components import them for Vite processing).
