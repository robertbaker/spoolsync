import type { LoadResult } from "../../core/model";

export interface PrintStudioConnection {
  baseUrl: string;
  /** The trusted operator id PrintStudio's API expects in `x-operator-id`. */
  operatorId: string;
}

/** A PrintStudio `MaterialLot`, kept whole so unknown fields survive. */
export type PrintStudioLot = Record<string, unknown> & {
  id: string;
  family?: string;
  unit?: string;
  sourceSystem?: string;
};

export type PrintStudioLoadResult = LoadResult & {
  source: "printstudio";
  file?: unknown;
};

/** Body of `POST /api/materials` and `PUT /api/materials/{id}` (a local lot's details). */
export type PrintStudioLotPayload = Record<string, unknown>;
