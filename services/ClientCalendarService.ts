import type { ActorContext } from "@/models";
import type { CalendarDataView, CalendarEventView } from "@/models/view";
import { guestBookingInfoRepository } from "@/repositories/GuestBookingInfoRepository";
import { roomAttendantTaskScheduleRepository } from "@/repositories/RoomAttendantTaskScheduleRepository";
import { prisma } from "@/util/prisma";
import { NotFoundError } from "@/util/errors";

const STATUS_CLASS: Record<string, string> = {
  confirmed: "evt-blue",
  booked: "evt-blue",
  reserved: "evt-blue",
  checked_in: "evt-green",
  "checked-in": "evt-green",
  checkedin: "evt-green",
  pending: "evt-amber",
  inquiry: "evt-amber",
  provisional: "evt-amber",
  checked_out: "evt-neutral",
  "checked-out": "evt-neutral",
  checkedout: "evt-neutral",
  cancelled: "evt-red",
  canceled: "evt-red",
};

type CalendarRow = Awaited<
  ReturnType<typeof guestBookingInfoRepository.listForClientCalendar>
>[number];

export class ClientCalendarService {
  async getCalendarData(actor: ActorContext): Promise<CalendarDataView> {
    const clientProfile = await prisma.clientProfile.findUnique({
      where: { userId: actor.userId },
      select: { id: true },
    });
    if (!clientProfile) throw new NotFoundError("Client profile not found");

    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const to = new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59, 999);

    const rows = await guestBookingInfoRepository.listForClientCalendar({
      clientId: clientProfile.id,
      from,
      to,
    });

    const latestRows = this.keepLatestRows(rows);
    const properties = Array.from(
      new Set(latestRows.map((row) => row.provider?.name?.trim()).filter(Boolean)),
    ) as string[];

    const bookingEvents = latestRows
      .map((row) => this.toCalendarEvent(row))
      .filter((item): item is CalendarEventView => item !== null);

    // Cleaning assignments the client created for their room-attendants.
    const schedules = await roomAttendantTaskScheduleRepository.findActiveForClient(clientProfile.id);
    const cleaningEvents: CalendarEventView[] = schedules.map((s) => ({
      id: `cleaning:${s.id}`,
      title: `Cleaning · ${s.roomAttendant.firstName} ${s.roomAttendant.lastName}`,
      start: s.assignedDate.toISOString(),
      end: undefined,
      allDay: true,
      classNames: ["evt-cleaning"],
      extendedProps: {
        property: "Assigned cleaning",
        status: String(s.status ?? 0),
      },
    }));

    const events = [...bookingEvents, ...cleaningEvents];

    const upcomingCleanings = latestRows
      .filter((row) => row.endDate)
      .sort((a, b) => (a.endDate?.getTime() ?? 0) - (b.endDate?.getTime() ?? 0))
      .slice(0, 8)
      .map((row) => this.toUpcomingCleaning(row));

    return {
      properties: ["All properties", ...properties],
      events,
      upcomingCleanings,
    };
  }

  private keepLatestRows(rows: CalendarRow[]): CalendarRow[] {
    const byKey = new Map<string, CalendarRow>();

    for (const row of rows) {
      const key = [
        row.providerId,
        row.summary ?? "",
        row.startDate?.toISOString() ?? "",
        row.endDate?.toISOString() ?? "",
      ].join("|");
      if (!byKey.has(key)) {
        byKey.set(key, row);
      }
    }

    return Array.from(byKey.values());
  }

  private toCalendarEvent(row: CalendarRow): CalendarEventView | null {
    if (!row.startDate && !row.endDate) return null;
    const property = row.provider?.name ?? "Property";
    const title = row.summary?.trim() || property;
    const status = this.normalizeStatus(row.status);

    return {
      id: row.id,
      title,
      start: row.startDate?.toISOString() ?? row.endDate?.toISOString(),
      end: row.endDate?.toISOString(),
      allDay: true,
      classNames: ["evt-booking", STATUS_CLASS[status] ?? "evt-blue"],
      extendedProps: {
        property,
        status,
      },
    };
  }

  private toUpcomingCleaning(row: CalendarRow) {
    const checkout = row.endDate as Date;
    const property = row.provider?.name ?? "Property";
    const title = row.summary?.trim() || "Guest";
    const status = this.normalizeStatus(row.status);

    return {
      day: String(checkout.getDate()).padStart(2, "0"),
      month: checkout.toLocaleString("en-US", { month: "short" }).toUpperCase(),
      property,
      note: `after ${title} checks out`,
      status,
    };
  }

  private normalizeStatus(status: string | null): string {
    if (!status) return "confirmed";
    return status.trim().toLowerCase().replace(/\s+/g, "_");
  }
}

export const clientCalendarService = new ClientCalendarService();
