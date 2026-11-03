import type { SourceId } from "@spoolsync/core/core/model";
import { SERVICE_WEB } from "~/lib/services";

/**
 * What each service is called in the file picker and where its export comes from. The Load page
 * panels and the first-run setup guide both read this; the text lives in the services registry
 * (`src/lib/services.ts`) so there is one place to edit it.
 */
export interface SourceGuide {
  /** The kind of file the service exports, shown beside its name. */
  kind: string;
  /** Where to find the export, in a sentence or two. */
  how: string;
}

export const SOURCE_GUIDES: Record<SourceId, SourceGuide> = SERVICE_WEB;
