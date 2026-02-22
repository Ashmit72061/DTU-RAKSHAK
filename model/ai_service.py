"""
ai_service.py  —  Flask AI microservice
----------------------------------------
• YOLO (best.pt) detects license-plate bounding boxes.
• Each crop is enhanced and sent to GLM-OCR.
• Returns RAW OCR text only — no regex, no formatting.
  All post-processing (Indian plate regex, validation, DB lookup)
  is handled by the Express backend.
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
from ultralytics import YOLO
from transformers import AutoProcessor, AutoModelForImageTextToText
from datetime import datetime, timezone
import torch
import cv2
import numpy as np
from PIL import Image
import tempfile
import os

app = Flask(__name__)
CORS(app)  # allow Express to call this service

# ── Device ──────────────────────────────────────────────────────────────────
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
print(f"✅  Running on: {DEVICE.upper()}")

# ── Detection settings (tuned from glm_numberplate_det.py) ──────────────────
CONFIDENCE_THRESHOLD = 0.35   # lower = detect more plates
EXPAND_PADDING       = 8     # pixels to pad the crop before OCR

# ── Load YOLO (local best.pt) ────────────────────────────────────────────────
print("📦 Loading YOLO plate detector (best.pt)...")
det_model = YOLO("best.pt")
print("✅  YOLO loaded.")

# ── Load GLM-OCR ─────────────────────────────────────────────────────────────
print("📦 Loading GLM-OCR (~2.65 GB, cached after first run)...")
GLM_MODEL_ID = "zai-org/GLM-OCR"
processor = AutoProcessor.from_pretrained(GLM_MODEL_ID)
ocr_model  = AutoModelForImageTextToText.from_pretrained(
    GLM_MODEL_ID,
    dtype=torch.float16 if DEVICE == "cuda" else torch.float32,
).to(DEVICE).eval()
print("✅  GLM-OCR loaded.")


# ── Helper: YOLO detection ────────────────────────────────────────────────────
def detect_plates_yolo(image_bgr: np.ndarray) -> list[dict]:
    """
    Returns a list of { bbox:[x1,y1,x2,y2], confidence:float }
    Only boxes above CONFIDENCE_THRESHOLD are kept.
    """
    results = det_model(image_bgr, verbose=False)[0]
    plates = []
    for box in results.boxes:
        conf = float(box.conf[0])
        if conf < CONFIDENCE_THRESHOLD:
            continue
        x1, y1, x2, y2 = map(int, box.xyxy[0])
        plates.append({"bbox": [x1, y1, x2, y2], "confidence": round(conf, 4)})
    return plates




# ── Helper: enhance small plate crop (from glm_numberplate_det.py) ───────────
def enhance(crop_bgr: np.ndarray) -> np.ndarray:
    """
    1. Upscale to at least 80 px tall (preserves aspect ratio).
    2. Sharpen with a laplacian kernel.
    """
    target_h = 80
    h, w = crop_bgr.shape[:2]
    if h < target_h:
        scale    = target_h / h
        crop_bgr = cv2.resize(
            crop_bgr, (int(w * scale), target_h),
            interpolation=cv2.INTER_CUBIC
        )
    kernel   = np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]])
    crop_bgr = cv2.filter2D(crop_bgr, -1, kernel)
    return crop_bgr


# ── Helper: run GLM-OCR on a PIL image ───────────────────────────────────────
def glm_ocr(pil_img: Image.Image) -> str:
    """
    GLM-OCR is a vision-language chat model — we must use apply_chat_template.
    Prompt: "Text Recognition:" gives best results for plate crops.
    """
    # GLM-OCR processor needs a file path, not an in-memory tensor
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
    inputs.pop("token_type_ids", None)   # GLM-4V doesn't use this

    with torch.no_grad():
        ids = ocr_model.generate(**inputs, max_new_tokens=64)

    # Decode only the newly generated tokens (exclude the prompt)
    raw = processor.decode(
        ids[0][inputs["input_ids"].shape[1]:],
        skip_special_tokens=True,
    ).strip()

    os.remove(tmp_path)
    return raw


# ── POST /process ─────────────────────────────────────────────────────────────
#
# Request  : multipart/form-data  →  field "image" = car image file
#
# Response : {
#   "plates": [
#     {
#       "raw_ocr"    : "DL 3C AF 0001",   ← raw text from GLM, no formatting
#       "confidence" : 0.87,              ← YOLO detection confidence
#       "bbox"       : [x1, y1, x2, y2]  ← plate location in original image
#     }
#   ]
# }
#
# All regex / Indian-format validation / DB logic lives in Express.
# ─────────────────────────────────────────────────────────────────────────────
@app.route("/process", methods=["POST"])
def process():
    if "image" not in request.files:
        return jsonify({"error": "No image file provided. Use field name 'image'."}), 400

    # ── Read camera_id (optional) ────────────────────────────────────────────
    camera_id = request.form.get("camera_id", None)

    # ── Decode uploaded image ────────────────────────────────────────────────
    image_bytes = request.files["image"].read()
    npimg       = np.frombuffer(image_bytes, np.uint8)
    image_bgr   = cv2.imdecode(npimg, cv2.IMREAD_COLOR)
    if image_bgr is None:
        return jsonify({"error": "Could not decode image. Send JPG/PNG/WEBP."}), 400

    H, W = image_bgr.shape[:2]

    # ── YOLO plate detection ─────────────────────────────────────────────────
    detections = detect_plates_yolo(image_bgr)

    if not detections:
        return jsonify({
            "plates":    [],
            "camera_id": camera_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

    # ── OCR each detected plate crop ─────────────────────────────────────────
    results = []
    for det in detections:
        x1, y1, x2, y2 = det["bbox"]

        # Expand crop by EXPAND_PADDING pixels on each side
        xc1 = max(0, x1 - EXPAND_PADDING)
        yc1 = max(0, y1 - EXPAND_PADDING)
        xc2 = min(W, x2 + EXPAND_PADDING)
        yc2 = min(H, y2 + EXPAND_PADDING)

        crop     = image_bgr[yc1:yc2, xc1:xc2]
        crop     = enhance(crop)                                 # upscale + sharpen
        pil_crop = Image.fromarray(cv2.cvtColor(crop, cv2.COLOR_BGR2RGB))

        raw = glm_ocr(pil_crop)

        results.append({
            "raw_ocr":    raw,               # ← Express will parse/validate this
            "confidence": det["confidence"],
            "bbox":       det["bbox"],
        })

    return jsonify({
        "plates":    results,
        "camera_id": camera_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=False)