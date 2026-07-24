import { prisma } from "@/util/prisma";
import { roomAttendantTaskScheduleRepository } from "@/repositories/RoomAttendantTaskScheduleRepository";
import { notificationHistoryRepository } from "@/repositories/RoomAttendantTaskNotificationHistoryRepository";
import { smsViaEmailService } from "@/services/SmsViaEmailService";
import { RoomAttendantTaskStatus } from "@/util/enums/RoomAttendantTaskStatus";
import { NotificationType } from "@/util/enums/NotificationType";
import { SmsSentStatus } from "@/util/enums/SmsSentStatus";

interface ExecuteResult {
  total: number;
  assigned: number;
  skipped: number;
  initialSent: number;
  reminderSent: number;
  failed: number;
}

interface RoomAttendantInfo {
  id: string;
  firstName: string;
  lastName: string;
  Email: string;
  phoneNo: string | null;
  clientId: string | null;
  smsGateway: { name: string; domain: string } | null;
}

interface BookingInfo {
  clientId: string;
  startDate: Date | null;
  endDate: Date;
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
      return { total: 0, assigned: 0, skipped: 0, initialSent: 0, reminderSent: 0, failed: 0 };
    }

    const clientIds = clients.map((c) => c.id);
    const clientNameMap = new Map(
      clients.map((c) => [c.id, { firstName: c.firstName, lastName: c.lastName }]),
    );

    const bookings = await this.getUpcomingBookings(clientIds, today);
    if (!bookings.length) {
      return { total: 0, assigned: 0, skipped: 0, initialSent: 0, reminderSent: 0, failed: 0 };
    }

    const existingScheduleKeys = await this.getExistingScheduleKeys(today);
    const dedicatedRoomAttendantMap = await this.getDedicatedRoomAttendantMap(clientIds);
    const freeRoomAttendants = await this.getFreeRoomAttendants(clientIds);

    const usedFreeRoomAttendants = new Set<string>();

    let assigned = 0;
    let skipped = 0;
    let initialSent = 0;
    let failed = 0;

    for (const booking of bookings) {
      const assignedDate = this.normalizeDate(booking.endDate);
      const startDate = booking.startDate
        ? this.normalizeDate(booking.startDate)
        : assignedDate;

      const reminderDate = new Date(assignedDate);
      reminderDate.setDate(reminderDate.getDate() - 1);
      reminderDate.setHours(0, 0, 0, 0);

      if (assignedDate < today) continue;

      const scheduleKey = `${booking.clientId}|${this.dateKey(assignedDate)}`;
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
        if (!(await this.isRoomAttendantBusyOnDate(candidate.id, assignedDate))) {
          roomAttendant = candidate;
        } else {
          const fallback = this.findFreeRoomAttendant(
            freeRoomAttendants,
            usedFreeRoomAttendants,
          );
          if (fallback) {
            roomAttendant = fallback;
          }
        }
      } else {
        const candidate = this.findFreeRoomAttendant(
          freeRoomAttendants,
          usedFreeRoomAttendants,
        );
        if (candidate) {
          roomAttendant = candidate;
        }
      }

      if (!roomAttendant) {
        console.log(
          `[AutoAssignRoomAttendant] No roomAttendant available for client ${booking.clientId} on ${assignedDate.toISOString()}`,
        );
        skipped++;
        continue;
      }

      if (await this.isRoomAttendantBusyOnDate(roomAttendant.id, assignedDate)) {
        console.log(
          `[AutoAssignRoomAttendant] RoomAttendant ${roomAttendant.firstName} ${roomAttendant.lastName} already busy on ${assignedDate.toISOString()}`,
        );
        skipped++;
        continue;
      }

      if (!(await this.checkRoomAttendantAvailability(roomAttendant.id, assignedDate))) {
        console.log(
          `[AutoAssignRoomAttendant] RoomAttendant ${roomAttendant.firstName} ${roomAttendant.lastName} not available on ${assignedDate.toISOString()}`,
        );
        skipped++;
        continue;
      }

      usedFreeRoomAttendants.add(roomAttendant.id);

      try {
        const schedule = await roomAttendantTaskScheduleRepository.create({
          client: { connect: { id: booking.clientId } },
          roomAttendant: { connect: { id: roomAttendant.id } },
          assignedDate,
          status: RoomAttendantTaskStatus.ASSIGNED,
        });
        existingScheduleKeys.add(scheduleKey);
        assigned++;

        const record = await this.createHistoryRecord(
          schedule.id,
          schedule.clientId,
          schedule.roomAttendantId,
          roomAttendant,
          NotificationType.Initial,
        );

        if (today >= startDate && startDate < reminderDate) {
          const message = `You have been assigned to clean for ${clientName.firstName} ${clientName.lastName} on ${assignedDate.toLocaleDateString()}.`;
          const sent = await this.sendNotification(record.id, roomAttendant, message);
          if (sent) {
            initialSent++;
          } else {
            failed++;
          }
        }
      } catch (error) {
        console.error(
          `[AutoAssignRoomAttendant] Assignment failed for client ${booking.clientId}:`,
          error,
        );
        failed++;
      }
    }

    const deliveryResult = await this.processNotificationDelivery(today, clientNameMap);

    return {
      total: bookings.length,
      assigned,
      skipped,
      initialSent: initialSent + deliveryResult.initialSent,
      reminderSent: deliveryResult.reminderSent,
      failed: failed + deliveryResult.failed,
    };
  }

  private async createHistoryRecord(
    taskScheduleId: string,
    clientId: string,
    roomAttendantId: string,
    roomAttendant: RoomAttendantInfo,
    notificationType: number,
  ) {
    return notificationHistoryRepository.create({
      clientId,
      roomAttendantId,
      taskSchedule: { connect: { id: taskScheduleId } },
      Email: roomAttendant.Email ?? "",
      firstName: roomAttendant.firstName,
      lastName: roomAttendant.lastName,
      phoneNo: roomAttendant.phoneNo ?? "",
      notificationType,
      emailFailedResult: "",
      smsFailedResult: "",
    });
  }

  private async sendNotification(
    historyId: string,
    roomAttendant: RoomAttendantInfo,
    message: string,
  ): Promise<boolean> {
    if (roomAttendant.phoneNo && roomAttendant.smsGateway) {
      try {
        await smsViaEmailService.send({
          phone: roomAttendant.phoneNo,
          message,
          gatewayName: roomAttendant.smsGateway.name,
        });
        await notificationHistoryRepository.update(historyId, {
          smsSentStatus: SmsSentStatus.Sent,
          notificationDate: new Date(),
        });
        return true;
      } catch (smsError) {
        const errorMsg =
          smsError instanceof Error ? smsError.message : String(smsError);
        console.error(
          `[AutoAssignRoomAttendant] SMS to ${roomAttendant.firstName} failed:`,
          errorMsg,
        );
        await notificationHistoryRepository.update(historyId, {
          smsSentStatus: SmsSentStatus.Failed,
          smsFailedCount: { increment: 1 },
          smsFailedResult: errorMsg,
          notificationDate: new Date(),
        });
        return false;
      }
    }
    const skipMsg = `No phone/gateway configured for ${roomAttendant.firstName} ${roomAttendant.lastName}`;
    console.log(`[AutoAssignRoomAttendant] ${skipMsg}`);
    await notificationHistoryRepository.update(historyId, {
      smsSentStatus: SmsSentStatus.Failed,
      smsFailedCount: { increment: 1 },
      smsFailedResult: skipMsg,
      notificationDate: new Date(),
    });
    return false;
  }

  private async processNotificationDelivery(
    today: Date,
    clientNameMap: Map<string, { firstName: string; lastName: string }>,
  ): Promise<{ initialSent: number; reminderSent: number; failed: number }> {
    let initialSent = 0;
    let reminderSent = 0;
    let failed = 0;

    const schedules = await prisma.roomAttendantTaskSchedule.findMany({
      where: {
        isActive: true,
        isDeleted: false,
        deletedAt: null,
        assignedDate: { gte: today },
      },
      include: {
        client: { select: { id: true, firstName: true, lastName: true } },
        roomAttendant: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            Email: true,
            phoneNo: true,
            smsGateway: { select: { name: true, domain: true } },
          },
        },
        roomAttendantTaskNotificationHistory: {
          where: { isDeleted: false },
        },
      },
    });

    if (!schedules.length) {
      return { initialSent: 0, reminderSent: 0, failed: 0 };
    }

    const scheduleClientIds = [...new Set(schedules.map((s) => s.clientId))];
    const bookingStartDates = await this.getBookingStartDateByEndDateMap(scheduleClientIds);

    for (const schedule of schedules) {
      const clientName = clientNameMap.get(schedule.clientId);
      if (!clientName) continue;

      const bookingKey = `${schedule.clientId}|${this.dateKey(schedule.assignedDate)}`;
      const startDate = bookingStartDates.get(bookingKey) ?? schedule.assignedDate;

      const reminderDate = new Date(schedule.assignedDate);
      reminderDate.setDate(reminderDate.getDate() - 1);
      reminderDate.setHours(0, 0, 0, 0);

      const roomAttendant: RoomAttendantInfo = {
        id: schedule.roomAttendant.id,
        firstName: schedule.roomAttendant.firstName,
        lastName: schedule.roomAttendant.lastName,
        Email: schedule.roomAttendant.Email,
        phoneNo: schedule.roomAttendant.phoneNo,
        clientId: schedule.clientId,
        smsGateway: schedule.roomAttendant.smsGateway,
      };

      const history = schedule.roomAttendantTaskNotificationHistory;
      const initialRecord = history.find(
        (h) => h.notificationType === NotificationType.Initial,
      );
      const reminderRecord = history.find(
        (h) => h.notificationType === NotificationType.Reminder,
      );

      const initialSentSuccess =
        initialRecord?.smsSentStatus === SmsSentStatus.Sent;

      const needsInitial =
        initialRecord == null || initialRecord.smsSentStatus !== SmsSentStatus.Sent;

      const needsReminder =
        reminderRecord == null || reminderRecord.smsSentStatus !== SmsSentStatus.Sent;

      // --- Initial notification ---
      if (today >= this.normalizeDate(startDate) && needsInitial && startDate < reminderDate) {
        const record = initialRecord ??
          await this.createHistoryRecord(
            schedule.id,
            schedule.clientId,
            schedule.roomAttendantId,
            roomAttendant,
            NotificationType.Initial,
          );

        const message = `You have been assigned to clean for ${clientName.firstName} ${clientName.lastName} on ${schedule.assignedDate.toLocaleDateString()}.`;
        const sent = await this.sendNotification(record.id, roomAttendant, message);
        if (sent) initialSent++; else failed++;
      }

      // --- Reminder notification ---
      if (
        initialSentSuccess &&
        needsReminder &&
        today >= this.normalizeDate(reminderDate)
      ) {
        const record = reminderRecord ??
          await this.createHistoryRecord(
            schedule.id,
            schedule.clientId,
            schedule.roomAttendantId,
            roomAttendant,
            NotificationType.Reminder,
          );

        const message = `Reminder: You have cleaning for ${clientName.firstName} ${clientName.lastName} on ${schedule.assignedDate.toLocaleDateString()}.`;
        const sent = await this.sendNotification(record.id, roomAttendant, message);
        if (sent) reminderSent++; else failed++;
      }
    }

    return { initialSent, reminderSent, failed };
  }

  private async getBookingStartDateByEndDateMap(
    clientIds: string[],
  ): Promise<Map<string, Date>> {
    const bookings = await prisma.guestBookingInfo.findMany({
      where: {
        clientId: { in: clientIds },
        endDate: { not: null },
        startDate: { not: null },
        isDeleted: false,
      },
      select: { clientId: true, startDate: true, endDate: true },
      orderBy: { endDate: "asc" },
    });

    const map = new Map<string, Date>();
    for (const b of bookings) {
      if (!b.endDate || !b.startDate) continue;
      const key = `${b.clientId}|${this.dateKey(b.endDate)}`;
      if (!map.has(key)) {
        map.set(key, b.startDate);
      }
    }
    return map;
  }

  private normalizeDate(d: Date): Date {
    const normalized = new Date(d);
    normalized.setHours(0, 0, 0, 0);
    return normalized;
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
        startDate: true,
        endDate: true,
      },
      orderBy: { endDate: "asc" },
    });

    const seen = new Set<string>();
    const unique: BookingInfo[] = [];
    for (const row of rows) {
      if (!row.endDate) continue;
      const key = `${row.clientId}|${this.dateKey(row.endDate)}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push({
          clientId: row.clientId,
          startDate: row.startDate,
          endDate: row.endDate,
        });
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
        Email: true,
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

  private async getFreeRoomAttendants(clientIds: string[]): Promise<RoomAttendantInfo[]> {
    return prisma.roomAttendantProfile.findMany({
      where: {
        clientId: { in: clientIds },
        isDeleted: false,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        Email: true,
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

  private async isRoomAttendantBusyOnDate(
    roomAttendantId: string,
    date: Date,
  ): Promise<boolean> {
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

  private async checkRoomAttendantAvailability(
    roomAttendantId: string,
    date: Date,
  ): Promise<boolean> {
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
