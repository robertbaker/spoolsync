/**
 * Theme Toggle Helpers
 *
 * Provides client-side helpers for managing light/dark theme state, toggling themes, persisting
 * preferences, and reacting to system changes.
 *
 * @module components/ui/ThemeToggle/themeToggleVariants
 */

import { applyTheme as applyThemeUtil } from "../../lib/theme/themeUtils.ts";
import type { ThemePreference } from "../../types/site-config.ts";

export type ThemeToggleVariant = "ghost" | "default" | "outline";
export type ThemeToggleSize = "sm" | "md" | "lg";

export const DEFAULT_STORAGE_KEY = "color-theme";
export const DEFAULT_THEME_MODE: ThemePreference = "system";
export const VIEW_TRANSITION_STATE_ATTR = "data-view-transition";
export const THEME_VIEW_TRANSITION_STATE = "theme-toggle";

declare global {
  interface Window {
    showMatrixAnimation?: () => void;
  }
}

/**
 * Resolves active storage key from document element or default fallback.
 *
 * @param storageKey Optional override for the storage key.
 * @returns The resolved storage key string.
 */
export function getStorageKey(storageKey?: string): string {
  if (storageKey) return storageKey;
  if (typeof document !== "undefined" && document.documentElement?.dataset?.themeStorageKey) {
    return document.documentElement.dataset.themeStorageKey;
  }
  return DEFAULT_STORAGE_KEY;
}

/**
 * Resolves default theme mode from document element or default fallback.
 *
 * @param defaultMode Optional override for the default mode.
 * @returns The resolved default mode.
 */
export function getDefaultMode(defaultMode?: string): string {
  if (defaultMode) return defaultMode;
  if (typeof document !== "undefined" && document.documentElement?.dataset?.themeDefaultMode) {
    return document.documentElement.dataset.themeDefaultMode;
  }
  return DEFAULT_THEME_MODE;
}

/**
 * Resolves the active theme ("dark" or "light") given a preferred mode and fallback.
 *
 * @param theme The mode to resolve ("dark", "light", "system", etc.).
 * @param defaultMode Fallback mode when theme is not explicit.
 * @returns "dark" or "light".
 */
export function resolveTheme(theme?: string | null, defaultMode?: string): "dark" | "light" {
  if (theme === "dark" || theme === "light") {
    return theme;
  }
  const resolvedDefault = theme === "system" ? "system" : getDefaultMode(defaultMode);
  if (resolvedDefault === "dark" || resolvedDefault === "light") {
    return resolvedDefault;
  }
  if (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-color-scheme: dark)").matches
  ) {
    return "dark";
  }
  return "light";
}

/**
 * Retrieves the current theme from localStorage or system preference.
 *
 * @param storageKey Optional storage key.
 * @param defaultMode Optional default mode.
 * @returns "dark" or "light".
 */
export function getTheme(storageKey?: string, defaultMode?: string): "dark" | "light" {
  const key = getStorageKey(storageKey);
  let stored: string | null = null;
  try {
    if (typeof localStorage !== "undefined") {
      stored = localStorage.getItem(key);
    }
  } catch {
    stored = null;
  }
  return resolveTheme(stored, defaultMode);
}

/**
 * Applies the given theme to the document and synchronizes input toggles.
 *
 * @param theme "dark" | "light" | "system".
 */
export function applyThemePreference(theme: string): void {
  const resolved = resolveTheme(theme);
  applyThemeUtil(resolved);
  syncThemeInputs(resolved);
}

/**
 * Syncs any <input name="theme"> or <input data-theme-switch> checkboxes.
 *
 * @param theme "dark" | "light".
 */
function syncThemeInputs(theme: "dark" | "light"): void {
  if (typeof document === "undefined") return;
  const isDark = theme === "dark";
  document.querySelectorAll<HTMLElement>("[data-theme-toggle]").forEach((button) => {
    button.setAttribute("aria-pressed", String(isDark));
    button.setAttribute("data-state", isDark ? "on" : "off");
    button.querySelectorAll("[data-theme-icon]").forEach((icon) => {
      icon.setAttribute("data-ready", "");
    });
  });
  document
    .querySelectorAll<HTMLInputElement>('input[name="theme"], input[data-theme-switch]')
    .forEach((input) => {
      input.checked = isDark;
    });
}

/**
 * Sets and persists the theme preference in localStorage and DOM.
 *
 * @param theme The theme to set.
 * @param storageKey Optional storage key.
 */
export function setTheme(theme: string, storageKey?: string): void {
  const key = getStorageKey(storageKey);
  window.showMatrixAnimation?.();
  applyThemePreference(theme);
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(key, theme);
    }
  } catch {
    // Ignore storage errors in restricted contexts
  }
}

/**
 * Toggles between dark and light themes, using document.startViewTransition if supported.
 *
 * @param storageKey Optional storage key.
 * @param defaultMode Optional default mode.
 */
export function toggleTheme(storageKey?: string, defaultMode?: string): void {
  if (typeof document === "undefined") return;
  const currentAttr = document.documentElement.getAttribute("data-current-theme");
  const current =
    currentAttr === "dark" || currentAttr === "light"
      ? currentAttr
      : getTheme(storageKey, defaultMode);
  const next = current === "dark" ? "light" : "dark";

  const commit = () => setTheme(next, storageKey);

  if (typeof document.startViewTransition === "function") {
    const root = document.documentElement;
    root.setAttribute(VIEW_TRANSITION_STATE_ATTR, THEME_VIEW_TRANSITION_STATE);
    const transition = document.startViewTransition(commit);
    transition.ready?.catch?.(() => {});
    void transition.finished
      ?.catch?.(() => {})
      ?.finally?.(() => {
        root.removeAttribute(VIEW_TRANSITION_STATE_ATTR);
      });
  } else {
    commit();
  }
}

let themeAbortController: AbortController | undefined;

/**
 * Initializes theme toggle buttons, inputs, and system preference listeners. Safe to invoke
 * repeatedly across Astro page transitions.
 */
export function initThemeToggle(): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  themeAbortController?.abort();
  themeAbortController = new AbortController();
  const { signal } = themeAbortController;

  // Sync DOM with current preference
  applyThemePreference(getTheme());

  // Attach button click listeners
  document.querySelectorAll<HTMLElement>("[data-theme-toggle]").forEach((btn) => {
    btn.addEventListener(
      "click",
      (e) => {
        e.preventDefault();
        if (!btn.matches(":disabled, [aria-disabled='true']")) toggleTheme();
      },
      { signal },
    );
  });

  // Attach input toggle listeners
  document
    .querySelectorAll<HTMLInputElement>('input[name="theme"], input[data-theme-switch]')
    .forEach((input) => {
      input.addEventListener(
        "change",
        (e) => {
          const target = e.target as HTMLInputElement | null;
          if (target) {
            setTheme(target.checked ? "dark" : "light");
          }
        },
        { signal },
      );
    });

  // Listen for OS system theme changes
  if (window.matchMedia) {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const key = getStorageKey();

    const handleSystemChange = (e: MediaQueryListEvent) => {
      let preference: string | null = null;
      try {
        preference = localStorage.getItem(key);
      } catch {
        preference = null;
      }
      const mode =
        preference === "system" || preference === "dark" || preference === "light"
          ? preference
          : getDefaultMode();
      if (mode !== "dark" && mode !== "light") {
        applyThemePreference(e.matches ? "dark" : "light");
      }
    };

    mediaQuery.addEventListener("change", handleSystemChange, { signal });
  }

  window.addEventListener(
    "storage",
    (event) => {
      if (event.key === getStorageKey() || event.key === null) applyThemePreference(getTheme());
    },
    { signal },
  );
}
