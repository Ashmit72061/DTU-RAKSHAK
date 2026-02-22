// ── Plate normalisation 
// Cleans raw input and strips known OCR noise prefixes (INC, IND, VH, REG, NO, NUM)
// No format validation — supports all plate types (standard, VIP, diplomatic, army, etc.)

const OCR_NOISE_PREFIX = /^(INC|IND|VH|REG|NO|NUM)/;

/**
 * Normalises a raw plate string from hardware:
 *  1. Uppercase + strip spaces, dashes, dots
 *  2. Strip known OCR noise prefix if something remains after stripping
 */
export const normalisePlate = (raw) => {
    const clean    = raw.toUpperCase().replace(/\s/g, "").replace(/[-./]/g, "");
    const stripped = clean.replace(OCR_NOISE_PREFIX, "");
    return stripped.length ? stripped : clean;
};
