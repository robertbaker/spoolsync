import type { CommonSpool, SourceId } from "@spoolsync/core/core/model";
import { SOURCE_LABELS } from "@spoolsync/core/core/model";

import { h, notice, showToast } from "../dom";

export function swatches(colors: string[]): HTMLElement {
  return h(
    "span",
    { class: "inline-flex gap-1 align-middle" },
    ...colors.slice(0, 4).map((color) => {
      const dot = h("span", {
        class: "filament-swatch inline-block size-3.5 rounded-full border",
        title: `#${color}`,
      });
      dot.style.backgroundColor = `#${color}`;
      return dot;
    }),
  );
}

export function spoolTitle(spool: CommonSpool): string {
  return [spool.vendor, spool.material, spool.name].filter(Boolean).join(" ") || "Unnamed spool";
}

export function sourceTag(source: SourceId, id?: string): HTMLElement {
  return h(
    "span",
    { class: "rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground" },
    SOURCE_LABELS[source],
    id ? ` ${id}` : "",
  );
}

export function button(
  label: string,
  onClick: () => void,
  variant: "primary" | "outline" = "outline",
  attrs: Record<string, string> = {},
): HTMLButtonElement {
  const classes =
    variant === "primary"
      ? "rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
      : "rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50";
  const element = h("button", { type: "button", class: classes, ...attrs }, label);
  element.addEventListener("click", onClick);
  return element;
}

export function download(filename: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = h("a", { href: url, download: filename });
  document.body.append(link);
  link.click();
  link.remove();
  showToast(`Downloaded ${filename}`, "success");
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function reportExportError(status: HTMLElement, error: unknown): void {
  status.replaceChildren(
    notice(
      "error",
      "Could not export inventory",
      h("p", { class: "mt-1" }, error instanceof Error ? error.message : String(error)),
    ),
  );
}
