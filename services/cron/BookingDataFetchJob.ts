import { Prisma } from "@prisma/client";
import { clientBookingDataRepository } from "@/repositories/ClientBookingDataRepository";
import { prisma } from "@/lib/prisma";
import { CRON_CONFIG } from "@/lib/cron/config";

/**
 * Booking Data Fetch Job.
 * Fetches data from all active client booking endpoints and stores the responses.
 * This is a cron job service — separated from normal business services.
 */
export class BookingDataFetchJob {
  private readonly JOB_NAME = "booking-data-fetch";

  /**
   * Execute the job: fetch all active endpoints and save responses.
   */
  async execute(): Promise<{ fetched: number; failed: number; skipped: number }> {
    const endpoints = await prisma.clientBookingEndpoint.findMany({
      where: { isActive: true, deletedAt: null },
      include: { client: { select: { id: true } } },
    });

    let fetched = 0;
    let failed = 0;
    let skipped = 0;

    const results = await Promise.allSettled(
      endpoints.map((endpoint) => this.fetchEndpoint(endpoint)),
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
   * Fetch a single endpoint and save the response.
   */
  private async fetchEndpoint(endpoint: {
    id: string;
    clientId: string;
    url: string;
    name: string;
  }): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), CRON_CONFIG.FETCH_TIMEOUT_MS);

      const response = await fetch(endpoint.url, {
        signal: controller.signal,
        headers: { "User-Agent": "BookingCalendar/1.0" },
      });
      clearTimeout(timeout);

      if (!response.ok) {
        console.warn(
          `[BookingDataFetch] Endpoint "${endpoint.name}" returned ${response.status}`,
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

      // Parse basic booking data from iCal if applicable
      const parsed = this.parseICalData(rawData);

      await clientBookingDataRepository.create({
        endpoint: { connect: { id: endpoint.id } },
        client: { connect: { id: endpoint.clientId } },
        rawData: rawData as unknown as Prisma.InputJsonValue,
        summary: parsed.summary,
        startDate: parsed.startDate,
        endDate: parsed.endDate,
        status: parsed.status,
      });

      return true;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        console.warn(`[BookingDataFetch] Endpoint "${endpoint.name}" timed out`);
      }
      throw error;
    }
  }

  /**
   * Basic iCal parser. Extracts booking summary, dates, and status.
   * For production, consider using a dedicated iCal library.
   */
  private parseICalData(data: unknown): {
    summary: string | null;
    startDate: Date | null;
    endDate: Date | null;
    status: string | null;
  } {
    if (typeof data !== "string") {
      return { summary: null, startDate: null, endDate: null, status: null };
    }

    const summaryMatch = data.match(/SUMMARY:(.*)/m);
    const dtStartMatch = data.match(/DTSTART[;:](.*)/m);
    const dtEndMatch = data.match(/DTEND[;:](.*)/m);
    const statusMatch = data.match(/STATUS:(.*)/m);

    return {
      summary: summaryMatch?.[1]?.trim() ?? null,
      startDate: dtStartMatch ? this.parseICalDate(dtStartMatch[1]) : null,
      endDate: dtEndMatch ? this.parseICalDate(dtEndMatch[1]) : null,
      status: statusMatch?.[1]?.trim()?.toLowerCase() ?? null,
    };
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
}

export const bookingDataFetchJob = new BookingDataFetchJob();
