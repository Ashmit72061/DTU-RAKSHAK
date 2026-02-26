import multer from "multer";
import ApiError from "../utils/ApiError.js";
import { StatusCodes } from "http-status-codes";

// Keep the file in memory (Buffer) — no disk writes.
const storage = multer.memoryStorage();

function csvFilter(_req, file, cb) {
    const allowed = ["text/csv", "application/vnd.ms-excel", "text/plain"];
    if (allowed.includes(file.mimetype) || file.originalname.endsWith(".csv")) {
        cb(null, true);
    } else {
        cb(new ApiError(StatusCodes.BAD_REQUEST, "Only .csv files are allowed"), false);
    }
}

const upload = multer({
    storage,
    fileFilter: csvFilter,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

/** Single-file CSV field named "file" */
export const uploadCsv = upload.single("file");
