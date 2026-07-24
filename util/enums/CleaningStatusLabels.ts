import { RoomAttendantTaskStatus } from "@/util/enums/RoomAttendantTaskStatus";
import type { CleaningStatus } from "@/models/view";

export const STATUS_LABEL: Record<CleaningStatus, string> = {
  [RoomAttendantTaskStatus.ASSIGNED]: "Assigned",
  [RoomAttendantTaskStatus.CONFIRMED]: "Confirmed",
  [RoomAttendantTaskStatus.IN_PROGRESS]: "In progress",
  [RoomAttendantTaskStatus.DONE]: "Done",
  [RoomAttendantTaskStatus.CANCELLED]: "Cancelled",
};

export const STATUS_CLASS: Record<CleaningStatus, string> = {
  [RoomAttendantTaskStatus.ASSIGNED]: "evt-assigned",
  [RoomAttendantTaskStatus.CONFIRMED]: "evt-confirmed",
  [RoomAttendantTaskStatus.IN_PROGRESS]: "evt-inprogress",
  [RoomAttendantTaskStatus.DONE]: "evt-done",
  [RoomAttendantTaskStatus.CANCELLED]: "evt-cancelled",
};
