import { prisma } from "@/lib/prisma";
import { cleanerTaskScheduleRepository } from "@/repositories/CleanerTaskScheduleRepository";
import { smsViaEmailService } from "@/services/SmsViaEmailService";
import { CleanerTaskStatus } from "@/lib/enums/CleanerTaskStatus";

interface ExecuteResult {
  total: number;
  assigned: number;
  smsSent: number;
  skipped: number;
}

interface CleanerInfo {
  id: string;
  firstName: string;
  lastName: string;
  phoneNo: string | null;
  clientId: string | null;
  smsGateway: { name: string; domain: string } | null;
}

export class AutoAssignCleanerJob {
  async execute(): Promise<ExecuteResult> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const clients = await prisma.clientProfile.findMany({
      where: { isDeleted: false },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!clients.length) {
      return { total: 0, assigned: 0, smsSent: 0, skipped: 0 };
    }

    const clientIds = clients.map((c) => c.id);
    const clientNameMap = new Map(clients.map((c) => [c.id, { firstName: c.firstName, lastName: c.lastName }]));

    const bookings = await this.getUpcomingBookings(clientIds, today);
    if (!bookings.length) {
      return { total: 0, assigned: 0, smsSent: 0, skipped: 0 };
    }

    const existingScheduleKeys = await this.getExistingScheduleKeys(today);
    const dedicatedCleanerMap = await this.getDedicatedCleanerMap(clientIds);
    const freeCleaners = await this.getFreeCleaners();

    const usedFreeCleaners = new Set<string>();

    let assigned = 0;
    let smsSent = 0;
    let skipped = 0;

    for (const booking of bookings) {
      const cleaningDate = new Date(booking.endDate);
      cleaningDate.setDate(cleaningDate.getDate() - 1);
      cleaningDate.setHours(0, 0, 0, 0);

      if (cleaningDate < today) continue;

      const scheduleKey = `${booking.clientId}|${this.dateKey(cleaningDate)}`;
      if (existingScheduleKeys.has(scheduleKey)) continue;

      const clientName = clientNameMap.get(booking.clientId);
      if (!clientName) {
        skipped++;
        continue;
      }

      const dedicated = dedicatedCleanerMap.get(booking.clientId) ?? [];

      let cleaner: CleanerInfo | null = null;

      if (dedicated.length === 1) {
        const candidate = dedicated[0];
        if (!(await this.isCleanerBusyOnDate(candidate.id, cleaningDate))) {
          cleaner = candidate;
        } else {
          const fallback = this.findFreeCleaner(freeCleaners, usedFreeCleaners);
          if (fallback) {
            cleaner = fallback;
          }
        }
      } else {
        const candidate = this.findFreeCleaner(freeCleaners, usedFreeCleaners);
        if (candidate) {
          cleaner = candidate;
        }
      }

      if (!cleaner) {
        console.log(`[AutoAssignCleaner] No cleaner available for client ${booking.clientId} on ${cleaningDate.toISOString()}`);
        skipped++;
        continue;
      }

      if (await this.isCleanerBusyOnDate(cleaner.id, cleaningDate)) {
        console.log(`[AutoAssignCleaner] Cleaner ${cleaner.firstName} ${cleaner.lastName} already busy on ${cleaningDate.toISOString()}`);
        skipped++;
        continue;
      }

      if (!(await this.checkCleanerAvailability(cleaner.id, cleaningDate))) {
        console.log(`[AutoAssignCleaner] Cleaner ${cleaner.firstName} ${cleaner.lastName} not available on ${cleaningDate.toISOString()}`);
        skipped++;
        continue;
      }

      usedFreeCleaners.add(cleaner.id);

      try {
        const schedule = await cleanerTaskScheduleRepository.create({
          client: { connect: { id: booking.clientId } },
          cleaner: { connect: { id: cleaner.id } },
          assignedDate: cleaningDate,
          status: CleanerTaskStatus.ASSIGNED,
          isSentSms: false,
        });
        existingScheduleKeys.add(scheduleKey);
        assigned++;

        if (cleaner.phoneNo && cleaner.smsGateway) {
          try {
            await smsViaEmailService.send({
              phone: cleaner.phoneNo,
              message: `You have been assigned to clean for ${clientName.firstName} ${clientName.lastName} on ${cleaningDate.toLocaleDateString()}.`,
              gatewayName: cleaner.smsGateway.name,
            });
            await cleanerTaskScheduleRepository.update(schedule.id, {
              isSentSms: true,
              smsSentDate: new Date(),
            });
            smsSent++;
          } catch (smsError) {
            console.error(`[AutoAssignCleaner] SMS to ${cleaner.firstName} failed:`, smsError);
          }
        }
      } catch (error) {
        console.error(`[AutoAssignCleaner] Assignment failed for client ${booking.clientId}:`, error);
      }
    }

    return { total: bookings.length, assigned, smsSent, skipped };
  }

  private async getUpcomingBookings(clientIds: string[], today: Date) {
    const thirtyDaysFromNow = new Date(today);
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const rows = await prisma.guestBookingInfo.findMany({
      where: {
        clientId: { in: clientIds },
        endDate: { not: null, gte: today, lte: thirtyDaysFromNow },
        isDeleted: false,
      },
      select: {
        clientId: true,
        endDate: true,
      },
      orderBy: { endDate: "asc" },
    });

    const seen = new Set<string>();
    const unique: Array<{ clientId: string; endDate: Date }> = [];
    for (const row of rows) {
      if (!row.endDate) continue;
      const key = `${row.clientId}|${this.dateKey(row.endDate)}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push({ clientId: row.clientId, endDate: row.endDate });
      }
    }
    return unique;
  }

  private async getExistingScheduleKeys(today: Date) {
    const thirtyDaysFromNow = new Date(today);
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const schedules = await prisma.cleanerTaskSchedule.findMany({
      where: {
        assignedDate: { gte: today, lt: thirtyDaysFromNow },
        deletedAt: null,
      },
      select: { clientId: true, assignedDate: true },
    });

    const keys = new Set<string>();
    for (const s of schedules) {
      keys.add(`${s.clientId}|${this.dateKey(s.assignedDate)}`);
    }
    return keys;
  }

  private async getDedicatedCleanerMap(clientIds: string[]) {
    const cleaners = await prisma.cleanerProfile.findMany({
      where: {
        clientId: { in: clientIds },
        isDeleted: false,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phoneNo: true,
        clientId: true,
        smsGateway: { select: { name: true, domain: true } },
      },
    });

    const map = new Map<string, CleanerInfo[]>();
    for (const c of cleaners) {
      if (!c.clientId) continue;
      const list = map.get(c.clientId) ?? [];
      list.push(c);
      map.set(c.clientId, list);
    }
    return map;
  }

  private async getFreeCleaners(): Promise<CleanerInfo[]> {
    return prisma.cleanerProfile.findMany({
      where: { clientId: null, isDeleted: false },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phoneNo: true,
        clientId: true,
        smsGateway: { select: { name: true, domain: true } },
      },
    });
  }

  private findFreeCleaner(
    freeCleaners: CleanerInfo[],
    usedIds: Set<string>,
  ): CleanerInfo | null {
    for (const c of freeCleaners) {
      if (usedIds.has(c.id)) continue;
      return c;
    }
    return null;
  }

  private dateKey(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  private async isCleanerBusyOnDate(cleanerId: string, date: Date): Promise<boolean> {
    const nextDay = new Date(date);
    nextDay.setDate(nextDay.getDate() + 1);

    const count = await prisma.cleanerTaskSchedule.count({
      where: {
        cleanerId,
        assignedDate: { gte: date, lt: nextDay },
        deletedAt: null,
      },
    });
    return count > 0;
  }

  private async checkCleanerAvailability(cleanerId: string, date: Date): Promise<boolean> {
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const count = await prisma.cleanerAvailability.count({
      where: {
        cleanerId,
        isActive: true,
        isDeleted: false,
        fromDate: { lte: endOfDay },
        OR: [{ toDate: null }, { toDate: { gte: date } }],
      },
    });
    return count > 0;
  }
}

export const autoAssignCleanerJob = new AutoAssignCleanerJob();
