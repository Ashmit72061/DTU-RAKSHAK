class ApiError extends Error {
    /**
     * @param {number} statusCode - HTTP status code
     * @param {string} message - Error message
     * @param {Array} errors - Additional error details
     * @param {string} stack - Stack trace override
     */
    constructor(statusCode, message = "Something went wrong", errors = [], stack = "") {
        super(message);
        this.statusCode = statusCode;
        this.data = null;
        this.success = false;
        this.errors = errors;

        if (stack) {
            this.stack = stack;
        } else {
            Error.captureStackTrace(this, this.constructor);
        }
    }
}

export default ApiError;
