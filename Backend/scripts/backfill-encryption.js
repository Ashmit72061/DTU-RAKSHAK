/**
 * One-time backfill script: encrypts existing plaintext vehicleNo and mobileNo
 * in the vehicles table, and populates vehicleNoHash in entry_exit_logs.
 *
 * Run ONCE after applying the Prisma migration:
 *   node scripts/backfill-encryption.js
 *
 * Prerequisites:
 *   - .env must contain a valid ENCRYPTION_KEY
 *   - DATABASE_URL must point to the migrated database
 */

import "dotenv/config";
import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ── Inline crypto (no circular dep on env.config.js) ─────────────────────────
const KEY = Buffer.from(process.env.ENCRYPTION_KEY, "base64");
if (KEY.length !== 32) {
    console.error(`❌ ENCRYPTION_KEY must decode to exactly 32 bytes (got ${KEY.length})`);
    process.exit(1);
}

function encrypt(plaintext) {
    const iv      = crypto.randomBytes(12);
    const cipher  = crypto.createCipheriv("aes-256-gcm", KEY, iv, { authTagLength: 16 });
    const content = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    return JSON.stringify({ iv: iv.toString("hex"), content: content.toString("hex"), tag: cipher.getAuthTag().toString("hex") });
}

function isAlreadyEncrypted(value) {
    try {
        const parsed = JSON.parse(value);
        return typeof parsed.iv === "string" && typeof parsed.content === "string" && typeof parsed.tag === "string";
    } catch {
        return false;
    }
}

function sha256(value) {
    return crypto.createHash("sha256").update(value).digest("hex");
}

function normalizeVehicleNo(raw) {
    const clean    = raw.toUpperCase().replace(/\s/g, "").replace(/[-./]/g, "");
    const stripped = clean.replace(/^(INC|IND|VH|REG|NO|NUM)/, "");
    return stripped.length ? stripped : clean;
}

function normalizePhone(raw) {
    const digits = String(raw).replace(/\D/g, "");
    if (digits.length === 10) return `+91${digits}`;
    if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
    return digits;
}

// ── Backfill vehicles table ───────────────────────────────────────────────────
async function backfillVehicles() {
    const vehicles = await prisma.vehicle.findMany();
    console.log(`\n📋 Found ${vehicles.length} vehicle(s) to process.`);

    let updated = 0;
    let skipped = 0;

    for (const v of vehicles) {
        // Skip if already encrypted (safe to re-run)
        if (isAlreadyEncrypted(v.vehicleNo) && isAlreadyEncrypted(v.mobileNo)) {
            skipped++;
            continue;
        }

        const normalVehicleNo = normalizeVehicleNo(v.vehicleNo);
        const normalMobileNo  = normalizePhone(v.mobileNo);

        try {
            await prisma.vehicle.update({
                where: { id: v.id },
                data: {
                    vehicleNo:     encrypt(normalVehicleNo),
                    vehicleNoHash: sha256(normalVehicleNo),
                    mobileNo:      encrypt(normalMobileNo),
                    mobileNoHash:  sha256(normalMobileNo),
                },
            });
            updated++;
            console.log(`  ✅ Vehicle ${v.id} (${normalVehicleNo}) encrypted`);
        } catch (err) {
            console.error(`  ❌ Failed to update vehicle ${v.id}: ${err.message}`);
        }
    }

    console.log(`\nVehicles: ${updated} updated, ${skipped} already encrypted.`);
}

// ── Backfill entry_exit_logs table ────────────────────────────────────────────
async function backfillLogs() {
    // Process in chunks to avoid memory pressure on large tables
    const CHUNK = 500;
    let offset  = 0;
    let total   = 0;

    console.log("\n📋 Backfilling entry_exit_logs vehicleNoHash...");

    while (true) {
        const logs = await prisma.entryExitLog.findMany({
            where:  { vehicleNoHash: "" }, // empty string = not yet populated
            take:   CHUNK,
            skip:   offset,
            select: { id: true, vehicleNo: true },
        });

        if (logs.length === 0) break;

        // Batch update with individual queries (Prisma doesn't support batch update with different values)
        await Promise.all(logs.map(log =>
            prisma.entryExitLog.update({
                where: { id: log.id },
                data:  { vehicleNoHash: sha256(normalizeVehicleNo(log.vehicleNo)) },
            })
        ));

        total  += logs.length;
        offset += CHUNK;
        console.log(`  ✅ Processed ${total} log(s)...`);
    }

    console.log(`\nLogs: ${total} hash(es) populated.`);
}

// ── Main ─────────────────────────────────────────────────────────────────────
(async () => {
    try {
        await backfillVehicles();
        await backfillLogs();
        console.log("\n🎉 Backfill complete.");
    } catch (err) {
        console.error("\n💥 Backfill failed:", err.message);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
})();
