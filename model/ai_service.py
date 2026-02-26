"""
ai_service.py  —  Flask AI microservice (Edge Device)
------------------------------------------------------
Responsibilities:
  • YOLO (best.pt)  — detect license-plate bounding boxes in a frame.
  • GLM-OCR         — read raw text from each cropped plate image.
  • parse_indian_plate() — normalise raw OCR → standard Indian plate format.
  • post_to_backend()    — send the detected plate JSON to Express /api/v1/scan.

Endpoints
---------
  POST /process       Raw detection only — returns OCR text, no backend call.
                      Use for debugging the model in isolation.

  POST /test-scan     Detection + backend webhook in one request.
                      Send an image from Postman / curl and get the full
                      pipeline result including the backend's response.

Background thread (auto-starts when CAMERA_ID is set in .env)
-------------------------------------------------------------
  Reads frames from the attached camera (USB / RTSP), runs YOLO on every
  frame, and POSTs newly-seen plates to the backend automatically.
  A per-plate SCAN_COOLDOWN_SECONDS dedup prevents hammering the backend
  every frame for the same vehicle.
"""

import os
import re
import threading
import time
import logging
from datetime import datetime, timezone

import cv2
import numpy as np
import requests
import torch
from dotenv import load_dotenv
from flask import Flask, request, jsonify
from flask_cors import CORS
from PIL import Image
from transformers import AutoProcessor, AutoModelForImageTextToText
from ultralytics import YOLO
import tempfile

# ── Load .env ─────────────────────────────────────────────────────────────────
load_dotenv()

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

# ── Device ────────────────────────────────────────────────────────────────────
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
log.info("✅  Running on: %s", DEVICE.upper())

# ── Detection settings ────────────────────────────────────────────────────────
CONFIDENCE_THRESHOLD = float(os.getenv("CONFIDENCE_THRESHOLD", "0.35"))
EXPAND_PADDING       = int(os.getenv("EXPAND_PADDING", "8"))

# ── Backend integration config ────────────────────────────────────────────────
BACKEND_SCAN_URL = os.getenv("BACKEND_SCAN_URL", "http://localhost:5000/api/v1/scan")
EDGE_API_KEY     = os.getenv("EDGE_API_KEY", "")
CAMERA_ID        = os.getenv("CAMERA_ID", "")          # required for camera loop
CAMERA_SOURCE    = os.getenv("CAMERA_SOURCE", "0")     # "0" = USB cam, or rtsp://...
SCAN_COOLDOWN    = int(os.getenv("SCAN_COOLDOWN_SECONDS", "30"))

# ── Indian plate regex ────────────────────────────────────────────────────────
# Matches: DL3CAF0001 | MH12DE1433 | HR10AU6671
# Handles spaces/dashes between groups (e.g. "DL 3C AF 0001").
_PLATE_RE = re.compile(
    r'\b([A-Z]{2})\s*[-]?\s*(\d{2})\s*[-]?\s*([A-Z]{1,3})\s*[-]?\s*(\d{4})\b'
)


# ── Load YOLO ─────────────────────────────────────────────────────────────────
log.info("📦 Loading YOLO plate detector (best.pt)...")
det_model = YOLO("best.pt")
log.info("✅  YOLO loaded.")

# ── Load GLM-OCR ──────────────────────────────────────────────────────────────
log.info("📦 Loading GLM-OCR (~2.65 GB, cached after first run)...")
GLM_MODEL_ID = "zai-org/GLM-OCR"
processor = AutoProcessor.from_pretrained(GLM_MODEL_ID)
ocr_model  = AutoModelForImageTextToText.from_pretrained(
    GLM_MODEL_ID,
    dtype=torch.float16 if DEVICE == "cuda" else torch.float32,
).to(DEVICE).eval()
log.info("✅  GLM-OCR loaded.")


# ════════════════════════════════════════════════════════════════════════════
# HELPERS
# ════════════════════════════════════════════════════════════════════════════

def parse_indian_plate(raw_ocr: str) -> tuple[str, bool]:
    """
    Clean raw OCR text and attempt to extract a standard Indian plate number.

    Returns:
        (plate_string, is_valid)
        e.g. ("DL3CAF0001", True) or ("INDL3CAF", False)
    """
    cleaned = re.sub(r"[^A-Z0-9\s\-]", "", raw_ocr.upper()).strip()
    match = _PLATE_RE.search(cleaned)
    if match:
        return "".join(match.groups()), True
    return cleaned or raw_ocr, False


def detect_plates_yolo(image_bgr: np.ndarray) -> list[dict]:
    """YOLO detection → list of { bbox, confidence }."""
    results = det_model(image_bgr, verbose=False)[0]
    plates = []
    for box in results.boxes:
        conf = float(box.conf[0])
        if conf < CONFIDENCE_THRESHOLD:
            continue
        x1, y1, x2, y2 = map(int, box.xyxy[0])
        plates.append({"bbox": [x1, y1, x2, y2], "confidence": round(conf, 4)})
    return plates


def enhance(crop_bgr: np.ndarray) -> np.ndarray:
    """Upscale to at least 80 px tall and sharpen."""
    target_h = 80
    h, w = crop_bgr.shape[:2]
    if h < target_h:
        scale    = target_h / h
        crop_bgr = cv2.resize(
            crop_bgr, (int(w * scale), target_h),
            interpolation=cv2.INTER_CUBIC,
        )
    kernel   = np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]])
    crop_bgr = cv2.filter2D(crop_bgr, -1, kernel)
    return crop_bgr


def glm_ocr(pil_img: Image.Image) -> str:
    """Run GLM-OCR on a PIL image and return raw text."""
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        tmp_path = tmp.name
    pil_img.save(tmp_path)

    messages = [{
        "role": "user",
        "content": [
            {"type": "image", "url": tmp_path},
            {"type": "text",  "text": "Text Recognition:"},
        ],
    }]

    inputs = processor.apply_chat_template(
        messages,
        tokenize=True,
        add_generation_prompt=True,
        return_dict=True,
        return_tensors="pt",
    ).to(ocr_model.device)
    inputs.pop("token_type_ids", None)

    with torch.no_grad():
        ids = ocr_model.generate(**inputs, max_new_tokens=64)

    raw = processor.decode(
        ids[0][inputs["input_ids"].shape[1]:],
        skip_special_tokens=True,
    ).strip()

    os.remove(tmp_path)
    return raw


def run_detection_pipeline(image_bgr: np.ndarray) -> list[dict]:
    """
    Run YOLO + GLM-OCR on a BGR image.

    Returns a list of dicts:
      { raw_ocr, plate, valid, confidence, bbox }
    """
    H, W = image_bgr.shape[:2]
    detections = detect_plates_yolo(image_bgr)
    results = []

    for det in detections:
        x1, y1, x2, y2 = det["bbox"]
        xc1 = max(0, x1 - EXPAND_PADDING)
        yc1 = max(0, y1 - EXPAND_PADDING)
        xc2 = min(W, x2 + EXPAND_PADDING)
        yc2 = min(H, y2 + EXPAND_PADDING)

        crop     = image_bgr[yc1:yc2, xc1:xc2]
        crop     = enhance(crop)
        pil_crop = Image.fromarray(cv2.cvtColor(crop, cv2.COLOR_BGR2RGB))
        raw      = glm_ocr(pil_crop)
        plate, valid = parse_indian_plate(raw)

        results.append({
            "raw_ocr":    raw,
            "plate":      plate,
            "valid":      valid,
            "confidence": det["confidence"],
            "bbox":       det["bbox"],
        })

    return results


def post_to_backend(vehicle_no: str, raw_plate: str, confidence: float, camera_id: str) -> dict:
    """
    POST a detected plate to the Express backend /api/v1/scan.

    Raises requests.HTTPError on non-2xx responses.
    """
    payload = {
        "camera_id":  camera_id,
        "vehicle_no": vehicle_no,
        "raw_plate":  raw_plate,
        "confidence": confidence,
        "timestamp":  datetime.now(timezone.utc).isoformat(),
    }
    resp = requests.post(
        BACKEND_SCAN_URL,
        json=payload,
        headers={"X-Edge-Api-Key": EDGE_API_KEY},
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json()


# ════════════════════════════════════════════════════════════════════════════
# ENDPOINTS
# ════════════════════════════════════════════════════════════════════════════

# ── POST /process ─────────────────────────────────────────────────────────────
# Raw detection only — no backend call.
# Good for debugging/testing the YOLO + OCR model in isolation.
# Request : multipart/form-data  →  field "image"
# Response: { plates: [{ raw_ocr, plate, valid, confidence, bbox }], ... }
@app.route("/process", methods=["POST"])
def process():
    if "image" not in request.files:
        return jsonify({"error": "No image file. Use field name 'image'."}), 400

    camera_id   = request.form.get("camera_id")
    image_bytes = request.files["image"].read()
    npimg       = np.frombuffer(image_bytes, np.uint8)
    image_bgr   = cv2.imdecode(npimg, cv2.IMREAD_COLOR)

    if image_bgr is None:
        return jsonify({"error": "Could not decode image. Send JPG/PNG/WEBP."}), 400

    plates = run_detection_pipeline(image_bgr)

    return jsonify({
        "plates":    plates,
        "camera_id": camera_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })


# ── POST /test-scan ───────────────────────────────────────────────────────────
# Full pipeline: detect → parse → POST to backend → return combined result.
# Use this from Postman or curl for end-to-end testing.
#
# Request  : multipart/form-data
#   image      (required) — car image file
#   camera_id  (optional) — overrides CAMERA_ID env var
#
# Response : {
#   plates: [{ raw_ocr, plate, valid, confidence, bbox, backend_response? }],
#   camera_id, timestamp, skipped_invalid
# }
@app.route("/test-scan", methods=["POST"])
def test_scan():
    if "image" not in request.files:
        return jsonify({"error": "No image file. Use field name 'image'."}), 400

    # camera_id: form field overrides env var
    camera_id = request.form.get("camera_id") or CAMERA_ID
    if not camera_id:
        return jsonify({
            "error": "camera_id is required. Pass it as a form field or set CAMERA_ID in .env."
        }), 400

    image_bytes = request.files["image"].read()
    npimg       = np.frombuffer(image_bytes, np.uint8)
    image_bgr   = cv2.imdecode(npimg, cv2.IMREAD_COLOR)

    if image_bgr is None:
        return jsonify({"error": "Could not decode image. Send JPG/PNG/WEBP."}), 400

    plates = run_detection_pipeline(image_bgr)

    enriched      = []
    skipped_count = 0

    for p in plates:
        entry = {**p}

        if not p["valid"]:
            # Non-Indian plate — log it but don't call backend
            entry["backend_response"] = None
            entry["backend_error"]    = "Plate did not match Indian format — not sent to backend."
            skipped_count += 1
            log.warning("⚠️  Non-standard plate skipped: %s", p["raw_ocr"])
        else:
            try:
                backend_resp = post_to_backend(
                    vehicle_no=p["plate"],
                    raw_plate=p["raw_ocr"],
                    confidence=p["confidence"],
                    camera_id=camera_id,
                )
                entry["backend_response"] = backend_resp
                entry["backend_error"]    = None
                log.info("✅  Sent %s → backend: %s", p["plate"], backend_resp.get("message", "ok"))
            except requests.HTTPError as e:
                entry["backend_response"] = None
                entry["backend_error"]    = f"Backend HTTP {e.response.status_code}: {e.response.text}"
                log.error("❌  Backend HTTP error for %s: %s", p["plate"], entry["backend_error"])
            except Exception as e:
                entry["backend_response"] = None
                entry["backend_error"]    = str(e)
                log.error("❌  Backend call failed for %s: %s", p["plate"], str(e))

        enriched.append(entry)

    return jsonify({
        "plates":          enriched,
        "camera_id":       camera_id,
        "timestamp":       datetime.now(timezone.utc).isoformat(),
        "skipped_invalid": skipped_count,
    })


# ════════════════════════════════════════════════════════════════════════════
# BACKGROUND CAMERA LOOP
# Started automatically when CAMERA_ID is set in .env.
# Reads frames from the attached camera, detects plates, and posts to backend.
# ════════════════════════════════════════════════════════════════════════════

# track last time each plate was sent { plate: timestamp }
_last_seen: dict[str, float] = {}
_camera_running = False


def _camera_loop():
    """
    Background thread: continuous frame capture → YOLO → OCR → backend POST.
    Runs until the process exits or _camera_running is set to False.
    """
    global _camera_running

    # CAMERA_SOURCE is "0" for USB cam, or an RTSP URL string
    source = int(CAMERA_SOURCE) if CAMERA_SOURCE.isdigit() else CAMERA_SOURCE
    cap    = cv2.VideoCapture(source)

    if not cap.isOpened():
        log.error("❌  Cannot open camera source: %s", CAMERA_SOURCE)
        _camera_running = False
        return

    log.info("📷  Camera loop started (source=%s, camera_id=%s)", CAMERA_SOURCE, CAMERA_ID)

    while _camera_running:
        ret, frame = cap.read()
        if not ret:
            log.warning("⚠️  Camera frame read failed — retrying in 1s...")
            time.sleep(1)
            continue

        try:
            plates = run_detection_pipeline(frame)
        except Exception as e:
            log.error("❌  Detection error: %s", str(e))
            continue

        now = time.time()
        for p in plates:
            if not p["valid"]:
                continue  # skip non-standard plates silently

            # Dedup: skip if same plate was sent within SCAN_COOLDOWN_SECONDS
            last = _last_seen.get(p["plate"], 0)
            if now - last < SCAN_COOLDOWN:
                continue

            try:
                result = post_to_backend(
                    vehicle_no=p["plate"],
                    raw_plate=p["raw_ocr"],
                    confidence=p["confidence"],
                    camera_id=CAMERA_ID,
                )
                _last_seen[p["plate"]] = now
                log.info(
                    "✅  [camera] %s → %s",
                    p["plate"],
                    result.get("data", {}).get("event", "ok"),
                )
            except Exception as e:
                log.error("❌  [camera] Backend post failed for %s: %s", p["plate"], str(e))

    cap.release()
    log.info("📷  Camera loop stopped.")


# ════════════════════════════════════════════════════════════════════════════
# STARTUP
# ════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    if CAMERA_ID:
        _camera_running = True
        cam_thread = threading.Thread(target=_camera_loop, daemon=True)
        cam_thread.start()
        log.info("📷  Camera loop thread started (CAMERA_ID=%s)", CAMERA_ID)
    else:
        log.info("ℹ️   CAMERA_ID not set — camera loop disabled. Use /test-scan for manual testing.")

    app.run(host="0.0.0.0", port=5001, debug=False)