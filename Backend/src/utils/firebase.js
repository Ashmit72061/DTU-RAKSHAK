import admin from "firebase-admin";
import { readFileSync } from "fs";
import prisma from "../models/prisma.js";


let serviceAccount;
try {
    serviceAccount = JSON.parse(readFileSync("./firebase-service-account.json", "utf8"));
} catch {
    console.warn("[FCM] firebase-service-account.json not found — push notifications disabled");
}

if (serviceAccount && !admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
    });
    console.log("✅ Firebase Admin initialized");
}

export async function sendPushNotification({ title, body, data = {} }) {
    if (!serviceAccount || !admin.apps.length) return;

    const tokens = await prisma.deviceToken.findMany();
    if (tokens.length === 0) return;

    const tokenList = tokens.map(t => t.token);

    // FCM requires all data values to be strings
    const stringData = Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, String(v ?? "")])
    );

    let response;
    try {
        response = await admin.messaging().sendEachForMulticast({
            tokens: tokenList,
            notification: { title, body },
            data: stringData,
            android: {
                priority: "high",
                notification: {
                    channelId: "alerts",
                    sound: "default",
                    priority: "max",
                    visibility: "public",
                },
            },
        });
    } catch (err) {
        console.error("[FCM] sendEachForMulticast failed:", err.message);
        return;
    }

    console.log(`[FCM] Sent: ${response.successCount} ok, ${response.failureCount} failed`);

    // Clean up dead tokens
    const failed = [];
    response.responses.forEach((r, i) => {
        if (!r.success) {
            console.warn(`[FCM] Token failed: ${r.error?.code}`);
            if (
                r.error?.code === "messaging/invalid-registration-token" ||
                r.error?.code === "messaging/registration-token-not-registered"
            ) {
                failed.push(tokenList[i]);
            }
        }
    });

    if (failed.length > 0) {
        await prisma.deviceToken.deleteMany({ where: { token: { in: failed } } });
        console.log(`[FCM] Removed ${failed.length} invalid token(s)`);
    }
}