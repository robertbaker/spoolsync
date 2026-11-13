import { inventoryFromLots, lotsFrom } from "./map";
import type { PrintStudioLoadResult } from "./types";

export function loadPrintStudioFile(text: string): PrintStudioLoadResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("This is not valid PrintStudio JSON.");
  }
  const lots = lotsFrom(parsed);
  return { ...inventoryFromLots(lots), file: lots, origin: "file" };
}
