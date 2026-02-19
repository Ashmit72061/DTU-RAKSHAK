import Redis from "ioredis";
import env from "../configs/env.config.js";

const redis = new Redis(env.redisUrl, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
        const delay = Math.min(times * 200, 2000);
        return delay;
    },
});

redis.on("connect", () => {
    console.log("✅ Redis connected");
});

redis.on("error", (err) => {
    console.error("❌ Redis connection error:", err.message);
});

export default redis;
