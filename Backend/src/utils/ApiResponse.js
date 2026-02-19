class ApiResponse {
    /**
     * @param {number} statusCode - HTTP status code
     * @param {*} data - Response payload
     * @param {string} message - Success message
     */
    constructor(statusCode, data, message = "Success") {
        this.statusCode = statusCode;
        this.data = data;
        this.message = message;
        this.success = statusCode < 400;
    }
}

export default ApiResponse;
