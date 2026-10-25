/**
 * Theme Utilities
 *
 * Provides theme management functions that work with any storageKey and default mode. Sites pass
 * their own config values from SITE_CONFIG.
 */

import type { ThemeMode } from "../../types/site-config.ts";
export type { ThemeMode };

function escapeForInlineScript(value: string): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/** Apply theme to the document */
export function applyTheme(theme: ThemeMode): void {
  const isDark = theme === "dark";
  const root = document.documentElement;
  const themeValue = isDark ? "dark" : "light";

  root.setAttribute("data-theme", themeValue);
  root.classList.toggle("dark", isDark);
  root.setAttribute("data-current-theme", themeValue);
}

/**
 * Generate an inline script string to prevent FOUC by applying theme immediately. This script runs
 * synchronously before the page renders.
 */
export function createThemeInitScript(storageKey: string, defaultMode: string): string {
  const safeStorageKey = escapeForInlineScript(storageKey);
  const safeDefaultMode = escapeForInlineScript(defaultMode);
  return `(function(){var k=${safeStorageKey},t;try{t=localStorage.getItem(k)}catch{t=null}if(t!=="dark"&&t!=="light"){var d=t==="system"?"system":${safeDefaultMode};t=(d==="dark"||d==="light")?d:(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light")};var r=document.documentElement;r.setAttribute("data-theme",t);r.classList.toggle("dark",t==="dark");r.setAttribute("data-current-theme",t)})()`;
}
