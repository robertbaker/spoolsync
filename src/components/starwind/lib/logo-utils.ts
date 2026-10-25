import { existsSync } from "node:fs";
import { join } from "node:path";

/** Normalizes a logo name candidate by removing extension and whitespace. */
export const normalizeLogoName = (name: string): string => {
  return name.replace(/\.svg$/i, "").trim();
};

/** Generates alternative names for a logo (e.g., replacing dots with dashes/underscores). */
export const getLogoCandidates = (value: string): string[] => {
  if (!value) return [];
  const normalized = normalizeLogoName(value);

  return Array.from(
    new Set(
      [
        normalized,
        normalized.replace(/:/g, "-"),
        normalized.replace(/\./g, "-"),
        normalized.replace(/\./g, "_"),
        normalized.replace(/-long$/i, "_long"),
        normalized.replace(/_long$/i, "-long"),
        normalized.replace(/_l$/i, "_long"),
      ].filter(Boolean),
    ),
  );
};

/** Resolves a logo file path from provided roots. */
export const resolveLogoPath = (
  logoName: string,
  logoRoots: string[],
): { path: string; name: string } | undefined => {
  const candidates = getLogoCandidates(logoName);

  for (const candidate of candidates) {
    for (const root of logoRoots) {
      const filePath = join(root, `${candidate}.svg`);
      if (existsSync(filePath)) {
        return { path: filePath, name: candidate };
      }
    }
  }

  return undefined;
};
