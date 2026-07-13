export type UpcomingCleaningDto = {
  day: string;
  property: string;
  note: string;
};

export const UPCOMING_CLEANINGS: UpcomingCleaningDto[] = [
  { day: "08", property: "Fern Grove Studio", note: "after Demario checks out - Priya 12:30" },
  { day: "09", property: "Dolores Duplex", note: "after Michele checks out - Ken 11:30" },
  { day: "12", property: "Marina Loft 2B", note: "after Mercy checks out - Rosa 11:00" },
  { day: "13", property: "Juniper Flats 4A", note: "after Kieanna checks out - unassigned" },
  { day: "17", property: "Alder House", note: "after Ravi checks out - Jamal 10:30" },
];
