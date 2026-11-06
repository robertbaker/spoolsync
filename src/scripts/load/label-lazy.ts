import type { wireLabelPrinting } from "./label-sheet";

type Inputs = Parameters<typeof wireLabelPrinting>[0];

/**
 * Label printing (the dialog, the QR encoder, the print layout) is only needed once someone asks to
 * print, so it loads on the first click on "Print labels" instead of with the Load page. The
 * trigger still follows what is loaded, and the click that caused the load is replayed once the
 * real handler is attached, so it is never lost.
 */
export function wireLazyLabelPrinting(inputs: Inputs): { update(): void } {
  const trigger = document.getElementById("print-labels");
  let wired: { update(): void } | null = null;

  const load = () => {
    import("./label-sheet").then(
      (module) => {
        wired = module.wireLabelPrinting(inputs);
        wired.update();
        // The module attached its own click handler to the trigger; use it for this click.
        trigger?.click();
      },
      // A failed download (offline, say) leaves the button working: the next click tries again.
      () => trigger?.addEventListener("click", load, { once: true }),
    );
  };
  trigger?.addEventListener("click", load, { once: true });

  return {
    update() {
      if (wired) wired.update();
      else if (trigger) trigger.hidden = inputs.results.size === 0;
    },
  };
}
