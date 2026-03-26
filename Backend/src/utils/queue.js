import { Queue } from "bullmq";
import env from "../configs/env.config.js";

// BullMQ Queue also uses its own connection config — never share the ioredis
// app singleton with BullMQ as it can interfere with blocking worker commands.
const connectionConfig = {
    connection: {
        host: new URL(env.redisUrl).hostname,
        port: parseInt(new URL(env.redisUrl).port) || 6379,
        username: new URL(env.redisUrl).username || "default",
        password: new URL(env.redisUrl).password || undefined,
        maxRetriesPerRequest: null, // Required by BullMQ
    }
};

export const scanQueue = new Queue("ScanQueue", {
    ...connectionConfig,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: "exponential",
            delay: 1000,
        },
        removeOnComplete: true,
        removeOnFail: false,
    },
});
