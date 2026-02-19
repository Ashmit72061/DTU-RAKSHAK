import { StatusCodes } from "http-status-codes";
import ApiError from "../utils/ApiError.js";

/**
 * Global error-handling middleware.
 * Catches ApiError instances and unexpected errors, returning a consistent JSON shape.
 */
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, _req, res, _next) => {
    let error = err;

    // Wrap non-ApiError exceptions into ApiError
    if (!(error instanceof ApiError)) {
        const statusCode = error.statusCode || StatusCodes.INTERNAL_SERVER_ERROR;
        const message = error.message || "Internal Server Error";
        error = new ApiError(statusCode, message, error?.errors || [], err.stack);
    }

    const response = {
        statusCode: error.statusCode,
        message: error.message,
        success: false,
        ...(process.env.NODE_ENV === "development" && { stack: error.stack }),
        ...(error.errors?.length && { errors: error.errors }),
    };

    return res.status(error.statusCode).json(response);
};

export default errorHandler;
