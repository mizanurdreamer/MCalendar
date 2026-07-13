import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding bookingCalendar...");

  const passwordHash = await bcrypt.hash("Password123!", 10);

  await prisma.user.upsert({
    where: { email: "admin@bookingcalendar.com" },
    update: {},
    create: {
      email: "admin@bookingcalendar.com",
      passwordHash,
      firstName: "Ava",
      lastName: "Admin",
      role: "SUPER_ADMIN",
    },
  });

  console.log("✅ Seed complete.");
  console.log("   Super Admin: admin@bookingcalendar.com / Password123!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
