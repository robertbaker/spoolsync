import type { PlannedCreate, PlannedUpdate } from "../../core/compare";
import { toNumber, toText } from "../../core/normalize";
import type { AdapterRuntime } from "../shared/runtime";
import { exportWeights } from "../shared/weights";
import type { FilameterDoc } from "./types";

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
      // Both weights unknown: keep them unknown rather than writing a 0 g spool.
      doc.total_weight = null;
      doc.used_weight = 0;
      if ("calc_weight" in doc) doc.calc_weight = null;
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
    if (item.field === "material") doc.material = toText(item.to) ?? "";
    if (item.field === "name") doc.filament = toText(item.to) ?? "";
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
        total: null,
        used: 0,
        warnings: [`${label}: weights are unknown, so they were left blank.`],
      }
    : exportWeights(change.values.initialWeight, change.values.remainingWeight, label);
  warnings.push(...weights.warnings);
  const doc: FilameterDoc = {
    _id: runtime.randomUUID(),
    filament: change.values.name ?? "",
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
