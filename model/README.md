# DTU Rakshak — AI Model Service

> **Edge-deployed Flask microservice** that detects vehicle number plates from camera frames using YOLO + GLM-OCR, and reports detections to the main Express backend via a secure webhook.

---

## Table of Contents

1. [Overview](#1-overview)
2. [How It Works — Full Workflow](#2-how-it-works--full-workflow)
3. [Project Structure](#3-project-structure)
4. [Setup & Running](#4-setup--running)
5. [Environment Variables](#5-environment-variables)
6. [API Reference](#6-api-reference)
7. [Code Architecture (for future engineers)](#7-code-architecture-for-future-engineers)
8. [Adding a New Feature](#8-adding-a-new-feature)

---

## 1. Overview

This service runs **on the edge device** (a Raspberry Pi, Jetson Nano, or any machine attached to a CCTV camera). It is **not** part of the Node.js backend server — it is a separate Python process.

| Responsibility | Who does it |
|---|---|
| Detect number plate region in an image | YOLO (`best.pt`) |
| Read text from the detected plate crop | GLM-OCR (vision-language model) |
| Parse/validate Indian plate format | `parse_indian_plate()` in `ai_service.py` |
| Decide ENTRY / EXIT / UNAUTHORIZED | **Express backend** (`scan.controller.js`) |
| Store logs in DB | **Express backend** |
| Show logs to admin | **React frontend** |

The model service's only job is: **take an image → find a plate → read it → send the text to the backend**.

---

## 2. How It Works — Full Workflow

```
┌─────────────────────────────────────────────────────┐
│              Edge Device (this service)              │
│                                                     │
│  ┌──────────────┐    ┌──────────────┐               │
│  │  Camera /    │    │  /test-scan  │               │
│  │  USB / RTSP  │    │  (Postman)   │               │
│  └──────┬───────┘    └──────┬───────┘               │
│         │ frames            │ image upload          │
│         ▼                   ▼                       │
│  ┌─────────────────────────────────┐                │
│  │   run_detection_pipeline()      │                │
│  │                                 │                │
│  │  1. YOLO (best.pt)              │                │
│  │     → detect plate bounding box │                │
│  │     → crops at CONFIDENCE ≥ 0.35│                │
│  │                                 │                │
│  │  2. enhance()                   │                │
│  │     → upscale crop to ≥80px tall│                │
│  │     → sharpen with Laplacian    │                │
│  │                                 │                │
│  │  3. glm_ocr()                   │                │
│  │     → GLM-OCR reads raw text    │                │
│  │     → e.g. "D L 3C-AF 0001"    │                │
│  │                                 │                │
│  │  4. parse_indian_plate()        │                │
│  │     → regex → "DL3CAF0001"     │                │
│  │     → marks valid: true/false   │                │
│  └─────────────────┬───────────────┘                │
│                    │                                │
│  5. post_to_backend() ──────────────────────────────┼──▶
│     POST /api/v1/scan                               │
│     Header: X-Edge-Api-Key                          │
│     Body: { camera_id, vehicle_no,                  │
│             raw_plate, confidence, timestamp }       │
└─────────────────────────────────────────────────────┘
                    │
                    ▼
       ┌────────────────────────┐
       │   Express Backend      │
       │  scan.controller.js    │
       │                        │
       │  • Validate camera UUID │
       │  • Check vehicle auth  │
       │  • ENTRY  → Redis      │
       │  • EXIT   → DB + Redis │
       └────────────────────────┘
```

### Two operating modes

| Mode | How triggered | Use case |
|------|--------------|----------|
| **Live camera loop** | `CAMERA_ID` set in `.env`, auto-starts at startup | Production — camera wired to edge device |
| **Manual test** | `POST /test-scan` with an image | Development / testing from Postman |

---

## 3. Project Structure

```
model/
├── ai_service.py       ← Main Flask app (all logic lives here)
├── best.pt             ← Trained YOLO weights for plate detection
├── .env                ← Local config (not committed to git)
├── requirements.txt    ← Python dependencies
├── images/             ← Sample/test images
└── venv/               ← Virtual environment (not committed)
```

---

## 4. Setup & Running

### Prerequisites
- Python 3.10+
- `venv` or `conda`
- CUDA-capable GPU is optional (falls back to CPU automatically)

### Install

```bash
cd model

# Create and activate virtual environment
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # Linux / macOS

# Install dependencies
pip install -r requirements.txt
```

### Configure

Copy `.env` and fill in the values (see [§5 Environment Variables](#5-environment-variables)):

```bash
# .env already exists in this folder — edit it:
EDGE_API_KEY=<paste the same key as Backend/.env EDGE_API_KEY>
CAMERA_ID=<UUID of this camera from the cameras table>
```

### Run

```bash
python ai_service.py
```

The service starts on **port 5001**.

- If `CAMERA_ID` is set → camera loop starts automatically.
- If not → only `/process` and `/test-scan` are available.

> **On first run**, GLM-OCR (~2.65 GB) downloads and caches to `~/.cache/huggingface`. Subsequent starts are fast.

---

## 5. Environment Variables

All variables live in `model/.env`. The file is loaded at startup via `python-dotenv`.

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `BACKEND_SCAN_URL` | `http://localhost:5000/api/v1/scan` | Yes | Full URL of the Express scan endpoint |
| `EDGE_API_KEY` | _(empty)_ | **Yes** | Shared secret — must match `EDGE_API_KEY` in `Backend/.env` exactly |
| `CAMERA_ID` | _(empty)_ | For live mode | UUID of this physical camera from the `cameras` DB table. Leave blank to disable the camera loop |
| `CAMERA_SOURCE` | `0` | No | Camera source: `0`/`1`/`2` for USB index, or an `rtsp://...` URL for IP cameras |
| `SCAN_COOLDOWN_SECONDS` | `30` | No | Seconds to wait before re-sending the same plate number. Prevents ENTRY spam from a parked vehicle |
| `CONFIDENCE_THRESHOLD` | `0.35` | No | YOLO minimum confidence to consider a detection valid. Lower = catch more plates, higher = fewer false positives |
| `EXPAND_PADDING` | `8` | No | Pixels to pad around the detected bounding box before cropping for OCR |

---

## 6. API Reference

### `POST /process`

**Purpose:** Raw detection only. Returns OCR results without calling the backend.
Use this to debug the model in isolation.

**Request:** `multipart/form-data`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `image` | File | Yes | Car image (JPG / PNG / WEBP) |
| `camera_id` | text | No | Passed through to the response for traceability |

**Response:**
```json
{
  "plates": [
    {
      "raw_ocr":    "D L 3C-AF 0001",
      "plate":      "DL3CAF0001",
      "valid":      true,
      "confidence": 0.91,
      "bbox":       [120, 300, 480, 380]
    }
  ],
  "camera_id": "optional-value",
  "timestamp": "2026-02-25T04:54:00.000Z"
}
```

---

### `POST /test-scan`

**Purpose:** Full end-to-end test. Detects the plate AND posts it to the Express backend. Returns both the detection result and the backend's response. Use from Postman during development.

**Request:** `multipart/form-data`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `image` | File | Yes | Car image (JPG / PNG / WEBP) |
| `camera_id` | text | No | Overrides `CAMERA_ID` env var for this request |

**Response:**
```json
{
  "plates": [
    {
      "raw_ocr":    "DL 3C AF 0001",
      "plate":      "DL3CAF0001",
      "valid":      true,
      "confidence": 0.91,
      "bbox":       [120, 300, 480, 380],
      "backend_response": {
        "statusCode": 200,
        "data": { "event": "ENTRY", "vehicleNo": "DL3CAF0001", ... }
      },
      "backend_error": null
    }
  ],
  "camera_id": "<uuid>",
  "timestamp": "2026-02-25T04:54:00.000Z",
  "skipped_invalid": 0
}
```

If a plate fails the Indian format regex, `valid` will be `false`, and `backend_response` will be `null` with an explanation in `backend_error`. The request still succeeds — other valid plates in the same image are still sent.

**curl example:**
```bash
curl -X POST http://localhost:5001/test-scan \
  -F "image=@./images/car.jpg" \
  -F "camera_id=<your-camera-uuid>"
```

---

## 7. Code Architecture (for future engineers)

`ai_service.py` is intentionally kept as a **single flat file** to make it easy to deploy and update on edge devices without managing multiple modules. Here is the logical breakdown:

```
ai_service.py
│
├── CONFIG BLOCK (top of file)
│   ├── load_dotenv()
│   ├── DEVICE (cuda / cpu)
│   ├── CONFIDENCE_THRESHOLD, EXPAND_PADDING
│   └── BACKEND_SCAN_URL, EDGE_API_KEY, CAMERA_ID, CAMERA_SOURCE, SCAN_COOLDOWN
│
├── MODEL LOADING
│   ├── det_model = YOLO("best.pt")
│   └── ocr_model = GLM-OCR (AutoModelForImageTextToText)
│
├── PURE HELPERS (stateless, no side effects)
│   ├── parse_indian_plate(raw_ocr) → (plate_str, is_valid)
│   │     Indian plate regex: 2 letters + 2 digits + 1-3 letters + 4 digits
│   │
│   ├── detect_plates_yolo(image_bgr) → [{ bbox, confidence }]
│   │     Runs YOLO on full frame. Filters by CONFIDENCE_THRESHOLD.
│   │
│   ├── enhance(crop_bgr) → crop_bgr
│   │     Upscales short crops and sharpens with Laplacian kernel.
│   │
│   ├── glm_ocr(pil_img) → raw_text_str
│   │     Saves image to temp file, runs GLM-OCR chat template, decodes output.
│   │
│   └── run_detection_pipeline(image_bgr) → [{ raw_ocr, plate, valid, confidence, bbox }]
│         Orchestrates: detect → crop → enhance → OCR → parse.
│         Used by BOTH /test-scan AND the camera loop.
│
├── NETWORK HELPER
│   └── post_to_backend(vehicle_no, raw_plate, confidence, camera_id) → dict
│         POSTs JSON to BACKEND_SCAN_URL with X-Edge-Api-Key header.
│         Raises requests.HTTPError on non-2xx.
│
├── FLASK ENDPOINTS
│   ├── POST /process    → raw detection only, no network call
│   └── POST /test-scan  → run_detection_pipeline + post_to_backend per valid plate
│
└── BACKGROUND CAMERA LOOP
    ├── _last_seen: dict[plate_str, timestamp]   ← dedup state
    ├── _camera_running: bool                    ← loop control flag
    └── _camera_loop()                           ← daemon thread function
          cv2.VideoCapture(CAMERA_SOURCE)
          loop: read frame → run_detection_pipeline → dedup check → post_to_backend
```

### Key design rules to maintain

1. **`run_detection_pipeline()` is the single detection entry point.** Never duplicate the YOLO+OCR logic. Both `/test-scan` and the camera loop call it.

2. **`post_to_backend()` is the single network exit point.** If the backend API changes, only this function needs updating.

3. **`/process` never calls the backend.** Keep it that way — it's the isolation test tool.

4. **The camera loop is a daemon thread.** It exits automatically when the Flask process exits. Do not add `while True` loops directly in the Flask startup code.

5. **All config comes from `.env`.** Do not hardcode URLs, keys, or thresholds anywhere in the code.

---

## 8. Adding a New Feature

### Add a new Flask endpoint
```python
@app.route("/your-endpoint", methods=["POST"])
def your_endpoint():
    # Get image from request
    image_bytes = request.files["image"].read()
    npimg = np.frombuffer(image_bytes, np.uint8)
    image_bgr = cv2.imdecode(npimg, cv2.IMREAD_COLOR)

    # Use the shared pipeline
    plates = run_detection_pipeline(image_bgr)

    # Your logic here...
    return jsonify({ "plates": plates })
```

### Change the plate format (e.g. add diplomatic/army plates)
Edit `parse_indian_plate()` in `ai_service.py`. The function returns `(plate_str, is_valid)`. Plates where `is_valid=False` are not sent to the backend by `/test-scan` or the camera loop.

### Change the camera source at runtime
Restart the service with a different `CAMERA_SOURCE` in `.env`. The background thread reads this value once at startup via `_camera_loop()`.

### Train a new YOLO model
Replace `best.pt` with the new weights file and restart. The model is loaded once at startup.

### Connect to an IP camera (RTSP)
```ini
# model/.env
CAMERA_SOURCE=rtsp://username:password@192.168.1.100:554/stream
```
