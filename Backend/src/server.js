import app from "./app.js";
import env from "./configs/env.config.js";
import prisma from "./models/prisma.js";

const startServer = async () => {
    try {
        // Verify database connectivity
        await prisma.$connect();
        console.log("✅ Database connected");

        app.listen(env.port, () => {
            console.log(`🚀 Server running on port ${env.port} [${env.nodeEnv}]`);
        });
    } catch (error) {
        console.error("❌ Failed to start server:", error);
        process.exit(1);
    }
};

// Graceful shutdown
const gracefulShutdown = async (signal) => {
    console.log(`\n${signal} received. Shutting down gracefully...`);
    await prisma.$disconnect();
    process.exit(0);
};

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

startServer();
