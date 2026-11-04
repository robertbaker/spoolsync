import type { WritableSourceId } from "../core/model";

export interface InventoryExport {
  source: WritableSourceId;
  /** The file as text. When the primary file is binary (see `bytes`), a text form of the same data. */
  text: string;
  mediaType: string;
  /** Set when the primary file is binary, such as FilamentDB's ZIP; it is the file to save. */
  bytes?: Uint8Array;
  /** File extension of a binary primary file, without the dot. */
  extension?: string;
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
