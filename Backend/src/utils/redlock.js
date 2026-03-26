import Client from "ioredis";
import Redlock from "redlock";
import env from "../configs/env.config.js";

// Dedicated connection for Redlock
const lockClient = new Client(env.redisUrl);

const redlock = new Redlock(
    [lockClient],
    {
        driftFactor: 0.01,
        retryCount: 10,
        retryDelay: 200, // 200ms
        retryJitter: 200, 
        automaticExtensionThreshold: 500,
    }
);

redlock.on("error", (error) => {
    // Ignore cases where a lock is already held (normal behavior)
    if (error.name !== "ResourceLockedError") {
        console.error("❌ Redlock error:", error);
    }
});

export default redlock;
