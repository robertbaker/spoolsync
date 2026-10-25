import { h } from "../dom";

export function badge(text: string, tone: "success" | "neutral" | "warning"): HTMLElement {
  const color =
    tone === "success"
      ? "bg-success/15 text-success-text"
      : tone === "warning"
        ? "bg-warning/15 text-warning-text"
        : "bg-muted text-muted-foreground";
  return h("span", { class: `rounded-full px-2.5 py-0.5 text-xs font-medium ${color}` }, text);
}

// Password visibility toggles
export const wirePasswordToggle = (btnId: string, inputId: string) => {
  const btn = document.getElementById(btnId);
  const input = document.getElementById(inputId) as HTMLInputElement | null;
  if (!btn || !input) return;
  btn.addEventListener("click", () => {
    const isPassword = input.type === "password";
    input.type = isPassword ? "text" : "password";
    btn.textContent = isPassword ? "Hide" : "Show";
    btn.setAttribute("aria-label", isPassword ? "Hide value" : "Show value");
  });
};

export function loadInventoriesLink(): HTMLElement {
  return h(
    "p",
    { class: "mt-2" },
    h("a", { href: "/load", class: "font-medium underline" }, "Load inventories →"),
  );
}
