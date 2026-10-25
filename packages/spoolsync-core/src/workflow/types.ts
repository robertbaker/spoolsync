import type { WritableSourceId } from "../core/model";

export interface InventoryExport {
  source: WritableSourceId;
  text: string;
  mediaType: string;
  total: number;
  updated: number;
  created: number;
  warnings: string[];
  /** Set for TigerTag, whose JSON file may contain more records than spools. */
  records?: number;
  alternateFiles?: Array<{
    extension: string;
    mediaType: string;
    text: string;
    label: string;
    warnings?: string[];
  }>;
}
