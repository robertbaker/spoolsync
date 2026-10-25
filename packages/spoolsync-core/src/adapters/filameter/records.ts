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
    const weights = exportWeights(
      initialWeight ? toNumber(initialWeight.to) : toNumber(doc.total_weight),
      remainingWeight ? toNumber(remainingWeight.to) : change.spool.remainingWeight,
      `FilaMeter ${change.spool.sourceId}`,
    );
    doc.total_weight = weights.total;
    doc.used_weight = weights.used;
    warnings.push(...weights.warnings);
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
    if (item.field === "price") doc.price = toNumber(item.to) ?? 0;
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
  const weights = exportWeights(
    change.values.initialWeight,
    change.values.remainingWeight,
    `FilaMeter ${change.values.name ?? change.groupId}`,
  );
  warnings.push(...weights.warnings);
  const doc: FilameterDoc = {
    _id: runtime.randomUUID(),
    filament: change.values.name ?? "",
    material: change.values.material ?? "PLA",
    brand: change.values.vendor ?? "",
    color: change.values.colors[0] ? `#${change.values.colors[0]}` : "",
    total_weight: weights.total,
    used_weight: weights.used,
    price: change.values.price ?? 0,
    location: change.values.location ?? "",
    comments: change.values.comment ?? "",
  };
  return doc;
}
