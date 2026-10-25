import { expect, test } from "bun:test";

import { toggleTheme } from "~/components/starwind/controls/ThemeToggle/themeToggleVariants.ts";

test("an interrupted theme transition still commits the theme and cleans up without rejected chains", async () => {
  const original = document.startViewTransition;
  document.documentElement.setAttribute("data-current-theme", "light");
  document.startViewTransition = ((commit: () => void) => {
    commit();
    return {
      ready: Promise.reject(new DOMException("Transition skipped", "AbortError")),
      finished: Promise.reject(new DOMException("Document hidden", "InvalidStateError")),
      updateCallbackDone: Promise.resolve(),
      skipTransition() {},
    };
  }) as typeof document.startViewTransition;
  try {
    toggleTheme("spoolsync-theme-regression");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.documentElement.getAttribute("data-current-theme")).toBe("dark");
    expect(document.documentElement.hasAttribute("data-view-transition")).toBe(false);
  } finally {
    document.startViewTransition = original;
    localStorage.removeItem("spoolsync-theme-regression");
  }
});
