import type { PlannedCreate, PlannedUpdate } from "../../core/compare";
import { toNumber, toText } from "../../core/normalize";
import type { AdapterRuntime } from "../shared/runtime";
import { exportWeights } from "../shared/weights";
import type { FilameterDoc } from "./types";

/**
 * FilaMeter has no unknown weight: its v2 migration turns a missing or zero `total_weight` into
 * 1000 g, and its schema rejects null. Unknown weights are therefore written as that full 1000 g
 * spool, said out loud, rather than as a null that fails on import.
 *
 * Known limitation: nothing in the record can mark that 1000 g as a placeholder. FilaMeter
 * validates documents with a strict Joi schema (no extra fields), and the only free-text field,
 * `comments`, is the user's own note, which must not carry a marker. So a spool written this way
 * reloads as a measured 1000/1000 g, and the warning tells the user so; review it before syncing
 * weights from it to other services.
 */
const UNKNOWN_TOTAL = 1000;
const unknownWeightsWarning = (label: string) =>
  `${label}: weights are unknown and FilaMeter cannot store that, so the spool was written as a full ${UNKNOWN_TOTAL} g spool. It will read back as a measured ${UNKNOWN_TOTAL} g, so do not sync its weight to other services.`;

export function updateDoc(
  existing: FilameterDoc,
  change: PlannedUpdate,
  warnings: string[],
): FilameterDoc {
  const doc: FilameterDoc = {};
  Object.assign(doc, existing);
  const initialWeight = change.changes.find((item) => item.field === "initialWeight");
  const remainingWeight = change.changes.find((item) => item.field === "remainingWeight");
  if (initialWeight || remainingWeight) {
    const initial = initialWeight ? toNumber(initialWeight.to) : change.spool.initialWeight;
    const remaining = remainingWeight ? toNumber(remainingWeight.to) : change.spool.remainingWeight;
    if (initial === null && remaining === null) {
      doc.total_weight = UNKNOWN_TOTAL;
      doc.used_weight = 0;
      if ("calc_weight" in doc) doc.calc_weight = UNKNOWN_TOTAL;
      warnings.push(unknownWeightsWarning(`FilaMeter ${change.spool.sourceId}`));
    } else {
      const weights = exportWeights(initial, remaining, `FilaMeter ${change.spool.sourceId}`);
      doc.total_weight = weights.total;
      doc.used_weight = weights.used;
      // calc_weight is derived on read upstream; a copy saved in the file would go stale.
      if ("calc_weight" in doc) doc.calc_weight = Math.max(0, weights.total - weights.used);
      warnings.push(...weights.warnings);
    }
  }
  for (const item of change.changes) {
    if (item.field === "vendor") doc.brand = toText(item.to) ?? "";
    // FilaMeter's schema requires a non-empty material and filament name, so emptied values are kept.
    if (item.field === "material" || item.field === "name") {
      const text = toText(item.to);
      if (text) doc[item.field === "material" ? "material" : "filament"] = text;
      else
        warnings.push(
          `FilaMeter ${change.spool.sourceId}: FilaMeter requires a ${item.field === "material" ? "material" : "filament name"}, so it was left unchanged.`,
        );
    }
    if (item.field === "colors")
      doc.color = Array.isArray(item.to) && item.to[0] ? `#${item.to[0]}` : "";
    if (item.field === "colors" && Array.isArray(item.to) && item.to.length > 1)
      warnings.push(
        `FilaMeter ${change.spool.sourceId}: only the primary color is exported; this format stores one color per spool.`,
      );
    if (item.field === "location") doc.location = toText(item.to) ?? "";
    if (item.field === "price") {
      // Upstream defaults a missing price to 0, so an emptied price is omitted rather than written.
      const price = toNumber(item.to);
      if (price === null) delete doc.price;
      else doc.price = price;
    }
    if (item.field === "comment") doc.comments = toText(item.to) ?? "";
  }
  return doc;
}

export function createDoc(
  change: PlannedCreate,
  warnings: string[],
  runtime: AdapterRuntime,
): FilameterDoc {
  if (change.values.colors.length > 1)
    warnings.push(
      `FilaMeter ${change.values.name ?? change.groupId}: only the primary color is exported; this format stores one color per spool.`,
    );
  const label = `FilaMeter ${change.values.name ?? change.groupId}`;
  const unknown = change.values.initialWeight === null && change.values.remainingWeight === null;
  const weights = unknown
    ? {
        total: UNKNOWN_TOTAL,
        used: 0,
        warnings: [unknownWeightsWarning(label)],
      }
    : exportWeights(change.values.initialWeight, change.values.remainingWeight, label);
  warnings.push(...weights.warnings);
  if (!change.values.name)
    warnings.push(
      `${label}: FilaMeter requires a filament name, so it is named "Imported Filament".`,
    );
  const doc: FilameterDoc = {
    _id: runtime.randomUUID(),
    filament: change.values.name || "Imported Filament",
    material: change.values.material ?? "PLA",
    brand: change.values.vendor ?? "",
    color: change.values.colors[0] ? `#${change.values.colors[0]}` : "",
    total_weight: weights.total,
    used_weight: weights.used,
    location: change.values.location ?? "",
    comments: change.values.comment ?? "",
  };
  if (change.values.price !== null) doc.price = change.values.price;
  return doc;
}
