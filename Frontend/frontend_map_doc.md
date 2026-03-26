# DTU-RAKSHAK Frontend Map Documentation 🗺️

This document outlines the React logic, geometry tricks, and architecture running the Google Maps integration within the DTU-RAKSHAK dashboard to make future modifications straightforward.

---

## 1. File Structure

- **`src/pages/LiveMap.jsx`**: The core, full-screen wrapper page. Handles loading the Google Maps script, executing backend API fetching (`getEntryPath`), and parsing the GeoJSON file.
- **`src/components/PathRenderer.jsx`**: A dedicated presentation component strictly responsible for rendering the `[lat, lng]` path arrays into Polylines and plotting the interactive blue camera marker dots.

---

## 2. Core Concepts & "Gotchas"

### A. The Inverted Mask (Blocking the outside world)
To naturally force the security admins to focus entirely on the DTU campus, the Map physically blocks out the rest of the planet using a solid white `#ffffff` Polygon.

**How it works (The Winding Trick):**
Google Maps fundamentally draws filled polygons. To create a "hole" instead of a solid shape:
1. `worldOuterCoords`: We define a massive outer array mapping a bounding box around the Delhi NCR region, drawn sequentially (e.g., NW -> SW -> SE -> NE).
2. `campusInnerCoords`: `LiveMap.jsx` fetches `dtu_boundary.geojson` and maps its coordinates. 
3. **The Trick:** We explicitly call `.reverse()` on the GeoJSON array. By feeding Google Maps an outer ring and an inner ring that are mathematically wound in *opposite directions*, the Maps API automatically geometry-subtracts the inner ring from the outer ring, creating a literal cutout window into exclusively the DTU campus.

**To modify the mask:** Look for the `<Polygon />` component in `LiveMap.jsx`. Changing `fillOpacity: 1` to `0.8` will give it a frosted glass look. 

### B. Single Point vs Multi-Point Auto-Zooming
The map is completely autonomous; it automatically centers and zooms on a vehicle without user scroll input.
* **If a vehicle has `>1` path points:** `PathRenderer.jsx` builds a `window.google.maps.LatLngBounds()` geometry, looping over every point. Running `mapInstance.fitBounds(bounds)` automatically computes the exact mathematical zoom-out level necessary to capture the entire driving distance identically on any monitor size.
* **If a vehicle only has `1` path point:** (e.g., just entered the gate). `fitBounds` on a single coordinate creates a bounding box of 0-area which crashes the Google Maps geometry calculation and causes severe map bugs. Instead, `PathRenderer.jsx` uses an `if` statement to intercept arrays of length `1`, completely bypassing bounds and instead using `mapInstance.panTo()` and explicitly forcing `mapInstance.setZoom(18)`.

---

## 3. UI Styling & CSS Logic

### Layout Sizing
`LiveMap.jsx` wraps the `<GoogleMap>` in an absolute `flex` styling block natively tied to the dashboard's layout.
It dynamically enforces `.main` layout properties while overriding the default padding so that the Map touches the very absolute edges of the screen right beside the `Sidebar`:
```jsx
<div className="main" style={{ padding: 0, position: 'relative', height: '100vh' }}>
```

### Map Tooltips & Numbers
Markers are rendered natively using the `window.google.maps.SymbolPath.CIRCLE` SVG path, which makes them highly performant (zero raster images to download). 
- **The Numbers:** The markers dynamically fetch their physical number using the React map iteration `String(index + 1)`. 
- **The Tooltip (InfoWindow):** The tooltip explicitly ignores UI logic calculations and simply renders whatever the backend provides under `{point.cameraLocation || point.cameraId}`.

---

## 4. Modifying Map Controls

By default, the map has been stripped of unnecessary Google UI bloat to feel like a native dashboard application.
Inside `LiveMap.jsx`, the `options` object controls the entire interface:
```javascript
const options = {
  disableDefaultUI: true, // Hides almost everything
  zoomControl: true,      // Keeps the + / - buttons
  mapTypeControl: true,   // Allows switching to Satellite view
  streetViewControl: false, // Turns off the orange pegman
  fullscreenControl: false, // Prevents breaking our React layout
}
```
