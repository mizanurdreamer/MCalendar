import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function hash(plain: string) {
  return bcrypt.hash(plain, 10);
}

async function main() {
  console.log("🌱 Seeding bookingCalendar...");

  const password = await hash("Password123!");
  await prisma.role.upsert({
    where: { name: "SUPER_ADMIN" },
    update: {},
    create: { name: "SUPER_ADMIN" },
  });
  await prisma.role.upsert({
    where: { name: "CLIENT" },
    update: {},
    create: { name: "CLIENT" },
  });
  await prisma.role.upsert({
    where: { name: "CLEANER" },
    update: {},
    create: { name: "CLEANER" },
  });

  await prisma.user.upsert({
    where: { email: "admin@bookingcalendar.com" },
    update: {},
    create: {
      email: "admin@bookingcalendar.com",
      passwordHash: password,
      displayName: "Ava Admin",
      role: { connect: { name: "SUPER_ADMIN" } },
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
