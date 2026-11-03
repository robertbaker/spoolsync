import type { LoadResult } from "@spoolsync/core/core/model";
import { loadInventoryFile } from "@spoolsync/core/workflow";

/**
 * A small invented inventory in two writable services, so a first-time visitor can see matching,
 * conflicts, and apply without exporting anything. Two spools differ in remaining weight, two pairs
 * look alike without sharing an ID (so they are suggested), and each service has one spool the
 * other lacks.
 */
const spoolio = {
  version: 1,
  filaments: [
    {
      id: "sample-spoolio-1",
      type: "PLA",
      brand: "Prusament",
      colorName: "Galaxy Black",
      colorHex: "#1A1A1A",
      diameter: 1.75,
      weightTotal: 1000,
      weightRemaining: 640,
    },
    {
      id: "sample-spoolio-2",
      type: "PETG",
      brand: "Prusament",
      colorName: "Orange",
      colorHex: "#F26B21",
      diameter: 1.75,
      weightTotal: 1000,
      weightRemaining: 820,
    },
    {
      id: "sample-spoolio-3",
      type: "PLA",
      brand: "Polymaker",
      colorName: "Teal",
      colorHex: "#1F9E9A",
      diameter: 1.75,
      weightTotal: 1000,
      weightRemaining: 300,
    },
    {
      id: "sample-spoolio-4",
      type: "PLA",
      brand: "eSun",
      colorName: "Silk Gold",
      colorHex: "#D4AF37",
      diameter: 1.75,
      weightTotal: 1000,
      weightRemaining: 900,
    },
  ],
};

const filameter = {
  regular: [
    {
      _id: "sample-filameter-1",
      filament: "Galaxy Black",
      material: "PLA",
      brand: "Prusament",
      color: "#1A1A1A",
      total_weight: 1000,
      used_weight: 400,
    },
    {
      _id: "sample-filameter-2",
      filament: "Orange",
      material: "PETG",
      brand: "Prusament",
      color: "#F26B21",
      total_weight: 1000,
      used_weight: 180,
    },
    {
      _id: "sample-filameter-3",
      filament: "Silk Gold",
      material: "PLA",
      brand: "eSun",
      color: "#D4AF37",
      total_weight: 1000,
      used_weight: 100,
    },
    {
      _id: "sample-filameter-4",
      filament: "Signal Red",
      material: "PLA",
      brand: "Elegoo",
      color: "#D62828",
      total_weight: 1000,
      used_weight: 0,
    },
  ],
};

export async function sampleInventories(): Promise<LoadResult[]> {
  return [
    await loadInventoryFile("spoolio", JSON.stringify(spoolio)),
    await loadInventoryFile("filameter", JSON.stringify(filameter)),
  ];
}
