import { Queue } from "bullmq";
import redis from "../models/redis.js";

// Re-use the existing ioredis connection for BullMQ
export const scanQueue = new Queue("ScanQueue", {
    connection: redis,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: "exponential",
            delay: 1000,
        },
        removeOnComplete: true, // Auto clean up to save RAM
        removeOnFail: false,    // Keep failed jobs for debugging
    },
});
