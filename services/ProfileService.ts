import { prisma } from "@/lib/prisma";
import type { ActorContext } from "@/models";
import type { UpdateClientProfileDTO, UpdateCleanerProfileDTO } from "@/dto/profile.dto";

type ClientProfileView = {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  companyName: string | null;
  primaryContact: string | null;
  portfolioSize: number | null;
  timezone: string | null;
};

type CleanerProfileView = {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  serviceArea: string | null;
  hourlyRate: number | null;
  rating: number | null;
};

function emptyToNull(value?: string | null) {
  if (value === undefined) return undefined;
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function splitName(value: string) {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) return { firstName: "", lastName: "" };
  const parts = normalized.split(" ");
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

function joinName(firstName?: string, lastName?: string) {
  return [firstName?.trim(), lastName?.trim()].filter(Boolean).join(" ").trim();
}

export class ProfileService {
  async getClient(actor: ActorContext): Promise<ClientProfileView> {
    let clientProfileId: string;

    if (actor.role === "CLIENT") {
      const clientProfile = await prisma.clientProfile.findUniqueOrThrow({
        where: {
          userId: actor.userId,
        },
      });

      clientProfileId = clientProfile.id;
    } else if (actor.role === "CLEANER") {
      const cleanerProfile = await prisma.cleanerProfile.findUniqueOrThrow({
        where: {
          userId: actor.userId,
        },
      });

      if (!cleanerProfile.clientId) {
        throw new Error("Cleaner is not assigned to a client");
      }

      clientProfileId = cleanerProfile.clientId;
    } else {
      throw new Error("Invalid actor role");
    }

    const profile = await prisma.clientProfile.findUniqueOrThrow({
      where: {
        id: clientProfileId,
      },
    });

    return {
      userId: profile.userId,
      firstName: profile.firstName,
      lastName: profile.lastName,
      email: profile.Email,
      phone: emptyToNull(profile.phoneNo) ?? null,
      companyName: profile.companyName,
      primaryContact: joinName(profile.firstName, profile.lastName) || null,
      portfolioSize: profile.portfolioSize,
      timezone: profile.timezone,
    };
  }

  async updateClient(
    actor: ActorContext,
    dto: UpdateClientProfileDTO,
  ): Promise<ClientProfileView> {
    const currentUser = await prisma.user.findUniqueOrThrow({
      where: { id: actor.userId },
    });
    const [user, profile] = await prisma.$transaction([
      prisma.user.update({
        where: { id: actor.userId },
        data: {
          ...(dto.firstName !== undefined || dto.lastName !== undefined
            ? { displayName: joinName(dto.firstName, dto.lastName) || "Unnamed User" }
            : {}),
          updatedBy: actor.userId,
        },
      }),
      prisma.clientProfile.upsert({
        where: { userId: actor.userId },
        update: {
          ...(dto.firstName !== undefined ? { firstName: dto.firstName } : {}),
          ...(dto.lastName !== undefined ? { lastName: dto.lastName } : {}),
          ...(dto.phone !== undefined ? { phoneNo: emptyToNull(dto.phone) ?? "" } : {}),
          companyName: emptyToNull(dto.companyName),
          portfolioSize: dto.portfolioSize,
          timezone: emptyToNull(dto.timezone),
          updatedBy: actor.userId,
        },
        create: {
          userId: actor.userId,
          Email: currentUser.email,
          firstName: dto.firstName ?? "",
          lastName: dto.lastName ?? "",
          phoneNo: emptyToNull(dto.phone) ?? "",
          companyName: emptyToNull(dto.companyName) ?? null,
          portfolioSize: dto.portfolioSize ?? null,
          timezone: emptyToNull(dto.timezone) ?? null,
          createdBy: actor.userId,
          updatedBy: actor.userId,
        },
      }),
    ]);

    const name = splitName(user.displayName);
    return {
      userId: profile.userId,
      firstName: profile.firstName || name.firstName,
      lastName: profile.lastName || name.lastName,
      email: profile.Email || user.email,
      phone: emptyToNull(profile.phoneNo) ?? null,
      companyName: profile.companyName,
      primaryContact: joinName(profile.firstName, profile.lastName) || null,
      portfolioSize: profile.portfolioSize,
      timezone: profile.timezone,
    };
  }

  async getCleaner(actor: ActorContext): Promise<CleanerProfileView> {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: actor.userId } });
    const fallbackName = splitName(user.displayName);
    const profile = await prisma.cleanerProfile.upsert({
      where: { userId: actor.userId },
      update: {},
      create: {
        userId: actor.userId,
        Email: user.email,
        firstName: fallbackName.firstName,
        lastName: fallbackName.lastName,
        phoneNo: "",
        createdBy: actor.userId,
        updatedBy: actor.userId,
      },
    });

    return {
      userId: profile.userId,
      firstName: profile.firstName,
      lastName: profile.lastName,
      email: profile.Email,
      phone: emptyToNull(profile.phoneNo) ?? null,
      serviceArea: profile.serviceArea,
      hourlyRate: profile.hourlyRate,
      rating: profile.rating ? Number(profile.rating) : null,
    };
  }

  async updateCleaner(
    actor: ActorContext,
    dto: UpdateCleanerProfileDTO,
  ): Promise<CleanerProfileView> {
    const currentUser = await prisma.user.findUniqueOrThrow({
      where: { id: actor.userId },
    });
    const [user, profile] = await prisma.$transaction([
      prisma.user.update({
        where: { id: actor.userId },
        data: {
          ...(dto.firstName !== undefined || dto.lastName !== undefined
            ? { displayName: joinName(dto.firstName, dto.lastName) || "Unnamed User" }
            : {}),
          updatedBy: actor.userId,
        },
      }),
      prisma.cleanerProfile.upsert({
        where: { userId: actor.userId },
        update: {
          ...(dto.firstName !== undefined ? { firstName: dto.firstName } : {}),
          ...(dto.lastName !== undefined ? { lastName: dto.lastName } : {}),
          ...(dto.phone !== undefined ? { phoneNo: emptyToNull(dto.phone) ?? "" } : {}),
          serviceArea: emptyToNull(dto.serviceArea),
          hourlyRate: dto.hourlyRate,
          rating: dto.rating,
          updatedBy: actor.userId,
        },
        create: {
          userId: actor.userId,
          Email: currentUser.email,
          firstName: dto.firstName ?? "",
          lastName: dto.lastName ?? "",
          phoneNo: emptyToNull(dto.phone) ?? "",
          serviceArea: emptyToNull(dto.serviceArea) ?? null,
          hourlyRate: dto.hourlyRate ?? null,
          rating: dto.rating ?? null,
          createdBy: actor.userId,
          updatedBy: actor.userId,
        },
      }),
    ]);

    const name = splitName(user.displayName);
    return {
      userId: profile.userId,
      firstName: profile.firstName || name.firstName,
      lastName: profile.lastName || name.lastName,
      email: profile.Email || user.email,
      phone: emptyToNull(profile.phoneNo) ?? null,
      serviceArea: profile.serviceArea,
      hourlyRate: profile.hourlyRate,
      rating: profile.rating ? Number(profile.rating) : null,
    };
  }
}

export const profileService = new ProfileService();
