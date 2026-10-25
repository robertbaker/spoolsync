import type { SpoolValues } from "../../core/compare";
import {
  identityKey,
  filamentIdentity,
  metadataKey,
  norm,
  type FilamentIdentity,
} from "./filament-identity";
import { defaultDensity, middle, colorParams } from "./filament-policy";
import type { SpoolmanFilament, SpoolmanVendor } from "./schema";
import type { SpoolmanWriteClient } from "./write-client";

/** Per-apply catalog: resolves vendors and reuses only compatible filament definitions. */
export class FilamentCatalog {
  private readonly vendorsByName: Map<string, SpoolmanVendor>;
  private readonly filamentsByIdentity = new Map<string, Map<number, SpoolmanFilament>>();

  constructor(
    private readonly client: Pick<SpoolmanWriteClient, "createVendor" | "createFilament">,
    vendors: SpoolmanVendor[],
    filaments: SpoolmanFilament[],
  ) {
    this.vendorsByName = new Map(vendors.map((vendor) => [norm(vendor.name), vendor]));
    for (const filament of filaments) this.rememberFilament(filament);
  }

  rememberFilament(filament: SpoolmanFilament): void {
    const key = identityKey(filamentIdentity(filament));
    const bucket = this.filamentsByIdentity.get(key) ?? new Map<number, SpoolmanFilament>();
    bucket.set(filament.id, filament);
    this.filamentsByIdentity.set(key, bucket);
  }
  forgetFilament(filament: SpoolmanFilament): void {
    const key = identityKey(filamentIdentity(filament));
    const bucket = this.filamentsByIdentity.get(key);
    bucket?.delete(filament.id);
    if (!bucket?.size) this.filamentsByIdentity.delete(key);
  }
  async vendorId(name: string | null): Promise<number | null> {
    if (!name?.trim()) return null;
    const existing = this.vendorsByName.get(norm(name));
    if (existing) return existing.id;
    const created: SpoolmanVendor = await this.client.createVendor({ name: name.trim() });
    this.vendorsByName.set(norm(name), created);
    return created.id;
  }

  /** Finds a filament with these attributes, or creates one. */
  async filamentFor(
    values: Pick<
      SpoolValues,
      | "vendor"
      | "material"
      | "name"
      | "colors"
      | "diameter"
      | "density"
      | "upc"
      | "initialWeight"
      | "emptySpoolWeight"
      | "price"
      | "nozzleTempMin"
      | "nozzleTempMax"
      | "bedTempMin"
      | "bedTempMax"
    >,
    direction: "coaxial" | "longitudinal" = "coaxial",
    template?: SpoolmanFilament,
  ): Promise<SpoolmanFilament> {
    const identity: FilamentIdentity = {
      vendorId: await this.vendorId(values.vendor),
      material: values.material,
      name: values.name,
      colors: values.colors,
      colorDirection: values.colors.length > 1 ? direction : null,
      diameter: values.diameter ?? 1.75,
      density: values.density ?? defaultDensity(values.material),
      upc: values.upc,
      nozzleTemp: middle(values.nozzleTempMin, values.nozzleTempMax),
      bedTemp: middle(values.bedTempMin, values.bedTempMax),
    };
    const key = identityKey(identity);
    const existing = Array.from(this.filamentsByIdentity.get(key)?.values() ?? []).find(
      (candidate) =>
        (!template || metadataKey(candidate) === metadataKey(template)) &&
        (values.initialWeight !== null || candidate.weight == null) &&
        (values.price !== null || candidate.price == null) &&
        (values.emptySpoolWeight !== null || candidate.spool_weight == null),
    );
    if (existing) return existing;
    const created = await this.client.createFilament({
      name: values.name,
      vendor_id: identity.vendorId,
      material: values.material,
      density: values.density ?? defaultDensity(values.material),
      diameter: identity.diameter,
      weight: values.initialWeight,
      price: values.price,
      spool_weight: values.emptySpoolWeight,
      article_number: values.upc,
      settings_extruder_temp: identity.nozzleTemp,
      settings_bed_temp: identity.bedTemp,
      ...colorParams(values.colors, direction),
      ...(template
        ? {
            comment: template.comment ?? null,
            external_id: template.external_id ?? null,
            extra: structuredClone(template.extra ?? {}),
          }
        : {}),
    });
    this.rememberFilament(created);
    return created;
  }
}
