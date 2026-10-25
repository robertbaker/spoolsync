import type { LoadResult } from "../../core/model";

export type ThreeDfpLoadResult = LoadResult & {
  source: "threeDfp";
  file: unknown;
  format: "csv" | "json";
};
