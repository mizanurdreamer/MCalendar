/**
 * Client-facing view models. Dates arrive as ISO strings over JSON, so these
 * intentionally use `string` for timestamps.
 */
import type { Paginated } from "@/models";
import type { Role } from "@/models/role";
export type { Role } from "@/models/role";
import { RoomAttendantTaskStatus } from "@/util/enums/RoomAttendantTaskStatus";
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
  clientId?: string | null;
  clientName?: string | null;
  clientProfileId?: string | null;
  createdAt: string;
};

export type BookingProviderView = {
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

export type RoomAttendantTaskScheduleView = {
  id: string;
  clientId: string;
  clientName: string;
  clientEmail: string;
  roomAttendantId: string;
  roomAttendantName: string;
  roomAttendantEmail: string;
  assignedDate: string;
  status: CleaningStatus;
  isActive: boolean;
  createdAt: string;
};

export type RoomAttendantAvailabilityView = {
  id: string;
  clientId: string;
  clientName: string;
  roomAttendantId: string;
  roomAttendantName: string;
  roomAttendantEmail: string;
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

export type CleaningStatus = RoomAttendantTaskStatus;

export type RoomAttendantCalendarEventView = {
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

export type RoomAttendantCalendarAssignmentView = {
  id: string;
  clientId: string;
  clientName: string;
  assignedDate: string;
  status: CleaningStatus;
};

export type RoomAttendantCalendarDataView = {
  events: RoomAttendantCalendarEventView[];
  assignments: RoomAttendantCalendarAssignmentView[];
};

export type { Paginated };
