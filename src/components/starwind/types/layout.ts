export const GRID_PATTERNS = {
  "1-2": "grid-cols-1 md:grid-cols-2",
  "1-3": "grid-cols-1 md:grid-cols-3",
  "1-2-3": "grid-cols-1 md:grid-cols-2 lg:grid-cols-3",
  "1-2-4": "grid-cols-1 md:grid-cols-2 lg:grid-cols-4",
  "1-3-6": "grid-cols-1 md:grid-cols-3 lg:grid-cols-6",
} as const;

export type GridPattern = keyof typeof GRID_PATTERNS;
