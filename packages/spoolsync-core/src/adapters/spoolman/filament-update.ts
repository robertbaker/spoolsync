import type { PlannedUpdate, SpoolValues } from "../../core/compare";
import type { FilamentCatalog } from "./filament-catalog";
import { filamentIdentity } from "./filament-identity";
import { FILAMENT_FIELDS, colorParams } from "./filament-policy";
import type { FilamentParameters, SpoolParameters, SpoolmanSpool } from "./schema";
import type { SpoolmanWriteClient } from "./write-client";

export async function applyFilamentChanges(
  change: PlannedUpdate,
  current: SpoolmanSpool,
  patch: Partial<SpoolParameters>,
  shared: boolean,
  client: Pick<SpoolmanWriteClient, "updateFilament">,
  catalog: FilamentCatalog,
): Promise<string> {
  const filamentChanges = change.changes.filter((c) => FILAMENT_FIELDS.has(c.field));
  let filamentNote = "";
  if (filamentChanges.length) {
    const target = Object.fromEntries(
      filamentChanges.map((c) => [c.field, c.to]),
    ) as Partial<SpoolValues>;
    if (shared) {
      const base = filamentIdentity(current.filament);
      const filament = await catalog.filamentFor(
        {
          vendor:
            target.vendor !== undefined ? target.vendor : (current.filament.vendor?.name ?? null),
          material: target.material !== undefined ? target.material : base.material,
          name: target.name !== undefined ? target.name : base.name,
          colors: target.colors ?? base.colors,
          diameter: target.diameter !== undefined ? target.diameter : base.diameter,
          density:
            target.density !== undefined ? target.density : (current.filament.density ?? null),
          upc: target.upc !== undefined ? target.upc : (current.filament.article_number ?? null),
          initialWeight: current.filament.weight ?? null,
          emptySpoolWeight: current.filament.spool_weight ?? null,
          price: current.filament.price ?? null,
          nozzleTempMin: current.filament.settings_extruder_temp ?? null,
          nozzleTempMax: current.filament.settings_extruder_temp ?? null,
          bedTempMin: current.filament.settings_bed_temp ?? null,
          bedTempMax: current.filament.settings_bed_temp ?? null,
        },
        current.filament.multi_color_direction === "longitudinal" ? "longitudinal" : "coaxial",
        current.filament,
      );
      if (filament.id !== current.filament.id) {
        (patch as SpoolParameters).filament_id = filament.id;
        // Moving to a matching filament must not change values the spool previously inherited.
        if (!("price" in patch) && current.price == null && current.filament.price != null)
          patch.price = current.filament.price;
        if (
          !("initial_weight" in patch) &&
          current.initial_weight == null &&
          current.filament.weight != null
        )
          patch.initial_weight = current.filament.weight;
        const emptyWeight =
          current.filament.spool_weight ?? current.filament.vendor?.empty_spool_weight;
        if (!("spool_weight" in patch) && current.spool_weight == null && emptyWeight != null)
          patch.spool_weight = emptyWeight;
        filamentNote = ` (moved to filament #${filament.id}, since #${current.filament.id} is shared)`;
      }
    } else {
      const filamentPatch: Partial<FilamentParameters> = {};
      if ("vendor" in target)
        filamentPatch.vendor_id = await catalog.vendorId(target.vendor ?? null);
      if ("material" in target) filamentPatch.material = target.material ?? null;
      if ("name" in target) filamentPatch.name = target.name ?? null;
      if (target.colors)
        Object.assign(
          filamentPatch,
          colorParams(
            target.colors,
            current.filament.multi_color_direction === "longitudinal" ? "longitudinal" : "coaxial",
          ),
        );
      if (target.diameter != null) filamentPatch.diameter = target.diameter;
      if (target.density != null) filamentPatch.density = target.density;
      if ("upc" in target) filamentPatch.article_number = target.upc ?? null;
      const updated = await client.updateFilament(current.filament.id, filamentPatch);
      catalog.forgetFilament(current.filament);
      catalog.rememberFilament(updated);
      current.filament = updated;
    }
  }

  return filamentNote;
}
