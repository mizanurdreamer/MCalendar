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

export class ProfileService {
  async getClient(actor: ActorContext): Promise<ClientProfileView> {
    const profile = await prisma.clientProfile.upsert({
      where: { userId: actor.userId },
      update: {},
      create: { userId: actor.userId, createdBy: actor.userId, updatedBy: actor.userId },
      include: { user: true },
    });

    return {
      userId: profile.userId,
      firstName: profile.user.firstName,
      lastName: profile.user.lastName,
      email: profile.user.email,
      phone: profile.user.phone,
      companyName: profile.companyName,
      primaryContact: profile.primaryContact,
      portfolioSize: profile.portfolioSize,
      timezone: profile.timezone,
    };
  }

  async updateClient(actor: ActorContext, dto: UpdateClientProfileDTO): Promise<ClientProfileView> {
    const [profile] = await prisma.$transaction([
      prisma.clientProfile.upsert({
        where: { userId: actor.userId },
        update: {
          companyName: emptyToNull(dto.companyName),
          primaryContact: emptyToNull(dto.primaryContact),
          portfolioSize: dto.portfolioSize,
          timezone: emptyToNull(dto.timezone),
          updatedBy: actor.userId,
        },
        create: {
          userId: actor.userId,
          companyName: emptyToNull(dto.companyName) ?? null,
          primaryContact: emptyToNull(dto.primaryContact) ?? null,
          portfolioSize: dto.portfolioSize ?? null,
          timezone: emptyToNull(dto.timezone) ?? null,
          createdBy: actor.userId,
          updatedBy: actor.userId,
        },
      }),
      prisma.user.update({
        where: { id: actor.userId },
        data: {
          firstName: dto.firstName,
          lastName: dto.lastName,
          phone: dto.phone === undefined ? undefined : emptyToNull(dto.phone),
          updatedBy: actor.userId,
        },
      }),
    ]);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: actor.userId } });
    return {
      userId: profile.userId,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone,
      companyName: profile.companyName,
      primaryContact: profile.primaryContact,
      portfolioSize: profile.portfolioSize,
      timezone: profile.timezone,
    };
  }

  async getCleaner(actor: ActorContext): Promise<CleanerProfileView> {
    const profile = await prisma.cleanerProfile.upsert({
      where: { userId: actor.userId },
      update: {},
      create: { userId: actor.userId, createdBy: actor.userId, updatedBy: actor.userId },
      include: { user: true },
    });

    return {
      userId: profile.userId,
      firstName: profile.user.firstName,
      lastName: profile.user.lastName,
      email: profile.user.email,
      phone: profile.user.phone,
      serviceArea: profile.serviceArea,
      hourlyRate: profile.hourlyRate,
      rating: profile.rating ? Number(profile.rating) : null,
    };
  }

  async updateCleaner(actor: ActorContext, dto: UpdateCleanerProfileDTO): Promise<CleanerProfileView> {
    const [profile] = await prisma.$transaction([
      prisma.cleanerProfile.upsert({
        where: { userId: actor.userId },
        update: {
          serviceArea: emptyToNull(dto.serviceArea),
          hourlyRate: dto.hourlyRate,
          rating: dto.rating,
          updatedBy: actor.userId,
        },
        create: {
          userId: actor.userId,
          serviceArea: emptyToNull(dto.serviceArea) ?? null,
          hourlyRate: dto.hourlyRate ?? null,
          rating: dto.rating ?? null,
          createdBy: actor.userId,
          updatedBy: actor.userId,
        },
      }),
      prisma.user.update({
        where: { id: actor.userId },
        data: {
          firstName: dto.firstName,
          lastName: dto.lastName,
          phone: dto.phone === undefined ? undefined : emptyToNull(dto.phone),
          updatedBy: actor.userId,
        },
      }),
    ]);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: actor.userId } });
    return {
      userId: profile.userId,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone,
      serviceArea: profile.serviceArea,
      hourlyRate: profile.hourlyRate,
      rating: profile.rating ? Number(profile.rating) : null,
    };
  }
}

export const profileService = new ProfileService();
