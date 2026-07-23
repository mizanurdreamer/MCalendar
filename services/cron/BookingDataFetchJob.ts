import { Prisma } from "@prisma/client";
import { guestBookingInfoRepository } from "@/repositories/GuestBookingInfoRepository";
import { prisma } from "@/lib/prisma";
import { CRON_CONFIG } from "@/lib/cron/config";

/**
 * Booking Data Fetch Job.
 * Fetches data from all active client booking providers and stores the responses.
 * This is a cron job service — separated from normal business services.
 */
export class BookingDataFetchJob {
  /**
   * Execute the job: fetch all active providers and save responses.
   */
  async execute(): Promise<{ fetched: number; failed: number; skipped: number }> {
    const providers = await prisma.clientBookingProvider.findMany({
      where: { isActive: true, deletedAt: null },
    });

    let fetched = 0;
    let failed = 0;
    let skipped = 0;

    const results = await Promise.allSettled(
      providers.map((provider) => this.fetchProvider(provider)),
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        if (result.value) fetched++;
        else skipped++;
      } else {
        failed++;
        console.error(`[BookingDataFetch] Failed:`, result.reason);
      }
    }

    console.log(
      `[BookingDataFetch] Complete: ${fetched} fetched, ${failed} failed, ${skipped} skipped`,
    );

    return { fetched, failed, skipped };
  }

  /**
   * Fetch a single provider and save the response.
   */
  private async fetchProvider(provider: {
    id: string;
    clientId: string;
    url: string;
    name: string;
  }): Promise<boolean> {
    try {
      const response = await fetch(provider.url, {
        headers: { "User-Agent": "BookingCalendar/1.0" },
      });

      if (!response.ok) {
        console.warn(
          `[BookingDataFetch] Provider "${provider.name}" returned ${response.status}`,
        );
        return false;
      }

      const contentType = response.headers.get("content-type") ?? "";
      let rawData: unknown;

      if (contentType.includes("application/json")) {
        rawData = await response.json();
      } else {
        // iCal or other text format
        rawData = await response.text();
      }

      const bookings = this.extractBookings(rawData);
      if (!bookings.length) return false;

      const fetchedAt = new Date();
      const payload = {
        providerName: provider.name,
        payload: rawData,
      } as Prisma.InputJsonValue;
      const payloadHash = await this.hashPayload(payload);
      const fetchData = await guestBookingInfoRepository.upsertFetchData({
        providerId: provider.id,
        clientId: provider.clientId,
        payloadHash,
        rawData: payload,
        fetchedAt,
      });

      await guestBookingInfoRepository.createMany(
        bookings.map((booking) => ({
          providerId: provider.id,
          clientId: provider.clientId,
          fetchDataId: fetchData.id,
          dedupeKey: this.buildDedupeKey(provider.id, booking),
          summary: booking.summary,
          startDate: booking.startDate,
          endDate: booking.endDate,
          status: booking.status,
        })),
      );

      return true;
    } catch (error) {
      throw error;
    }
  }

  private extractBookings(data: unknown): Array<{
    summary: string | null;
    startDate: Date | null;
    endDate: Date | null;
    status: string | null;
  }> {
    if (typeof data === "string") {
      return this.parseICalEvents(data);
    }
    return this.parseJsonEvents(data);
  }

  private parseICalEvents(data: string) {
    const events = data.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/gm) ?? [];
    return events
      .map((entry) => {
        const summaryMatch = entry.match(/SUMMARY:(.*)/m);
        const dtStartMatch = entry.match(/DTSTART(?:;[^:]+)?:(.*)/m);
        const dtEndMatch = entry.match(/DTEND(?:;[^:]+)?:(.*)/m);
        const statusMatch = entry.match(/STATUS:(.*)/m);

        return {
          summary: summaryMatch?.[1]?.trim() ?? null,
          startDate: dtStartMatch ? this.parseICalDate(dtStartMatch[1]) : null,
          endDate: dtEndMatch ? this.parseICalDate(dtEndMatch[1]) : null,
          status: statusMatch?.[1]?.trim()?.toLowerCase() ?? null,
        };
      })
      .filter((item) => item.startDate !== null || item.endDate !== null || item.summary);
  }

  private parseJsonEvents(data: unknown) {
    const list = this.extractJsonArray(data);

    return list
      .map((item) => {
        if (!item || typeof item !== "object") {
          return null;
        }

        const row = item as Record<string, unknown>;
        return {
          summary: this.asOptionalString(row.summary ?? row.title ?? row.guestName),
          startDate: this.asOptionalDate(row.startDate ?? row.start ?? row.checkIn),
          endDate: this.asOptionalDate(row.endDate ?? row.end ?? row.checkOut),
          status: this.asOptionalString(row.status)?.toLowerCase() ?? null,
        };
      })
      .filter((item): item is NonNullable<typeof item> => !!item)
      .filter((item) => item.startDate !== null || item.endDate !== null || item.summary);
  }

  private extractJsonArray(data: unknown): unknown[] {
    if (Array.isArray(data)) return data;
    if (!data || typeof data !== "object") return [];
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj.items)) return obj.items;
    if (Array.isArray(obj.bookings)) return obj.bookings;
    if (Array.isArray(obj.data)) return obj.data;
    return [];
  }

  /**
   * Parse iCal date format (basic support).
   */
  private parseICalDate(dateStr: string): Date | null {
    try {
      // Basic YYYYMMDD or YYYYMMDDTHHmmss format
      const cleaned = dateStr.replace(/[^0-9T]/g, "");
      if (cleaned.length === 8) {
        return new Date(
          parseInt(cleaned.slice(0, 4)),
          parseInt(cleaned.slice(4, 6)) - 1,
          parseInt(cleaned.slice(6, 8)),
        );
      }
      if (cleaned.length >= 15) {
        return new Date(
          parseInt(cleaned.slice(0, 4)),
          parseInt(cleaned.slice(4, 6)) - 1,
          parseInt(cleaned.slice(6, 8)),
          parseInt(cleaned.slice(9, 11)),
          parseInt(cleaned.slice(11, 13)),
          parseInt(cleaned.slice(13, 15)),
        );
      }
      return new Date(dateStr);
    } catch {
      return null;
    }
  }

  private asOptionalString(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }

  private asOptionalDate(value: unknown): Date | null {
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value;
    }
    if (typeof value !== "string" && typeof value !== "number") return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private buildDedupeKey(
    providerId: string,
    booking: {
      summary: string | null;
      startDate: Date | null;
      endDate: Date | null;
      status: string | null;
    },
  ) {
    return [
      providerId,
      booking.summary ?? "",
      booking.status ?? "",
      booking.startDate?.toISOString() ?? "",
      booking.endDate?.toISOString() ?? "",
    ].join("|");
  }

  private async hashPayload(payload: Prisma.InputJsonValue) {
    const input = new TextEncoder().encode(JSON.stringify(payload));
    const digest = await crypto.subtle.digest("SHA-256", input);
    const bytes = Array.from(new Uint8Array(digest));
    return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
  }
}

export const bookingDataFetchJob = new BookingDataFetchJob();
