import type { CommonSpool } from "@spoolsync/core/core/model";
import { isRunningLow, type LowStockRule } from "@spoolsync/core/core/stock";

import { encodeQr, type QrCode } from "./qr";

/** Which spools get a label. "filtered" is what the loaded-spools table currently shows. */
export type LabelSelection = "all" | "filtered" | "low";

export const LABEL_SELECTIONS: ReadonlyArray<{ id: LabelSelection; label: string }> = [
  { id: "all", label: "All loaded spools" },
  { id: "filtered", label: "Spools shown in the table" },
  { id: "low", label: "Running low" },
];

export interface LabelPreset {
  id: string;
  label: string;
  widthMm: number;
  heightMm: number;
  /** Edge of the QR code, including its quiet zone. */
  qrMm: number;
}

export const LABEL_PRESETS: readonly LabelPreset[] = [
  { id: "small", label: "Small, 50 × 30 mm", widthMm: 50, heightMm: 30, qrMm: 22 },
  { id: "standard", label: "Standard, 70 × 40 mm", widthMm: 70, heightMm: 40, qrMm: 30 },
  { id: "large", label: "Large, 100 × 60 mm", widthMm: 100, heightMm: 60, qrMm: 44 },
];

export const DEFAULT_LABEL_PRESET = "standard";

export function labelPreset(id: string | null | undefined): LabelPreset {
  return LABEL_PRESETS.find((preset) => preset.id === id) ?? LABEL_PRESETS[1]!;
}

/**
 * What a label's QR code holds: the service and the spool's id in that service (`spoolman:12`). No
 * names, weights, URLs, or credentials, so a scanned label reveals nothing by itself.
 */
export function qrPayload(spool: Pick<CommonSpool, "source" | "sourceId">): string {
  return `${spool.source}:${spool.sourceId}`;
}

/** Splits a payload back into its service and id, or `null` when it is not one of ours. */
export function parseQrPayload(text: string): { source: string; sourceId: string } | null {
  const index = text.indexOf(":");
  if (index <= 0 || index === text.length - 1) return null;
  return { source: text.slice(0, index), sourceId: text.slice(index + 1) };
}

export interface SelectionOptions {
  mode: LabelSelection;
  /** The spools the table shows, used for "filtered". */
  visible: readonly CommonSpool[];
  rule: LowStockRule;
  /** Groups of records that are the same spool; when given, only one label is made per group. */
  linked?: ReadonlyArray<{ members: readonly CommonSpool[] }>;
}

/** The spools to label, in loaded order, once each when linked groups are supplied. */
export function selectLabelSpools(
  all: readonly CommonSpool[],
  options: SelectionOptions,
): CommonSpool[] {
  let chosen: readonly CommonSpool[];
  if (options.mode === "filtered") chosen = options.visible;
  else if (options.mode === "low")
    chosen = all.filter((spool) => isRunningLow(spool, options.rule));
  else chosen = all;
  const { linked } = options;
  if (!linked) return [...chosen];
  const groupOf = new Map<CommonSpool, number>();
  linked.forEach((group, index) => group.members.forEach((member) => groupOf.set(member, index)));
  const seen = new Set<number>();
  return chosen.filter((spool) => {
    const group = groupOf.get(spool);
    if (group === undefined) return true;
    if (seen.has(group)) return false;
    seen.add(group);
    return true;
  });
}

export interface Label {
  spool: CommonSpool;
  swatch: string[];
  brand: string;
  material: string;
  color: string;
  /** "320 / 1000 g"; unknown weights show as "?". */
  weight: string;
  payload: string;
  /** `null` when the payload does not fit a version 10 code. */
  qr: QrCode | null;
}

const grams = (value: number | null) => (value === null ? "?" : String(Math.round(value)));

export function buildLabel(spool: CommonSpool): Label {
  const payload = qrPayload(spool);
  return {
    spool,
    swatch: spool.colors.slice(0, 4),
    brand: spool.vendor?.trim() || "Unknown brand",
    material: spool.material?.trim() || "Unknown material",
    color: spool.name?.trim() || (spool.colors[0] ? `#${spool.colors[0]}` : "No color"),
    weight: `${grams(spool.remainingWeight)} / ${grams(spool.initialWeight)} g`,
    payload,
    qr: encodeQr(payload),
  };
}

/** Labels fill sheets in rows; this is how many fit across and down on A4 and Letter with margins. */
export function labelsPerPage(
  preset: LabelPreset,
  pageMm: { width: number; height: number },
): number {
  const margin = 10;
  const across = Math.floor((pageMm.width - margin * 2) / preset.widthMm);
  const down = Math.floor((pageMm.height - margin * 2) / preset.heightMm);
  return Math.max(1, across) * Math.max(1, down);
}
