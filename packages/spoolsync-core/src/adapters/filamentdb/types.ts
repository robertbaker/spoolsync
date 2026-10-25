import type { LoadResult } from "../../core/model";

/**
 * FilamentDB spools (`GET /api/spools`, or the per-spool JSON files inside its ZIP export). Each
 * record is one spool keyed by `serial`. A single spool object, a list, or `{ spools: [...] }` all
 * load; the export is a list that `POST /api/spools` accepts one entry at a time.
 */
export type FilamentDbSpool = Record<string, unknown>;
export type FilamentDbLoadResult = LoadResult & { source: "filamentdb"; file: FilamentDbSpool[] };
