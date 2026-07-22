/**
 * Client-facing view models. Dates arrive as ISO strings over JSON, so these
 * intentionally use `string` for timestamps.
 */
import type { Paginated } from "@/models";
import type { Role } from "@/models/role";
export type { Role } from "@/models/role";

export type UserView = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  smsGatewayId?: string | null;
  smsGatewayName?: string | null;
  phone: string | null;
  role: Role;
  isActive: boolean;
  companyName?: string | null;
  primaryContact?: string | null;
  portfolioSize?: number | null;
  timezone?: string | null;
  serviceArea?: string | null;
  hourlyRate?: number | null;
  rating?: number | null;
  createdAt: string;
};

export type BookingEndpointView = {
  id: string;
  clientId: string;
  name: string;
  url: string;
  isActive: boolean;
  createdAt: string;
};

export type SmsGatewayView = {
  id: string;
  name: string;
  domain: string;
  isActive: boolean;
  createdAt: string;
};

export type CleanerTaskScheduleView = {
  id: string;
  clientId: string;
  clientName: string;
  clientEmail: string;
  cleanerId: string;
  cleanerName: string;
  cleanerEmail: string;
  assignedDate: string;
  status: CleaningStatus;
  isActive: boolean;
  createdAt: string;
};

export type CleanerAvailabilityView = {
  id: string;
  cleanerId: string;
  cleanerName: string;
  cleanerEmail: string;
  fromDate: string;
  toDate: string | null;
  note: string | null;
  isActive: boolean;
  createdAt: string;
};

export type CalendarEventView = {
  id: string;
  title: string;
  start?: string;
  end?: string;
  allDay: boolean;
  classNames: string[];
  extendedProps: {
    property: string;
    status: string;
  };
};

export type UpcomingCleaningView = {
  day: string;
  month: string;
  property: string;
  note: string;
  status: string | null;
};

export type CalendarDataView = {
  properties: string[];
  events: CalendarEventView[];
  upcomingCleanings: UpcomingCleaningView[];
};

export type CleaningStatus =
  | "ASSIGNED"
  | "CONFIRMED"
  | "IN_PROGRESS"
  | "DONE"
  | "CANCELLED";

export type CleanerCalendarEventView = {
  id: string;
  kind: "booking" | "availability";
  title: string;
  start: string;
  end?: string;
  allDay: boolean;
  property: string | null;
  clientName: string | null;
  cleaningStatus: CleaningStatus | null;
};

export type CleanerCalendarAssignmentView = {
  id: string;
  clientId: string;
  clientName: string;
  assignedDate: string;
  status: CleaningStatus;
};

export type CleanerCalendarDataView = {
  events: CleanerCalendarEventView[];
  assignments: CleanerCalendarAssignmentView[];
};

export type { Paginated };
