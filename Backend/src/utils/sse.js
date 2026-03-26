import { EventEmitter } from "events";

export const alertEmitter = new EventEmitter();

export const sseMiddleware = (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    // Notify the client that listening has successfully started
    res.write(`data: ${JSON.stringify({ type: "CONNECTED", message: "SSE Alert Stream Connected" })}\n\n`);

    const onAlert = (alertData) => {
        res.write(`data: ${JSON.stringify(alertData)}\n\n`);
    };

    alertEmitter.on("NEW_ALERT", onAlert);

    // Clean up memory if the dashboard browser tab natively closes
    req.on("close", () => {
        alertEmitter.off("NEW_ALERT", onAlert);
    });
};
