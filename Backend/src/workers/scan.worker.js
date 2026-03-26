import { Worker } from "bullmq";
import env from "../configs/env.config.js";
import { processScanJob, processOverstayBomb } from "../services/scan.service.js";

// BullMQ Worker MUST use its own dedicated Redis connection — never share the
// app-wide ioredis singleton. Shared connections cause blocking command (BRPOPLPUSH)
// conflicts that silently stop job processing after nodemon restarts.
const redisUrl = new URL(env.redisUrl);

const workerConnection = {
    host: redisUrl.hostname,
    port: parseInt(redisUrl.port) || 6379,
    username: redisUrl.username || "default",
    password: redisUrl.password || undefined,
    maxRetriesPerRequest: null, // Required by BullMQ for blocking commands
};

export const scanWorker = new Worker("ScanQueue", async (job) => {
    try {
        if (job.name === "processScanJob") {
            console.log(`[Worker] Processing scan job ${job.id} for vehicle ${job.data.vehicleNo}`);
            await processScanJob(job.data);
        } else if (job.name === "checkOverstayBomb") {
            console.log(`[Worker] Executing Overstay Bomb ${job.id} for logId ${job.data.logId}`);
            await processOverstayBomb(job.data);
        }
    } catch (error) {
        console.error(`[Worker] Error processing job ${job.id}:`, error.message);
        throw error; // Let BullMQ handle retries
    }
}, {
    connection: workerConnection,
    concurrency: 15,
});

scanWorker.on("completed", (job) => {
    console.log(`[Worker] ✅ Job ${job.id} completed successfully`);
});

scanWorker.on("failed", (job, err) => {
    console.error(`[Worker] ❌ Job ${job.id} failed after retries. Reason: ${err.message}`);
});

console.log("✅ BullMQ Scan Worker started");
