import { local, read, write } from "~/lib/browser/storage/access";

import { showToast } from "./dom";

/** The running version last seen on a page load. */
export const SEEN_KEY = "spoolsync:last-seen-version";
/** The version the changelog was last opened at, so "new since" survives the update toast. */
export const READ_KEY = "spoolsync:changelog-read";

/**
 * Says so once, the first time the page loads after the version changed. A first-ever visit just
 * records the version, so nobody is told about an "update" they never had. Kept apart from the
 * changelog dialog so every page can run it without loading the dialog.
 */
export function announceUpdate(current: string): void {
  if (!current) return;
  const seen = read(local, SEEN_KEY);
  if (seen === current) return;
  write(local, SEEN_KEY, current);
  // The version they had before the update is the baseline for "new since you last looked".
  if (seen && read(local, READ_KEY) === null) write(local, READ_KEY, seen);
  if (seen)
    showToast(
      `SpoolSync updated to v${current}. Open the changelog in the sidebar to see what's new.`,
      "info",
      9000,
    );
}
