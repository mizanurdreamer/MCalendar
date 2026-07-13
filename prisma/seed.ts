import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function hash(plain: string) {
  return bcrypt.hash(plain, 10);
}

async function main() {
  console.log("🌱 Seeding bookingCalendar...");

  const password = await hash("Password123!");

  const admin = await prisma.user.upsert({
    where: { email: "admin@bookingcalendar.com" },
    update: {},
    create: {
      email: "admin@bookingcalendar.com",
      passwordHash: password,
      firstName: "Ava",
      lastName: "Admin",
      role: "SUPER_ADMIN",
    },
  });

  const client = await prisma.user.upsert({
    where: { email: "client@bookingcalendar.com" },
    update: {},
    create: {
      email: "client@bookingcalendar.com",
      passwordHash: password,
      firstName: "Chris",
      lastName: "Client",
      phone: "+1 555 0100",
      role: "CLIENT",
    },
  });

  const cleaner = await prisma.user.upsert({
    where: { email: "cleaner@bookingcalendar.com" },
    update: {},
    create: {
      email: "cleaner@bookingcalendar.com",
      passwordHash: password,
      firstName: "Cleo",
      lastName: "Cleaner",
      phone: "+1 555 0200",
      role: "CLEANER",
    },
  });

  console.log("✅ Seed complete.");
  console.log("   Super Admin: admin@bookingcalendar.com / Password123!");
  console.log("   Client:      client@bookingcalendar.com / Password123!");
  console.log("   Cleaner:     cleaner@bookingcalendar.com / Password123!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
