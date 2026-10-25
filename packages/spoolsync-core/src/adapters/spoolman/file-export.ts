import type { PlannedChange } from "../../core/compare";
import type { ComparableField, LoadResult } from "../../core/model";
import { spoolstockLotNr } from "../../core/normalize";
import { FILAMENT_FIELDS } from "./filament-policy";
import { newSpool, setField, type Spool } from "./file-records";
import { encodeExtras } from "./schema";
import { linkExtras } from "./spool-links";

export interface SpoolmanFileExport {
  json: string;
  updated: number;
  created: number;
  total: number;
  warnings: string[];
}

/**
 * Every loaded Spoolman spool in API shape, with changes applied, plus new spools. New spools have
 * negative ids, since only Spoolman can assign real ones; they still link on the next run through
 * the Spoolstock lot number and extras.
 */
export function exportSpoolmanJson(
  loaded: LoadResult,
  changes: PlannedChange[],
): SpoolmanFileExport {
  const spools = loaded.spools.map((spool) => structuredClone(spool.raw) as Spool);
  const byId = new Map(spools.map((spool) => [String(spool["id"]), spool]));
  let updated = 0;
  let created = 0;
  const warnings: string[] = [];
  const filamentUses = new Map<unknown, number>();
  const vendorUses = new Map<unknown, number>();
  let nextNew = -1;
  for (const spool of spools) {
    const filamentId = spool.filament["id"];
    const vendorId = spool.filament.vendor?.["id"];
    filamentUses.set(filamentId, (filamentUses.get(filamentId) ?? 0) + 1);
    if (vendorId !== undefined) vendorUses.set(vendorId, (vendorUses.get(vendorId) ?? 0) + 1);
    for (const id of [spool["id"], filamentId, vendorId])
      if (typeof id === "number") nextNew = Math.min(nextNew, id - 1);
  }

  for (const change of changes) {
    if (change.source !== "spoolman") continue;
    let target: Spool;
    if (change.kind === "update") {
      const existing = byId.get(change.spool.sourceId);
      if (!existing)
        throw new Error(
          `Spoolman spool ${change.spool.sourceId} is missing. Reload the inventory and try again.`,
        );
      target = existing;
      // A file must not contain different filament definitions under one shared ID.
      if (
        (filamentUses.get(target.filament["id"]) ?? 0) > 1 &&
        change.changes.some((item) => FILAMENT_FIELDS.has(item.field))
      ) {
        target.filament["id"] = nextNew--;
        if (Object.hasOwn(target, "filament_id")) target["filament_id"] = target.filament["id"];
      }
      if (
        target.filament.vendor &&
        (vendorUses.get(target.filament.vendor["id"]) ?? 0) > 1 &&
        change.changes.some((item) => item.field === "vendor" && item.to !== null)
      ) {
        target.filament.vendor["id"] = nextNew--;
        if (Object.hasOwn(target.filament, "vendor_id"))
          target.filament["vendor_id"] = target.filament.vendor["id"];
      }
      const vendorChange = change.changes.find((item) => item.field === "vendor");
      if (!target.filament.vendor && vendorChange && vendorChange.to != null)
        target.filament.vendor = { id: nextNew--, name: vendorChange.to };
      for (const { field, to } of change.changes) setField(target, field, to);
      if (
        change.changes.some((item) => item.field === "initialWeight") &&
        !change.changes.some((item) => item.field === "remainingWeight")
      )
        target["remaining_weight"] = change.spool.remainingWeight;
      const inherited: Partial<Record<ComparableField, unknown>> = {
        initialWeight: target.filament["weight"],
        emptySpoolWeight:
          target.filament["spool_weight"] ?? target.filament.vendor?.["empty_spool_weight"],
        price: target.filament["price"],
      };
      const labels = {
        initialWeight: "initial weight",
        emptySpoolWeight: "empty spool weight",
        price: "price",
      };
      for (const item of change.changes) {
        if (item.to === null && inherited[item.field] != null) {
          const field = item.field as keyof typeof labels;
          warnings.push(
            `Spoolman ${change.spool.sourceId}: cleared ${labels[field]} will inherit ${String(inherited[field])} from the filament or vendor; Spoolman cannot keep this value unknown while an inherited value exists.`,
          );
        }
      }
      updated++;
    } else {
      target = newSpool(nextNew--, change.values);
      spools.push(target);
      created++;
    }
    const { spoolstockShortId } = change.links;
    target.extra = {
      ...target.extra,
      ...encodeExtras(linkExtras(change.links)),
    };
    if (spoolstockShortId && !target["lot_nr"])
      target["lot_nr"] = spoolstockLotNr(spoolstockShortId);
    const changingWeights =
      change.kind === "create" ||
      change.changes.some(
        (item) => item.field === "initialWeight" || item.field === "remainingWeight",
      );
    const initial = target["initial_weight"] ?? target.filament["weight"];
    const remaining = target["remaining_weight"];
    if (changingWeights) {
      if (
        [initial, remaining].some(
          (value) => typeof value === "number" && (!Number.isFinite(value) || value < 0),
        )
      )
        throw new Error(
          "Spoolman weights must be non-negative numbers. Resolve the weights before exporting.",
        );
      if (typeof initial === "number" && typeof remaining === "number" && remaining > initial)
        throw new Error(
          "Spoolman remaining weight cannot exceed initial weight. Resolve the weights before exporting.",
        );
    }
    // Reconcile after all fields, independent of the resolution's property order.
    if (typeof initial === "number" && typeof remaining === "number") {
      target["used_weight"] = Math.max(0, initial - remaining);
    }
  }
  return {
    json: `${JSON.stringify(spools, null, 2)}\n`,
    updated,
    created,
    total: spools.length,
    warnings,
  };
}
