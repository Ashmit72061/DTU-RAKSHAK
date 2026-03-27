// delete-fake.js
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
    // Delete the specific fake token or just clear the table
    const deleted = await prisma.deviceToken.deleteMany({
        where: {
            token: {
                contains: "test-fake" 
            }
        }
    });
    console.log(`🗑️ Deleted ${deleted.count} fake tokens.`);
}

main().finally(() => prisma.$disconnect());