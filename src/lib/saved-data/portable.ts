import { isProviderId, sanitizeReferenceSettings } from "@spoolsync/core/core/reference";
import { isLowStockPercent } from "@spoolsync/core/core/stock";

import { sanitizeFileHistory } from "../browser/storage/file-history";
import { sanitizeHealthHistory } from "../browser/storage/health-history";
import { sanitizeWatchlist } from "../browser/storage/insights";
import { sanitizeStockHistory } from "../browser/storage/stock-history";
import { isLocale } from "../i18n";
import { sanitizeColumnMaps } from "../import-mapper/store";
import { LABEL_PRESETS, LABEL_SELECTIONS } from "../labels/labels";
import { isPaletteId } from "../palettes";
import { sanitizePreferences } from "../preferences";
import { sanitizeViews } from "../saved-views";
import { isDefaultColumns, sanitizeColumns } from "../table-columns";
import { sanitizeDisplaySettings } from "../units";
import { sanitizeTares } from "../weigh-in";
import { SAVED_GROUPS } from "./groups";

/** The rules for what may move between browsers, shared by settings export and backups. */

export const EXPORT_FORMAT = "spoolsync-settings";
export const EXPORT_VERSION = 1;
/** The groups that are safe and useful to carry over. Connections hold credentials and stay put. */
const PORTABLE_GROUPS = ["preferences", "files", "watchlist", "history", "answers"] as const;

const CHART_VIEWS = ["service", "material", "brand", "color", "location"];
const COST_VIEWS = ["service", "material", "vendor"];

const isStringList = (value: unknown, maxItems = 500, maxItemLength = 200): value is string[] =>
  Array.isArray(value) &&
  value.length <= maxItems &&
  value.every((item) => typeof item === "string" && item.length <= maxItemLength);

/** Whether a stored value has the shape its key expects, so an imported file cannot plant junk. */
export function isValidEntry(key: string, text: string): boolean {
  try {
    switch (key) {
      case "spoolsync:prefs": {
        const clean = sanitizePreferences(JSON.parse(text));
        return Object.keys(clean).length > 0;
      }
      case "spoolsync:palette":
        return isPaletteId(text) && text !== "filament";
      case "spoolsync:file-history":
        return Object.keys(sanitizeFileHistory(JSON.parse(text))).length > 0;
      case "spoolsync:watchlist":
        return sanitizeWatchlist(JSON.parse(text)).length > 0;
      case "spoolsync:low-stock-percent":
        return isLowStockPercent(Number(text));
      case "spoolsync:display": {
        const clean = sanitizeDisplaySettings(JSON.parse(text));
        return clean.weightUnit !== "g" || clean.currency !== "";
      }
      case "spoolsync:setup-dismissed":
        return text === "1";
      case "spoolsync:sidebar":
        return text === "collapsed" || text === "expanded";
      case "spoolsync:weigh-in":
        return Object.keys(sanitizeTares(JSON.parse(text))).length > 0;
      case "spoolsync:open-panels":
      case "spoolsync:recent-sources":
      case "spoolsync:palette-recent":
        return isStringList(JSON.parse(text), 50, 100);
      case "spoolsync:chart-view":
        return CHART_VIEWS.includes(text);
      case "spoolsync:chart-table-open":
      case "spoolsync:trend-table-open":
      case "spoolsync:cost-table-open":
        return text === "0" || text === "1";
      case "spoolsync:cost-view":
        return COST_VIEWS.includes(text);
      case "spoolsync:stock-history":
        return Object.keys(sanitizeStockHistory(JSON.parse(text))).length > 0;
      case "spoolsync:health-history":
        return sanitizeHealthHistory(JSON.parse(text)).length > 0;
      case "spoolsync:language":
        return isLocale(text) && text !== "en";
      case "spoolsync:table-columns": {
        const value: unknown = JSON.parse(text);
        return Array.isArray(value) && !isDefaultColumns(sanitizeColumns(value));
      }
      case "spoolsync:column-maps":
        return Object.keys(sanitizeColumnMaps(JSON.parse(text))).length > 0;
      case "spoolsync:label-options": {
        const value = JSON.parse(text) as { preset?: unknown; selection?: unknown };
        return (
          LABEL_PRESETS.some((preset) => preset.id === value.preset) &&
          LABEL_SELECTIONS.some((selection) => selection.id === value.selection)
        );
      }
      case "spoolsync:saved-views":
        return sanitizeViews(JSON.parse(text)).length > 0;
      case "spoolsync:cleanup-settings":
        return isStringList((JSON.parse(text) as { enabled?: unknown }).enabled, 50, 100);
      case "spoolsync:reference-settings": {
        const value = JSON.parse(text) as { providerId?: unknown; policy?: unknown };
        return (
          isProviderId(value.providerId) &&
          sanitizeReferenceSettings(value).providerId === value.providerId
        );
      }
      case "spoolsync:match-decisions": {
        const value = JSON.parse(text) as { confirmed?: unknown; rejected?: unknown };
        return isStringList(value.confirmed, 2000, 200) && isStringList(value.rejected, 2000, 200);
      }
      default:
        return false;
    }
  } catch {
    return false;
  }
}

export const portableKeys = () =>
  SAVED_GROUPS.filter((group) => (PORTABLE_GROUPS as readonly string[]).includes(group.id)).flatMap(
    (group) => group.keys,
  );

/** Bounds that keep a hostile or damaged file from filling browser storage. */
export const BACKUP_LIMITS = { entries: 60, entryBytes: 1_000_000, totalBytes: 4_000_000 } as const;
