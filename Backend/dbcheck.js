import prisma from "./src/models/prisma.js";

const tokens = await prisma.deviceToken.findMany();

if (tokens.length === 0) {
    console.log("❌ No device tokens found — app hasn't registered yet");
} else {
    console.log(`✅ Found ${tokens.length} token(s):\n`);
    tokens.forEach((t, i) => {
        console.log(`[${i + 1}] id:        ${t.id}`);
        console.log(`     token:     ${t.token.slice(0, 20)}...`);  // truncated for readability
        console.log(`     userId:    ${t.userId ?? "null"}`);
        console.log(`     createdAt: ${t.createdAt}\n`);
    });
}

await prisma.$disconnect();