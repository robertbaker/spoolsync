import type { LoadResult } from "../../core/model";

export type FilameterDoc = Record<string, unknown> & {
  _id?: string;
  filament?: unknown;
  material?: unknown;
};
export type FilameterBackup = {
  regular: FilameterDoc[];
  local?: FilameterDoc[];
  [key: string]: unknown;
};
export type FilameterLoadResult = LoadResult & {
  source: "filameter";
  file: FilameterBackup | FilameterDoc[];
};
