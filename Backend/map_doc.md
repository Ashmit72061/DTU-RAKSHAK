# CCTV Map Integration Documentation

This document explicitly outlines the architecture, end-to-end data flow, and frontend constraints for the Real-time Vehicle Tracking feature in the DTU-RAKSHAK Dashboard.

---

## 1. System Architecture & Flow

The Map feature leverages the `react-google-maps/api` package on the frontend, combined with a bespoke Redis-cached endpoint on the backend. 

### Data Flow
1. **Trigger:** The user navigates to `/live-map`, either by clicking **Live Map** in the Sidebar or clicking a specific row in **Entry/Exit Logs**.
2. **Search / Resolution:** 
   - If navigated via Logs table, the `entryId` is automatically passed in the query params.
   - If using the Map's Search Bar, the UI hits `/api/v1/scan/logs/:vehicleNo` to fetch the most recent `EntryExitLog` ID for that vehicle.
3. **Path Fetching:** The UI requests the coordinates using `/api/v1/scan/entry-path/:entryId`.
4. **Backend Retrieval:**
   - The backend checks Redis for `entryPath:v2:{entryId}`.
   - If missing, it queries Prisma for the `EntryExitLog` and related `sightings`, extracting the `lat`, `long`, and `cameraLocation` for each.
   - The backend merges the Entry camera, interior Sighting cameras, and Exit camera (if applicable) into a single chronological array and sends it back.
5. **UI Rendering:** `<LiveMap />` loads the Google Map. `<PathRenderer />` plots standard `window.google.maps.SymbolPath.CIRCLE` nodes connected by a Polyline.

---

## 2. API Endpoints

### Fetch Vehicle Path
`GET /api/v1/scan/entry-path/:entryId`

**Description:** Retrieves the exact sequence of camera GPS coordinates a vehicle traversed during a single session.

#### Parameters
| Parameter | Type | In | Description |
|-----------|------|----|-------------|
| `entryId` | UUID | Path | The `id` of an `EntryExitLog` session. |

#### Expected Response (200 OK)
```json
{
  "statusCode": 200,
  "data": {
    "entryId": "0288c7c2-9f27-47d7-898a-9dc8848f33fd",
    "path": [
      {
        "lat": 28.7501,
        "lng": 77.1177,
        "timestamp": "2026-03-21T09:13:50.000Z",
        "cameraId": "1e480c1b-7073-414f-a635-ea499d811dc3",
        "cameraLocation": "Main Gate",
        "type": "ENTRY"
      },
      {
        "lat": 28.7512,
        "lng": 77.1189,
        "timestamp": "2026-03-21T09:15:20.000Z",
        "cameraId": "392a77c5-4cc2-4353-b907-05051de07cef",
        "cameraLocation": "Pragya Bhawan",
        "type": "SIGHTING"
      }
    ]
  },
  "message": "Path fetched from Database",
  "success": true
}
```

#### Cache Invalidation Strategy
The endpoint automatically sets a **10-minute TTL** cache in Redis (Upstash) using the key structure `entryPath:v2:{entryId}`.
To ensure the UI map moves responsively without heavy database load:
- Any new scan at an `INTERIOR` camera invokes `handleSighting()` within `scan.service.js`.
- During transaction commit, `handleSighting()` fires a `redis.del()` command directly targeting the specific `entryPath` linked to that vehicle's active session, instantly busting the cache so the map updates live on the next user refresh.

---

## 3. Frontend View Behaviors

### Geographical Masking (Inverted Hole)
To prevent the user from navigating outside the DTU Campus limits and enforce visual focus:
- A `Polygon` is rendered over the map utilizing two sets of coordinates.
- **Outer Ring:** A broad square completely encompassing Delhi (`NW` to `NE` to `SE` to `SW`).
- **Inner Ring:** A highly precise GeoJSON matrix (`dtu_boundary.geojson`) specifically reversed locally in javascript (`.reverse()`) to invert the standard right-hand mathematical winding.
- Result: Google Maps carves the Inner Ring out of the Outer Ring, creating a seamless solid white block over the rest of the planet while the campus sits cleanly inside the empty "hole".

### Active Marker Panning
When `path` is passed into `PathRenderer.jsx`:
- **Single Point:** `map.panTo()` centers the map smoothly, explicitly jumping to zoom level 18 to optimally isolate the gate.
- **Multiple Points:** A `LatLngBounds` geometry object is extended across every ping. `map.fitBounds(bounds)` automatically computes the perfect zoom-out height necessary to encompass a vehicle's entire path inside the viewport without the user ever touching the scroll wheel.
