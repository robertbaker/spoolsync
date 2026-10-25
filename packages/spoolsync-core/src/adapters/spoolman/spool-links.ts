import type { CrossIds } from "../../core/model";

export function linkExtras(links: CrossIds): Record<string, string | undefined> {
  return {
    spoolstock_short_id: links.spoolstockShortId,
    spoolsync_spoolio_id: links.spoolioId,
    spoolsync_tigertag_uid: links.tigertagUid,
  };
}
