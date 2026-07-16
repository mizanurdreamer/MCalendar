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

 const existingUser = await prisma.user.findFirst({
    where: {
      email: "admin@bookingcalendar.com",
    },
  });
 
  if (!existingUser) {
    await prisma.user.create({
      data: {
        email: "admin@bookingcalendar.com",
        passwordHash: password,
        displayName: "Ava Admin",
        role: {
          connect: {
            name: "SUPER_ADMIN",
          },
        },
      },
    });
  }
  await prisma.smsGateway.upsert({
    where: { name: "T-Mobile" },
    update: { domain: "tmomail.net", isActive: true, isDeleted: false, deletedAt: null },
    create: { name: "T-Mobile", domain: "@tmomail.net", isActive: true },
  });

  await prisma.smsGateway.upsert({
    where: { name: "AT&T" },
    update: { domain: "@txt.att.net", isActive: true, isDeleted: false, deletedAt: null },
    create: { name: "AT&T", domain: "@txt.att.net", isActive: true },
  });

  await prisma.smsGateway.upsert({
    where: { name: "Verizon" },
    update: { domain: "@vtext.com", isActive: true, isDeleted: false, deletedAt: null },
    create: { name: "Verizon", domain: "@vtext.com", isActive: true },
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
