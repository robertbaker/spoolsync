import type { LoadResult } from "../../core/model";

export interface BambuddyConnection {
  baseUrl: string;
  apiKey: string;
}
export type BambuddySpool = Record<string, unknown> & {
  id: number;
  material?: string;
};
export type BambuddyLoadResult = LoadResult & {
  source: "bambuddy";
  file?: unknown;
};

/** Body of `POST /api/v1/inventory/spools` and `PATCH /api/v1/inventory/spools/{id}`. */
export type BambuddySpoolPayload = Record<string, string | number | boolean | null>;
