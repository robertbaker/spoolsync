export type JsonRecord = Record<string, any>;

export type CliOptions = {
  timeout: number;
  includeArchived: boolean;
  token?: string;
  url?: string;
  input?: string;
  output?: string;
  help?: boolean;
};

export type ReferenceRow = {
  id: number;
  name?: string;
  label?: string;
  material_type?: string;
  [key: string]: unknown;
};

export type SpoolmanVendor = string | { name?: string; empty_spool_weight?: number | null } | null;

export type SpoolmanFilament = {
  id?: number | string;
  name?: string | null;
  material?: string | null;
  vendor?: SpoolmanVendor;
  color_hex?: string | null;
  color?: string | null;
  multi_color_hexes?: string | null;
  weight?: number | null;
  diameter?: number | null;
  density?: number | null;
  price?: number | null;
  nozzle_temp_min?: number | null;
  nozzle_temp_max?: number | null;
  bed_temp_min?: number | null;
  bed_temp_max?: number | null;
  drying_temp?: number | null;
  drying_time?: number | null;
  settings_extruder_temp?: number | null;
  settings_bed_temp?: number | null;
  article_number?: string | null;
  spool_weight?: number | null;
  extra?: JsonRecord | null;
};

export type SpoolmanSpool = {
  id?: number | string;
  name?: string | null;
  filament?: SpoolmanFilament | null;
  initial_weight?: number | null;
  remaining_weight?: number | null;
  used_weight?: number | null;
  spool_weight?: number | null;
  location?: string | null;
  lot_nr?: string | null;
  comment?: string | null;
  price?: number | null;
  archived?: boolean;
};

export type ParsedColor = { r: number; g: number; b: number; a: number; hex: string };

export type TtagRecord = JsonRecord & {
  uid: string;
  id_brand: number;
  brand: string;
  id_material: number;
  weight_available: number;
};

export type TtagFile = {
  format: "tigertag";
  kind: "ttag";
  version: 1;
  exportedAt: string;
  exportedBy: null;
  source: "spoolman";
  records: TtagRecord[];
};
