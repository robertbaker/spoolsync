import type { LoadResult } from "../../core/model";

export interface BambuddyConnection {
  baseUrl: string;
  apiKey: string;
}
export type BambuddySpool = Record<string, unknown> & { id: number; material?: string };
export type BambuddyLoadResult = LoadResult & { source: "bambuddy"; file?: unknown };
