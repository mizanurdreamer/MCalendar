import { prisma } from "@/lib/prisma";
import { roomAttendantTaskScheduleRepository } from "@/repositories/RoomAttendantTaskScheduleRepository";
import { smsViaEmailService } from "@/services/SmsViaEmailService";
import { RoomAttendantTaskStatus } from "@/lib/enums/RoomAttendantTaskStatus";

interface ExecuteResult {
  total: number;
  assigned: number;
  smsSent: number;
  skipped: number;
}

interface RoomAttendantInfo {
  id: string;
  firstName: string;
  lastName: string;
  phoneNo: string | null;
  clientId: string | null;
  smsGateway: { name: string; domain: string } | null;
}

export class AutoAssignRoomAttendantJob {
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
    const dedicatedRoomAttendantMap = await this.getDedicatedRoomAttendantMap(clientIds);
    const freeRoomAttendants = await this.getFreeRoomAttendants();

    const usedFreeRoomAttendants = new Set<string>();

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

      const dedicated = dedicatedRoomAttendantMap.get(booking.clientId) ?? [];

      let roomAttendant: RoomAttendantInfo | null = null;

      if (dedicated.length === 1) {
        const candidate = dedicated[0];
        if (!(await this.isRoomAttendantBusyOnDate(candidate.id, cleaningDate))) {
          roomAttendant = candidate;
        } else {
          const fallback = this.findFreeRoomAttendant(freeRoomAttendants, usedFreeRoomAttendants);
          if (fallback) {
            roomAttendant = fallback;
          }
        }
      } else {
        const candidate = this.findFreeRoomAttendant(freeRoomAttendants, usedFreeRoomAttendants);
        if (candidate) {
          roomAttendant = candidate;
        }
      }

      if (!roomAttendant) {
        console.log(`[AutoAssignRoomAttendant] No roomAttendant available for client ${booking.clientId} on ${cleaningDate.toISOString()}`);
        skipped++;
        continue;
      }

      if (await this.isRoomAttendantBusyOnDate(roomAttendant.id, cleaningDate)) {
        console.log(`[AutoAssignRoomAttendant] RoomAttendant ${roomAttendant.firstName} ${roomAttendant.lastName} already busy on ${cleaningDate.toISOString()}`);
        skipped++;
        continue;
      }

      if (!(await this.checkRoomAttendantAvailability(roomAttendant.id, cleaningDate))) {
        console.log(`[AutoAssignRoomAttendant] RoomAttendant ${roomAttendant.firstName} ${roomAttendant.lastName} not available on ${cleaningDate.toISOString()}`);
        skipped++;
        continue;
      }

      usedFreeRoomAttendants.add(roomAttendant.id);

      try {
        const schedule = await roomAttendantTaskScheduleRepository.create({
          client: { connect: { id: booking.clientId } },
          roomAttendant: { connect: { id: roomAttendant.id } },
          assignedDate: cleaningDate,
          status: RoomAttendantTaskStatus.ASSIGNED,
          isSentSms: false,
        });
        existingScheduleKeys.add(scheduleKey);
        assigned++;

        if (roomAttendant.phoneNo && roomAttendant.smsGateway) {
          try {
            await smsViaEmailService.send({
              phone: roomAttendant.phoneNo,
              message: `You have been assigned to clean for ${clientName.firstName} ${clientName.lastName} on ${cleaningDate.toLocaleDateString()}.`,
              gatewayName: roomAttendant.smsGateway.name,
            });
            await roomAttendantTaskScheduleRepository.update(schedule.id, {
              isSentSms: true,
              smsSentDate: new Date(),
            });
            smsSent++;
          } catch (smsError) {
            console.error(`[AutoAssignRoomAttendant] SMS to ${roomAttendant.firstName} failed:`, smsError);
          }
        }
      } catch (error) {
        console.error(`[AutoAssignRoomAttendant] Assignment failed for client ${booking.clientId}:`, error);
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

    const schedules = await prisma.roomAttendantTaskSchedule.findMany({
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

  private async getDedicatedRoomAttendantMap(clientIds: string[]) {
    const roomAttendants = await prisma.roomAttendantProfile.findMany({
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

    const map = new Map<string, RoomAttendantInfo[]>();
    for (const c of roomAttendants) {
      if (!c.clientId) continue;
      const list = map.get(c.clientId) ?? [];
      list.push(c);
      map.set(c.clientId, list);
    }
    return map;
  }

  private async getFreeRoomAttendants(): Promise<RoomAttendantInfo[]> {
    return prisma.roomAttendantProfile.findMany({
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

  private findFreeRoomAttendant(
    freeRoomAttendants: RoomAttendantInfo[],
    usedIds: Set<string>,
  ): RoomAttendantInfo | null {
    for (const c of freeRoomAttendants) {
      if (usedIds.has(c.id)) continue;
      return c;
    }
    return null;
  }

  private dateKey(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  private async isRoomAttendantBusyOnDate(roomAttendantId: string, date: Date): Promise<boolean> {
    const nextDay = new Date(date);
    nextDay.setDate(nextDay.getDate() + 1);

    const count = await prisma.roomAttendantTaskSchedule.count({
      where: {
        roomAttendantId,
        assignedDate: { gte: date, lt: nextDay },
        deletedAt: null,
      },
    });
    return count > 0;
  }

  private async checkRoomAttendantAvailability(roomAttendantId: string, date: Date): Promise<boolean> {
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const count = await prisma.roomAttendantAvailability.count({
      where: {
        roomAttendantId,
        isActive: true,
        isDeleted: false,
        fromDate: { lte: endOfDay },
        OR: [{ toDate: null }, { toDate: { gte: date } }],
      },
    });
    return count > 0;
  }
}

export const autoAssignRoomAttendantJob = new AutoAssignRoomAttendantJob();
