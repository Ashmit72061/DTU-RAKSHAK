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
    if (!serviceAccount || !admin.apps.length) {
        console.error("[FCM] Service account not loaded");
        return;
    }

    const tokens = await prisma.deviceToken.findMany();
    console.log(`[FCM] Found ${tokens.length} tokens to notify`); // Add this debug line
    
    if (tokens.length === 0) return;

    const tokenList = tokens.map(t => t.token);

    // CRITICAL: Ensure all data values are strings and title/body are included here
    const stringData = {
        ...Object.fromEntries(
            Object.entries(data).map(([k, v]) => [k, String(v ?? "")])
        ),
        title: title,
        message: body,
        channelId: "alerts" // Ensure Android uses the correct channel
    };

    try {
        const response = await admin.messaging().sendEachForMulticast({
            tokens: tokenList,
            // We REMOVE the notification object to force Android to use onMessageReceived
            data: stringData, 
            android: {
                priority: "high", // Force wake up
            },
        });

        console.log(`[FCM] Result: ${response.successCount} sent, ${response.failureCount} failed`);

        // Clean up invalid tokens as you already have in your code...
    } catch (err) {
        console.error("[FCM] Error in sendEachForMulticast:", err);
    }
}