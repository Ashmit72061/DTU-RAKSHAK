import { Worker } from "bullmq";
import redis from "../models/redis.js";
import { processScanJob, processOverstayBomb } from "../services/scan.service.js";

export const scanWorker = new Worker("ScanQueue", async (job) => {
    try {
        if (job.name === "processScanJob") {
            console.log(`[Worker] Processing scan job ${job.id} for vehicle ${job.data.vehicleNo}`);
            await processScanJob(job.data);
        } else if (job.name === "checkOverstayBomb") {
            console.log(`[Worker] Executing Overstay Bomb evaluation ${job.id} for logId ${job.data.logId}`);
            await processOverstayBomb(job.data);
        }
    } catch (error) {
        console.error(`[Worker] Error processing job ${job.id}:`, error.message);
        throw error; // Let BullMQ handle retries
    }
}, {
    connection: redis,
    concurrency: 15, // Process up to 15 concurrent scans
});

scanWorker.on("completed", (job) => {
    console.log(`[Worker] ✅ Job ${job.id} completed successfully`);
});

scanWorker.on("failed", (job, err) => {
    console.error(`[Worker] ❌ Job ${job.id} failed after retries. Reason: ${err.message}`);
});

console.log("✅ BullMQ Scan Worker started");
