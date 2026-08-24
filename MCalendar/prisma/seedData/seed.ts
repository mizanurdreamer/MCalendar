import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function hash(plain: string) {
  return bcrypt.hash(plain, 10);
}

async function main() {
  console.log("🌱 Seeding bookingCalendar...");

  const password = await hash("Password123!");

  // =====================================================
  // ROLES
  // =====================================================

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
    where: { name: "ROOM_ATTENDANT" },
    update: {},
    create: { name: "ROOM_ATTENDANT" },
  });

  // =====================================================
  // SMS GATEWAYS
  // =====================================================

  await prisma.smsGateway.upsert({
    where: { name: "T-Mobile" },
    update: {
      domain: "tmomail.net",
      isActive: true,
      isDeleted: false,
      deletedAt: null,
    },
    create: {
      name: "T-Mobile",
      domain: "tmomail.net",
      isActive: true,
    },
  });

  await prisma.smsGateway.upsert({
    where: { name: "AT&T" },
    update: {
      domain: "txt.att.net",
      isActive: true,
      isDeleted: false,
      deletedAt: null,
    },
    create: {
      name: "AT&T",
      domain: "txt.att.net",
      isActive: true,
    },
  });

  await prisma.smsGateway.upsert({
    where: { name: "Verizon" },
    update: {
      domain: "vtext.com",
      isActive: true,
      isDeleted: false,
      deletedAt: null,
    },
    create: {
      name: "Verizon",
      domain: "vtext.com",
      isActive: true,
    },
  });

  // Get the actual TextMagic record and its UUID
  const textMagic = await prisma.smsGateway.upsert({
    where: { name: "TextMagic" },
    update: {
      domain: "textmagic.com",
      isActive: true,
      isDeleted: false,
      deletedAt: null,
    },
    create: {
      name: "TextMagic",
      domain: "textmagic.com",
      isActive: true,
    },
  });

  console.log(`📱 TextMagic Gateway ID: ${textMagic.id}`);

  // =====================================================
  // ADMIN
  // =====================================================

  const existingAdmin = await prisma.user.findFirst({
    where: {
      email: "admin@bookingcalendar.com",
    },
  });

  if (!existingAdmin) {
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

    console.log("✅ Admin created");
  } else {
    console.log("ℹ️ Admin already exists");
  }

  // =====================================================
  // CLIENT
  // =====================================================

  let clientProfileId: string;

  const existingClient = await prisma.user.findFirst({
    where: {
      email: "client@bookingcalendar.com",
    },
    include: {
      clientProfile: true,
    },
  });

  if (!existingClient) {
    const clientUser = await prisma.user.create({
      data: {
        email: "client@bookingcalendar.com",
        passwordHash: password,
        displayName: "Client",
        role: {
          connect: {
            name: "CLIENT",
          },
        },
        clientProfile: {
          create: {
            Email: "client@bookingcalendar.com",
            firstName: "Client",
            lastName: "User",
            phoneNo: "0000000000",

            // TextMagic
            smsGateway: {
              connect: {
                id: textMagic.id,
              },
            },
          },
        },
      },
      include: {
        clientProfile: true,
      },
    });

    if (!clientUser.clientProfile) {
      throw new Error("Failed to create ClientProfile");
    }

    clientProfileId = clientUser.clientProfile.id;

    console.log("✅ Client created with TextMagic");
  } else {
    // Client exists but profile may not exist
    if (!existingClient.clientProfile) {
      const profile = await prisma.clientProfile.create({
        data: {
          user: {
            connect: {
              id: existingClient.id,
            },
          },
          Email: existingClient.email,
          firstName: "Client",
          lastName: "User",
          phoneNo: "0000000000",

          // TextMagic
          smsGateway: {
            connect: {
              id: textMagic.id,
            },
          },
        },
      });

      clientProfileId = profile.id;

      console.log("✅ Missing ClientProfile created with TextMagic");
    } else {
      // Update existing ClientProfile to TextMagic
      await prisma.clientProfile.update({
        where: {
          id: existingClient.clientProfile.id,
        },
        data: {
          smsGateway: {
            connect: {
              id: textMagic.id,
            },
          },
        },
      });

      clientProfileId = existingClient.clientProfile.id;

      console.log("ℹ️ Client exists - TextMagic assigned");
    }
  }

  // =====================================================
  // ROOM ATTENDANT
  // =====================================================

  const existingRoomAttendant = await prisma.user.findFirst({
    where: {
      email: "roomattendant@bookingcalendar.com",
    },
    include: {
      roomAttendantProfile: true,
    },
  });

  if (!existingRoomAttendant) {
    await prisma.user.create({
      data: {
        email: "roomattendant@bookingcalendar.com",
        passwordHash: password,
        displayName: "Room Attendant",
        role: {
          connect: {
            name: "ROOM_ATTENDANT",
          },
        },
        roomAttendantProfile: {
          create: {
            Email: "roomattendant@bookingcalendar.com",
            firstName: "Room",
            lastName: "Attendant",
            phoneNo: "0000000000",

            // Assign to ClientProfile
            client: {
              connect: {
                id: clientProfileId,
              },
            },

            // TextMagic
            smsGateway: {
              connect: {
                id: textMagic.id,
              },
            },
          },
        },
      },
    });

    console.log(
      "✅ Room attendant created with Client + TextMagic"
    );
  } else {
    // Room attendant exists but profile does not
    if (!existingRoomAttendant.roomAttendantProfile) {
      await prisma.roomAttendantProfile.create({
        data: {
          user: {
            connect: {
              id: existingRoomAttendant.id,
            },
          },
          Email: existingRoomAttendant.email,
          firstName: "Room",
          lastName: "Attendant",
          phoneNo: "0000000000",

          // Assign to ClientProfile
          client: {
            connect: {
              id: clientProfileId,
            },
          },

          // TextMagic
          smsGateway: {
            connect: {
              id: textMagic.id,
            },
          },
        },
      });

      console.log(
        "✅ Missing RoomAttendantProfile created with Client + TextMagic"
      );
    } else {
      // Update existing RoomAttendantProfile
      await prisma.roomAttendantProfile.update({
        where: {
          id: existingRoomAttendant.roomAttendantProfile.id,
        },
        data: {
          // Assign to ClientProfile
          client: {
            connect: {
              id: clientProfileId,
            },
          },

          // Assign TextMagic
          smsGateway: {
            connect: {
              id: textMagic.id,
            },
          },
        },
      });

      console.log(
        "ℹ️ Room attendant exists - Client + TextMagic assigned"
      );
    }
  }

  // =====================================================
  // COMPLETE
  // =====================================================

  console.log("====================================");
  console.log("✅ Seed complete.");
  console.log("====================================");

  console.log(
    "Super Admin: admin@bookingcalendar.com / Password123!"
  );

  console.log(
    "Client: client@bookingcalendar.com / Password123!"
  );

  console.log(
    "Room Attendant: roomattendant@bookingcalendar.com / Password123!"
  );

  console.log(`TextMagic ID: ${textMagic.id}`);
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });