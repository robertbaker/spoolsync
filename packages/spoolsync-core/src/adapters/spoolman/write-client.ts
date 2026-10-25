import type { SpoolmanClient } from "./client";

/** Only the operations required to apply a plan; HTTP transport remains a client concern. */
export interface SpoolmanWriteClient extends Pick<
  SpoolmanClient,
  | "ensureExtraFields"
  | "listVendors"
  | "listFilaments"
  | "listSpools"
  | "createVendor"
  | "createFilament"
  | "updateFilament"
  | "createSpool"
  | "updateSpool"
> {}
