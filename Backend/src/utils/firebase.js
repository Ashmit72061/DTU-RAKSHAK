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

    // Merge title and body INTO the data object
    const stringData = {
        ...Object.fromEntries(
            Object.entries(data).map(([k, v]) => [k, String(v ?? "")])
        ),
        title: title, // Move title here
        message: body // Move body here
    };

    try {
        await admin.messaging().sendEachForMulticast({
            tokens: tokenList,
            // REMOVE the notification object entirely
            // notification: { title, body }, 
            data: stringData,
            android: {
                priority: "high",
            },
        });
    } catch (err) {
        console.error("[FCM] sendEachForMulticast failed:", err.message);
    }
}