import FormData from "form-data";
import fetch from "node-fetch";

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:5001";

// ── Indian plate regex ────────────────────────────────────────────────────────
// Format: 2 letters (state) + 2 digits (district) + 1-3 letters (series) + 4 digits
// e.g.  DL3CAF0001 | MH12DE1433 | HR10AU6671
const INDIA_PLATE_RE = /\b([A-Z]{2})\s*[-]?\s*(\d{2})\s*[-]?\s*([A-Z]{1,3})\s*[-]?\s*(\d{4})\b/;

/**
 * Clean raw OCR text and attempt to extract a valid Indian plate number.
 *
 * @param {string} rawOcr  - Raw text returned by GLM-OCR (e.g. "D L 3C-AF 0001")
 * @returns {{ plate: string, valid: boolean }}
 */
export function parsePlate(rawOcr) {
    // Uppercase, strip everything except alphanumeric + space + dash
    const cleaned = rawOcr
        .toUpperCase()
        .replace(/[^A-Z0-9\s\-]/g, "")
        .replace(/\s+/g, " ")
        .trim();

    const match = INDIA_PLATE_RE.exec(cleaned);
    if (match) {
        // Compact form: no spaces/dashes — "DL3CAF0001"
        const plate = match.slice(1).join("");
        return { plate, valid: true };
    }

    // No standard match — return cleaned text as-is
    return { plate: cleaned || rawOcr, valid: false };
}

/**
 * Send a car image buffer to the Python Flask AI service.
 * Flask returns raw OCR. This function adds plate formatting + validation.
 *
 * @param {Buffer} imageBuffer   - Raw image bytes (e.g. from multer req.file.buffer)
 * @param {string} originalName  - Original filename (used for MIME detection)
 * @returns {Promise<{
 *   plates: Array<{
 *     plate: string,
 *     valid: boolean,
 *     raw_ocr: string,
 *     confidence: number,
 *     bbox: number[]
 *   }>
 * }>}
 */
export const detectNumberPlate = async (imageBuffer, originalName = "image.jpg", camera_id = null) => {
    // ── Send image to Flask ───────────────────────────────────────────────────
    const form = new FormData();
    form.append("image", imageBuffer, {
        filename: originalName,
        contentType: "image/jpeg",
    });
    if (camera_id) form.append("camera_id", camera_id);

    const response = await fetch(`${AI_SERVICE_URL}/process`, {
        method: "POST",
        body: form,
        headers: form.getHeaders(),
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`AI service error ${response.status}: ${errText}`);
    }

    // ── Raw response from Flask: { plates: [{ raw_ocr, confidence, bbox }] } ─
    const raw = await response.json();

    // ── Apply regex formatting + validation for each detected plate ───────────
    const plates = raw.plates.map((item) => {
        const { plate, valid } = parsePlate(item.raw_ocr);
        return {
            plate,                           // formatted plate e.g. "DL3CAF0001"
            valid,                           // true if matches Indian format
            raw_ocr:    item.raw_ocr,        // original GLM-OCR output
            confidence: item.confidence,     // YOLO detection confidence
            bbox:       item.bbox,           // [x1, y1, x2, y2]
        };
    });

    return { plates };
};
