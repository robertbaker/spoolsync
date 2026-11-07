import type { SpoolValues } from "../../core/compare";
import type { ComparableField } from "../../core/model";
import type { AdapterRuntime } from "../shared/runtime";
import { MATERIAL_TYPES, materialNote, setNotes } from "./material-notes";

const hash = (hex: string) => `#${hex}`;
const zeroIfNull = (value: number | null) => value ?? 0;

/** Writes one common field into a Spoolio filament. Fields Spoolio does not store are ignored. */
export function setField(
  target: Record<string, unknown>,
  field: ComparableField,
  value: unknown,
): void {
  switch (field) {
    case "vendor":
      target["brand"] = value ?? "";
      break;
    case "material": {
      const key = String(value);
      const mapped = Object.hasOwn(MATERIAL_TYPES, key) ? MATERIAL_TYPES[key] : undefined;
      target["type"] = mapped ?? value ?? "";
      setNotes(target, target["notes"], mapped ? key : undefined);
      break;
    }
    case "name":
      target["colorName"] = value ?? "";
      break;
    case "colors": {
      const colors = (value as string[]) ?? [];
      target["colorHex"] = colors[0] ? hash(colors[0]) : "";
      if (colors.length > 1) {
        target["extraColors"] = colors.slice(1).map(hash);
        target["colorMode"] = "dual";
      } else {
        delete target["extraColors"];
        delete target["colorMode"];
      }
      break;
    }
    case "diameter":
      target["diameter"] = value ?? 1.75;
      break;
    case "nozzleTempMin":
    case "nozzleTempMax":
    case "bedTempMin":
    case "bedTempMax":
      target[field] = zeroIfNull(value as number | null);
      break;
    case "initialWeight":
      target["weightTotal"] = zeroIfNull(value as number | null);
      break;
    case "remainingWeight":
      target["weightRemaining"] = value;
      break;
    case "emptySpoolWeight":
      if (value == null) delete target["spoolWeight"];
      else target["spoolWeight"] = value;
      break;
    case "price":
      target["price"] = value;
      break;
    case "purchasedOn":
      target["purchaseDate"] = value ?? "";
      break;
    case "lotNr":
      target["batchNumber"] = value ?? "";
      break;
    case "finish":
      // "Standard" is Spoolio's own "no particular finish". `abrasive` is never touched.
      target["finish"] = value ?? "Standard";
      break;
    case "comment":
      setNotes(target, value, materialNote(target["notes"]));
      break;
    default:
      break;
  }
}

export function newFilament(values: SpoolValues, runtime: AdapterRuntime): Record<string, unknown> {
  const filament: Record<string, unknown> = {
    id: runtime.randomUUID(),
    type: values.material ?? "PLA",
    brand: values.vendor ?? "Generic",
    price: 0,
    finish: "Standard",
    abrasive: false,
    colorHex: "",
    diameter: 1.75,
    colorName: "",
    bedTempMin: 0,
    bedTempMax: 0,
    nozzleTempMin: 0,
    nozzleTempMax: 0,
    weightTotal: 0,
    weightRemaining: 0,
    purchaseDate: "",
  };
  for (const [field, value] of Object.entries(values)) {
    if ((field === "material" || field === "vendor") && value == null) continue;
    setField(filament, field as ComparableField, value);
  }
  return filament;
}
