export const PROPERTIES = [
  "All properties",
  "Marina Loft 2B",
  "Dolores Duplex",
  "Fern Grove Studio",
  "Alder House",
  "Juniper Flats 4A",
] as const;

export type PropertyFilter = (typeof PROPERTIES)[number];
