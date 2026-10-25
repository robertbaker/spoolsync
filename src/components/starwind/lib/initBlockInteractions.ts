/**
 * Lightweight interaction runtime for shared product blocks.
 *
 * Generic application UI remains owned by Starwind UI v3. This module provides only the behavior
 * required by application-owned, higher-level blocks and uses native DOM APIs without a third-party
 * client runtime.
 */

import { generateId } from "./id";
import { initNativeDatatables } from "./nativeDatatable";

type RuntimeRoot = Document | HTMLElement;

export interface BlockInteractionOptions {
  root?: RuntimeRoot;
}
export type SharedBlockInteractionOptions = BlockInteractionOptions;

const cleanupByRoot = new WeakMap<RuntimeRoot, () => void>();
const overlayTriggerByTarget = new WeakMap<HTMLElement, HTMLElement>();
const openedOverlays = new WeakMap<RuntimeRoot, Set<HTMLElement>>();
const scrollLocks = new WeakMap<Document, { overlays: Set<HTMLElement>; wasLocked: boolean }>();

function isDisabled(element: HTMLElement): boolean {
  return (
    element.matches(":disabled, [disabled], [aria-disabled='true']") ||
    Boolean(element.closest("[inert]"))
  );
}

function ownerDocument(root: RuntimeRoot): Document {
  return root.nodeType === 9 ? (root as Document) : (root.ownerDocument ?? document);
}

function query(root: RuntimeRoot, selector: string): HTMLElement | null {
  try {
    return root.querySelector<HTMLElement>(selector);
  } catch {
    return null;
  }
}

function queryAll(root: RuntimeRoot, selector: string): HTMLElement[] {
  try {
    return [
      ...(root instanceof HTMLElement && root.matches(selector) ? [root] : []),
      ...root.querySelectorAll<HTMLElement>(selector),
    ];
  } catch {
    return [];
  }
}

function closest(target: EventTarget | null, selector: string): HTMLElement | null {
  return target instanceof Element ? target.closest<HTMLElement>(selector) : null;
}

function parseConfig(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function resolveTarget(
  root: RuntimeRoot,
  control: HTMLElement,
  attribute: string,
): HTMLElement | null {
  const selector = control.getAttribute(attribute);
  return selector ? query(root, selector) : null;
}

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => {
    if (
      isDisabled(element) ||
      element.tabIndex < 0 ||
      element.closest('[hidden], .hidden, [inert], [aria-hidden="true"]')
    )
      return false;
    for (let parent: HTMLElement | null = element; parent; parent = parent.parentElement) {
      const style = parent.ownerDocument.defaultView?.getComputedStyle(parent);
      if (style?.display === "none" || style?.visibility === "hidden") return false;
      if (parent === container) break;
    }
    return true;
  });
}

function setOverlayOpen(root: RuntimeRoot, overlay: HTMLElement, open: boolean): void {
  const document = ownerDocument(root);
  const dialog = overlay instanceof HTMLDialogElement ? overlay : null;
  const active = openedOverlays.get(root) ?? new Set<HTMLElement>();
  const lock = scrollLocks.get(document) ?? {
    overlays: new Set<HTMLElement>(),
    wasLocked: document.body.classList.contains("overflow-hidden"),
  };
  if (open) {
    active.add(overlay);
    lock.overlays.add(overlay);
    openedOverlays.set(root, active);
    scrollLocks.set(document, lock);
  } else {
    active.delete(overlay);
    lock.overlays.delete(overlay);
  }

  if (dialog) {
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  } else {
    overlay.hidden = !open;
    overlay.classList.toggle("hidden", !open);
    overlay.classList.toggle("overlay-open", open);
    overlay.setAttribute("aria-hidden", open ? "false" : "true");
  }

  const selector = overlay.id ? `#${CSS.escape(overlay.id)}` : null;
  if (selector) {
    queryAll(root, `[data-r5-overlay="${selector}"]`).forEach((trigger) => {
      trigger.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }

  document.body.classList.toggle("overflow-hidden", lock.overlays.size > 0 || lock.wasLocked);
  if (lock.overlays.size === 0) scrollLocks.delete(document);

  if (open) {
    const first = focusableElements(overlay)[0];
    if (first) first.focus();
    else {
      if (!overlay.hasAttribute("tabindex")) overlay.tabIndex = -1;
      overlay.focus();
    }
  } else {
    overlayTriggerByTarget.get(overlay)?.focus();
    overlayTriggerByTarget.delete(overlay);
  }
}

function toggleOverlay(root: RuntimeRoot, trigger: HTMLElement, returnTarget = trigger): void {
  const overlay = resolveTarget(root, trigger, "data-r5-overlay");
  if (!overlay) return;
  const open =
    overlay instanceof HTMLDialogElement
      ? !overlay.open
      : overlay.hidden !== false || overlay.classList.contains("hidden");
  if (open) overlayTriggerByTarget.set(overlay, returnTarget);
  setOverlayOpen(root, overlay, open);
}

function toggleCollapse(root: RuntimeRoot, trigger: HTMLElement): void {
  const panel = resolveTarget(root, trigger, "data-r5-disclosure");
  if (!panel) return;
  const open = panel.hidden !== false || panel.classList.contains("hidden");
  panel.hidden = !open;
  panel.classList.toggle("hidden", !open);
  panel.classList.toggle("is-open", open);
  trigger.classList.toggle("is-open", open);
  trigger.setAttribute("aria-expanded", open ? "true" : "false");
}

function dropdownParts(trigger: HTMLElement): { container: HTMLElement; menu: HTMLElement } | null {
  const container = trigger.parentElement;
  if (!container) return null;
  const labelledMenu = trigger.id
    ? container.querySelector<HTMLElement>(
        `[role="menu"][aria-labelledby="${CSS.escape(trigger.id)}"]`,
      )
    : null;
  const menu = labelledMenu ?? container.querySelector<HTMLElement>("[role=menu]");
  return menu ? { container, menu } : null;
}

function setDropdownOpen(trigger: HTMLElement, open: boolean): void {
  const parts = dropdownParts(trigger);
  if (!parts) return;
  parts.container.classList.add("group");
  parts.container.classList.toggle("is-open", open);
  parts.menu.hidden = !open;
  parts.menu.classList.toggle("hidden", !open);
  trigger.setAttribute("aria-expanded", open ? "true" : "false");
  if (open) {
    focusableElements(parts.menu)[0]?.focus();
  }
}

function configureDropdowns(root: RuntimeRoot): void {
  queryAll(root, '[aria-haspopup="menu"]').forEach((trigger) => {
    const parts = dropdownParts(trigger);
    if (!parts) return;
    parts.container.classList.add("group");
    const open = !parts.menu.hidden && !parts.menu.classList.contains("hidden");
    trigger.setAttribute("aria-expanded", open ? "true" : "false");
    parts.container.classList.toggle("is-open", open);
  });
}

function configureTooltips(root: RuntimeRoot): void {
  queryAll(root, '[role="tooltip"]').forEach((tooltip) => {
    tooltip.parentElement?.classList.add("group");
  });
}

function toggleDropdown(root: RuntimeRoot, trigger: HTMLElement): void {
  const parts = dropdownParts(trigger);
  if (!parts) return;
  const { menu } = parts;
  const open = menu.hidden !== false || menu.classList.contains("hidden");
  queryAll(root, '[aria-haspopup="menu"][aria-expanded="true"]').forEach((candidate) => {
    if (candidate !== trigger) setDropdownOpen(candidate, false);
  });
  setDropdownOpen(trigger, open);
}

function configureAccordions(root: RuntimeRoot): void {
  queryAll(root, ".r5-accordion-item").forEach((item) => {
    const trigger = item.querySelector<HTMLElement>(":scope > .r5-accordion-toggle");
    const panel = item.querySelector<HTMLElement>(":scope > .r5-accordion-content");
    if (!trigger || !panel) return;
    item.classList.add("group");
    // Ids have to stay unique across every root this runtime initializes. A
    // per-scan index restarts at 1 for a subtree root and collides with the
    // panels already on the page, which breaks aria-controls.
    if (!panel.id) panel.id = generateId("r5-accordion-panel");
    if (!trigger.id) trigger.id = generateId("r5-accordion-toggle");
    const open = !panel.hidden && !panel.classList.contains("hidden");
    item.classList.toggle("active", open);
    trigger.setAttribute("aria-controls", panel.id);
    trigger.setAttribute("aria-expanded", open ? "true" : "false");
    panel.setAttribute("role", "region");
    panel.setAttribute("aria-labelledby", trigger.id);
  });
}

function toggleAccordion(trigger: HTMLElement): void {
  const item = trigger.closest<HTMLElement>(".r5-accordion-item");
  const panel = item?.querySelector<HTMLElement>(":scope > .r5-accordion-content");
  if (!item || !panel) return;
  const open = panel.hidden !== false || panel.classList.contains("hidden");
  const accordion = item.closest<HTMLElement>(".r5-accordion");
  const allowMultiple = accordion?.getAttribute("data-r5-accordion-multiple") === "true";

  if (open && accordion && !allowMultiple) {
    Array.from(accordion.children).forEach((child) => {
      if (
        !(child instanceof HTMLElement) ||
        child === item ||
        !child.classList.contains("r5-accordion-item")
      )
        return;
      const peerTrigger = child.querySelector<HTMLElement>(":scope > .r5-accordion-toggle");
      const peerPanel = child.querySelector<HTMLElement>(":scope > .r5-accordion-content");
      child.classList.remove("active");
      if (peerPanel) {
        peerPanel.hidden = true;
        peerPanel.classList.add("hidden");
      }
      peerTrigger?.setAttribute("aria-expanded", "false");
    });
  }

  panel.hidden = !open;
  panel.classList.toggle("hidden", !open);
  item.classList.toggle("active", open);
  trigger.setAttribute("aria-expanded", open ? "true" : "false");
}

function tabPeers(tab: HTMLElement): HTMLElement[] {
  const list = tab.closest<HTMLElement>('[role="tablist"]') ?? tab.parentElement;
  return list
    ? Array.from(list.querySelectorAll<HTMLElement>("[data-r5-tab-target]")).filter(
        (peer) => (peer.closest('[role="tablist"]') ?? peer.parentElement) === list,
      )
    : [tab];
}

function activateTab(root: RuntimeRoot, tab: HTMLElement): void {
  if (isDisabled(tab)) return;
  const selector = tab.getAttribute("data-r5-tab-target");
  if (!selector) return;
  const panel = query(root, selector);
  if (!panel) return;

  const peers = tabPeers(tab);

  peers.forEach((peer) => {
    const active = peer === tab;
    peer.setAttribute("aria-selected", active ? "true" : "false");
    peer.setAttribute("tabindex", active ? "0" : "-1");
    peer.dataset["state"] = active ? "active" : "inactive";
    const peerSelector = peer.getAttribute("data-r5-tab-target");
    const peerPanel = peerSelector ? query(root, peerSelector) : null;
    if (peerPanel) {
      peerPanel.hidden = !active;
      peerPanel.classList.toggle("hidden", !active);
    }
  });
}

function configureTabs(root: RuntimeRoot): void {
  const initializedLists = new Set<HTMLElement>();
  queryAll(root, "[data-r5-tab-target]").forEach((tab) => {
    const list = tab.closest<HTMLElement>('[role="tablist"]') ?? tab.parentElement;
    if (!list || initializedLists.has(list)) return;
    initializedLists.add(list);
    // role="tab" is only valid inside a tablist, and the fallback container is
    // whatever element happened to wrap the tabs.
    if (!list.hasAttribute("role")) list.setAttribute("role", "tablist");
    const tabs = tabPeers(tab);
    tabs.forEach((peer) => {
      const panel = resolveTarget(root, peer, "data-r5-tab-target");
      if (!panel) return;
      if (!peer.id) peer.id = generateId("r5-tab");
      if (!panel.id) panel.id = generateId("r5-tab-panel");
      peer.setAttribute("role", "tab");
      peer.setAttribute("aria-controls", panel.id);
      panel.setAttribute("role", "tabpanel");
      panel.setAttribute("aria-labelledby", peer.id);
      if (!panel.hasAttribute("tabindex")) panel.tabIndex = 0;
    });
    const enabledTabs = tabs.filter((peer) => !isDisabled(peer));
    const active =
      enabledTabs.find(
        (candidate) =>
          candidate.dataset["state"] === "active" ||
          candidate.getAttribute("aria-selected") === "true",
      ) ?? enabledTabs[0];
    if (active) activateTab(root, active);
  });
}

function updateInputNumber(control: HTMLElement, direction: 1 | -1): void {
  const scope = control.closest<HTMLElement>("[data-r5-number]") ?? control.parentElement;
  const input = scope?.querySelector<HTMLInputElement>(
    "[data-r5-number-input], input[type=number]",
  );
  if (!input || input.disabled || input.readOnly || input.step === "any") return;
  if (direction > 0) input.stepUp();
  else input.stepDown();
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function configureNativeSelects(root: RuntimeRoot): void {
  queryAll(root, "select[data-r5-select]").forEach((select) => {
    select.hidden = false;
    select.classList.remove("hidden");
    select.setAttribute("data-r5-native-select", "");
  });
}

interface RangeConfig {
  start?: number[];
  range?: { min?: number; max?: number };
  step?: number;
  disabled?: boolean;
}

function configureRangeSliders(root: RuntimeRoot): void {
  queryAll(root, "[data-r5-range]").forEach((host) => {
    if (host.hasAttribute("data-r5-range-ready")) return;
    const config = parseConfig(host.getAttribute("data-r5-range")) as RangeConfig;
    const starts = Array.isArray(config.start) && config.start.length > 0 ? config.start : [0];
    host.replaceChildren();
    host.classList.add("grid", "gap-2");
    starts.forEach((value, index) => {
      const input = ownerDocument(root).createElement("input");
      input.type = "range";
      input.min = String(config.range?.min ?? 0);
      input.max = String(config.range?.max ?? 100);
      input.step = String(config.step ?? 1);
      input.disabled = config.disabled === true;
      input.value = String(value);
      input.className = "w-full accent-primary";
      input.setAttribute(
        "aria-label",
        starts.length > 1 ? `Range value ${index + 1}` : "Range value",
      );
      host.appendChild(input);
    });
    host.setAttribute("data-r5-range-ready", "");
  });
}

function configurePinInputs(root: RuntimeRoot): () => void {
  const controller = new AbortController();
  const listenerOptions = { signal: controller.signal };
  queryAll(root, "[data-r5-pin]").forEach((group) => {
    const inputs = Array.from(group.querySelectorAll<HTMLInputElement>("[data-r5-pin-item]"));
    inputs.forEach((input, index) => {
      input.inputMode = "numeric";
      input.autocomplete = "one-time-code";
      input.maxLength = 1;
      input.addEventListener(
        "input",
        () => {
          if (input.disabled || input.readOnly) return;
          input.value = input.value.replace(/\D/g, "").slice(-1);
          if (input.value) inputs[index + 1]?.focus();
        },
        listenerOptions,
      );
      input.addEventListener(
        "keydown",
        (event) => {
          if (event.key === "Backspace" && !input.value && !input.disabled && !input.readOnly)
            inputs[index - 1]?.focus();
        },
        listenerOptions,
      );
      input.addEventListener(
        "paste",
        (event) => {
          if (input.disabled || input.readOnly) return;
          const digits = event.clipboardData?.getData("text").replace(/\D/g, "") ?? "";
          if (!digits) return;
          event.preventDefault();
          digits
            .slice(0, inputs.length - index)
            .split("")
            .forEach((digit, offset) => {
              const target = inputs[index + offset]!;
              if (target.disabled || target.readOnly) return;
              target.value = digit;
              target.dispatchEvent(new Event("input", { bubbles: true }));
              target.dispatchEvent(new Event("change", { bubbles: true }));
            });
          inputs[Math.min(index + digits.length, inputs.length - 1)]?.focus();
        },
        listenerOptions,
      );
    });
  });
  return () => controller.abort();
}

function carouselSlides(carousel: HTMLElement): HTMLElement[] {
  return Array.from(carousel.querySelectorAll<HTMLElement>(".r5-carousel-slide"));
}

function carouselPagination(carousel: HTMLElement, slideCount: number): HTMLElement[] {
  let items = Array.from(carousel.querySelectorAll<HTMLElement>(".r5-carousel-pagination-item"));
  if (items.length > 0) return items;

  const container = carousel.querySelector<HTMLElement>(".r5-carousel-pagination");
  const config = parseConfig(carousel.getAttribute("data-r5-carousel"));
  const dotClasses = config["dotsItemClasses"];
  if (!container || typeof dotClasses !== "string") return items;
  for (let index = 0; index < slideCount; index += 1) {
    const button = carousel.ownerDocument.createElement("button");
    button.type = "button";
    button.className = `r5-carousel-pagination-item ${dotClasses}`;
    button.setAttribute("aria-label", `Go to slide ${index + 1}`);
    container.appendChild(button);
  }
  items = Array.from(carousel.querySelectorAll<HTMLElement>(".r5-carousel-pagination-item"));
  return items;
}

function setCarouselIndex(carousel: HTMLElement, requestedIndex: number): void {
  const slides = carouselSlides(carousel);
  if (slides.length === 0) return;
  const index = Math.max(0, Math.min(requestedIndex, slides.length - 1));
  carousel.dataset["r5CarouselIndex"] = String(index);
  slides.forEach((slide, slideIndex) => {
    const active = slideIndex === index;
    slide.hidden = !active;
    slide.classList.toggle("is-active", active);
    slide.setAttribute("aria-hidden", active ? "false" : "true");
  });
  carouselPagination(carousel, slides.length).forEach((item, itemIndex) => {
    const active = itemIndex === index;
    item.classList.toggle("is-active", active);
    item.setAttribute("aria-current", active ? "true" : "false");
    if (!(item instanceof HTMLButtonElement)) {
      item.setAttribute("role", "button");
      item.tabIndex = 0;
    }
  });
  carousel.querySelector<HTMLElement>(".r5-carousel-body")?.classList.remove("opacity-0");
  carousel.querySelectorAll<HTMLButtonElement>(".r5-carousel-previous").forEach((button) => {
    button.disabled = index === 0;
    button.classList.toggle("is-disabled", button.disabled);
  });
  carousel.querySelectorAll<HTMLButtonElement>(".r5-carousel-next").forEach((button) => {
    button.disabled = index === slides.length - 1;
    button.classList.toggle("is-disabled", button.disabled);
  });
}

function configureCarousels(root: RuntimeRoot): void {
  queryAll(root, "[data-r5-carousel]").forEach((carousel) => {
    setCarouselIndex(carousel, Number(carousel.dataset["r5CarouselIndex"] ?? 0));
  });
}

function stepIndex(element: HTMLElement, fallback: number): number {
  const config = parseConfig(
    element.getAttribute("data-r5-stepper-nav-item") ??
      element.getAttribute("data-r5-stepper-content-item"),
  );
  return typeof config["index"] === "number" ? config["index"] : fallback;
}

function setStepperIndex(stepper: HTMLElement, requestedIndex: number, final = false): void {
  const navItems = Array.from(stepper.querySelectorAll<HTMLElement>("[data-r5-stepper-nav-item]"));
  const panels = Array.from(
    stepper.querySelectorAll<HTMLElement>("[data-r5-stepper-content-item]"),
  );
  const indexedPanels = panels.filter(
    (panel) => !parseConfig(panel.getAttribute("data-r5-stepper-content-item"))["isFinal"],
  );
  const max = Math.max(1, indexedPanels.length);
  const index = Math.max(1, Math.min(requestedIndex, max));
  stepper.dataset["r5StepperIndex"] = String(index);

  navItems.forEach((item, position) => {
    const itemIndex = stepIndex(item, position + 1);
    item.classList.add("group");
    item.classList.toggle("is-active", itemIndex === index && !final);
    item.classList.toggle("is-complete", itemIndex < index || final);
    item.setAttribute("aria-current", itemIndex === index && !final ? "step" : "false");
  });
  panels.forEach((panel, position) => {
    const config = parseConfig(panel.getAttribute("data-r5-stepper-content-item"));
    const visible =
      config["isFinal"] === true ? final : stepIndex(panel, position + 1) === index && !final;
    panel.hidden = !visible;
    panel.style.display = visible ? "" : "none";
  });

  const show = (selector: string, visible: boolean) => {
    stepper.querySelectorAll<HTMLElement>(selector).forEach((control) => {
      control.hidden = !visible;
      control.style.display = visible ? "" : "none";
    });
  };
  show("[data-r5-stepper-back-btn]", index > 1 && !final);
  show("[data-r5-stepper-next-btn]", index < max && !final);
  show("[data-r5-stepper-finish-btn]", index === max && !final);
  show("[data-r5-stepper-reset-btn]", final);
  stepper.dispatchEvent(
    new CustomEvent("r5:stepper-change", { bubbles: true, detail: { index, final } }),
  );
}

function configureSteppers(root: RuntimeRoot): void {
  queryAll(root, "[data-r5-stepper]").forEach((stepper) => setStepperIndex(stepper, 1));
}

/** Splits `report.csv` into its display name and extension. */
function splitFileName(name: string): { base: string; extension: string } {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return { base: name, extension: "" };
  return { base: name.slice(0, dot), extension: name.slice(dot + 1) };
}

/**
 * Fills one cloned preview from its file.
 *
 * Templates carry per-file slots (name, extension, size, progress, thumbnail) plus mutually
 * exclusive success/error states. `maxFilesize` is expressed in megabytes, matching the block
 * config.
 *
 * Per-extension `icon` config is deliberately not applied: it is raw HTML, and this runtime never
 * injects markup.
 */
function fillUploadPreview(preview: HTMLElement, file: File, maxFilesize: number | null): void {
  const { base, extension } = splitFileName(file.name);
  const fileNameEl = preview.querySelector<HTMLElement>("[data-r5-upload-file-name]");
  const fileExtEl = preview.querySelector<HTMLElement>("[data-r5-upload-file-ext]");
  const fileSize = preview.querySelector<HTMLElement>("[data-r5-upload-file-size]");
  const progress = preview.querySelector<HTMLElement>("[data-r5-upload-progress-bar]");
  const progressPane = preview.querySelector<HTMLElement>("[data-r5-upload-progress-bar-pane]");
  const progressValue = preview.querySelector<HTMLElement>("[data-r5-upload-progress-bar-value]");
  const thumbnail = preview.querySelector<HTMLImageElement>("[data-r5-upload-thumbnail]");

  // Templates that render the extension separately would otherwise show a
  // dangling separator, so only those get the bare name.
  if (fileNameEl) fileNameEl.textContent = fileExtEl ? base : file.name;
  if (fileExtEl) fileExtEl.textContent = extension;
  if (fileSize) fileSize.textContent = `${Math.ceil(file.size / 1024)} KB`;

  const tooLarge = maxFilesize !== null && file.size > maxFilesize * 1024 * 1024;
  preview.querySelectorAll<HTMLElement>("[data-r5-upload-file-error]").forEach((element) => {
    element.style.display = tooLarge ? "" : "none";
  });
  preview.querySelectorAll<HTMLElement>("[data-r5-upload-file-success]").forEach((element) => {
    element.style.display = tooLarge ? "none" : "";
  });

  if (progress) progress.setAttribute("aria-valuenow", tooLarge ? "0" : "100");
  if (progressPane) {
    progressPane.style.width = tooLarge ? "0%" : "100%";
    progressPane.classList.remove("bg-primary");
    progressPane.classList.toggle("bg-error", tooLarge);
    progressPane.classList.toggle("bg-success", !tooLarge);
  }
  if (progressValue) progressValue.textContent = tooLarge ? "0" : "100";
  if (thumbnail && file.type.startsWith("image/") && URL.createObjectURL) {
    const objectUrl = URL.createObjectURL(file);
    thumbnail.src = objectUrl;
    thumbnail.alt = file.name;
    thumbnail.addEventListener("load", () => URL.revokeObjectURL(objectUrl), { once: true });
  }
}

/** Files backing each rendered preview, so the retry control can refill one. */
const uploadPreviewFiles = new WeakMap<HTMLElement, { file: File; maxFilesize: number | null }>();

function configureFileUploads(root: RuntimeRoot): void {
  queryAll(root, "[data-r5-upload]").forEach((host) => {
    if (host.hasAttribute("data-r5-upload-ready")) return;
    const config = parseConfig(host.getAttribute("data-r5-upload"));
    const maxFilesize = typeof config["maxFilesize"] === "number" ? config["maxFilesize"] : null;
    const input = ownerDocument(root).createElement("input");
    input.type = "file";
    input.hidden = true;
    input.multiple = true;
    if (typeof config["acceptedFiles"] === "string") input.accept = config["acceptedFiles"];
    host.appendChild(input);

    host
      .querySelector<HTMLElement>("[data-r5-upload-trigger]")
      ?.addEventListener("click", () => input.click());
    input.addEventListener("change", () => {
      const previews = host.querySelector<HTMLElement>("[data-r5-upload-previews]");
      const template = host.querySelector<HTMLTemplateElement>("template[data-r5-upload-preview]");
      if (!previews || !template) return;
      Array.from(input.files ?? []).forEach((file) => {
        const fragment = template.content.cloneNode(true) as DocumentFragment;
        const preview = fragment.firstElementChild;
        if (!(preview instanceof HTMLElement)) return;
        // The attribute lives on the <template>, so clones need their own marker
        // for the remove and retry controls to find the preview they sit in.
        preview.setAttribute("data-r5-upload-preview", "");
        fillUploadPreview(preview, file, maxFilesize);
        uploadPreviewFiles.set(preview, { file, maxFilesize });
        previews.appendChild(fragment);
      });
    });
    host.setAttribute("data-r5-upload-ready", "");
  });
}

function reloadFilePreview(control: HTMLElement): void {
  const preview = control.closest<HTMLElement>("[data-r5-upload-preview]");
  if (!preview) return;
  const entry = uploadPreviewFiles.get(preview);
  if (!entry) return;
  fillUploadPreview(preview, entry.file, entry.maxFilesize);
}

function togglePassword(root: RuntimeRoot, control: HTMLElement): void {
  const config = parseConfig(control.getAttribute("data-r5-password-toggle"));
  const selector = typeof config["target"] === "string" ? config["target"] : null;
  const input = selector ? query(root, selector) : null;
  if (!(input instanceof HTMLInputElement)) return;
  const visible = input.type === "password";
  input.type = visible ? "text" : "password";
  control.classList.add("group");
  control.classList.toggle("password-active", visible);
  control.setAttribute("aria-pressed", visible ? "true" : "false");
}

function removeFilePreview(control: HTMLElement): void {
  control.closest<HTMLElement>("[data-r5-upload-preview]")?.remove();
}

/** Pristine label per clipboard control, captured before the first success swap. */
const clipboardLabels = new WeakMap<HTMLElement, string>();
/** Pending reset timer per clipboard control, so rapid copies do not race. */
const clipboardResetTimers = new WeakMap<HTMLElement, number>();

async function copyTarget(root: RuntimeRoot, control: HTMLElement): Promise<void> {
  const target = resolveTarget(root, control, "data-r5-clipboard-target");
  if (!target) return;
  const value =
    target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
      ? target.value
      : (target.getAttribute("value") ?? target.textContent ?? "");
  if (!navigator.clipboard?.writeText) return;
  await navigator.clipboard.writeText(value);

  const defaultIcon = control.querySelector<HTMLElement>(".js-clipboard-default");
  const successIcon = control.querySelector<HTMLElement>(".js-clipboard-success");
  const label = control.querySelector<HTMLElement>(".js-clipboard-success-text");
  // A second copy within the reset window would otherwise capture the success
  // text as the label to restore, leaving it stuck there.
  const pendingTimer = clipboardResetTimers.get(control);
  if (pendingTimer !== undefined) window.clearTimeout(pendingTimer);
  if (label && !clipboardLabels.has(control)) clipboardLabels.set(control, label.textContent ?? "");
  defaultIcon?.classList.add("hidden");
  successIcon?.classList.remove("hidden");
  if (label && control.dataset["clipboardSuccessText"]) {
    label.textContent = control.dataset["clipboardSuccessText"];
  }
  const timer = window.setTimeout(() => {
    defaultIcon?.classList.remove("hidden");
    successIcon?.classList.add("hidden");
    const pristine = clipboardLabels.get(control);
    if (label && pristine !== undefined) label.textContent = pristine;
    clipboardResetTimers.delete(control);
  }, 1600);
  clipboardResetTimers.set(control, timer);
}

function clickHandler(root: RuntimeRoot, event: MouseEvent): void {
  const target = event.target;
  const control = closest(
    target,
    'button, a, input, [role="tab"], [role="menuitem"], [aria-disabled="true"]',
  );
  if (control && isDisabled(control)) {
    event.preventDefault();
    return;
  }
  let overlayReturnTarget: HTMLElement | undefined;
  const selectedMenu = closest(target, '[role="menu"]');
  if (selectedMenu && closest(target, 'a[href], button, [role="menuitem"]')) {
    queryAll(root, '[aria-haspopup="menu"][aria-expanded="true"]').forEach((trigger) => {
      if (dropdownParts(trigger)?.menu === selectedMenu) {
        overlayReturnTarget = trigger;
        setDropdownOpen(trigger, false);
        trigger.focus();
      }
    });
  }
  const overlayTrigger = closest(target, "[data-r5-overlay]");
  if (overlayTrigger) {
    event.preventDefault();
    toggleOverlay(root, overlayTrigger, overlayReturnTarget ?? overlayTrigger);
    return;
  }
  const collapseTrigger = closest(target, "[data-r5-disclosure]");
  if (collapseTrigger) {
    event.preventDefault();
    toggleCollapse(root, collapseTrigger);
    return;
  }
  const accordionTrigger = closest(target, ".r5-accordion-toggle");
  if (accordionTrigger) {
    event.preventDefault();
    toggleAccordion(accordionTrigger);
    return;
  }
  const removeTrigger = closest(target, "[data-r5-remove]");
  if (removeTrigger) {
    event.preventDefault();
    resolveTarget(root, removeTrigger, "data-r5-remove")?.remove();
    return;
  }
  const passwordTrigger = closest(target, "[data-r5-password-toggle]");
  if (passwordTrigger) {
    event.preventDefault();
    togglePassword(root, passwordTrigger);
    return;
  }
  const clipboardTrigger = closest(target, "[data-r5-clipboard-target]");
  if (clipboardTrigger) {
    event.preventDefault();
    void copyTarget(root, clipboardTrigger).catch(() => undefined);
    return;
  }
  const tab = closest(target, "[data-r5-tab-target]");
  if (tab) {
    event.preventDefault();
    activateTab(root, tab);
    return;
  }
  const increment = closest(target, "[data-r5-number-increment]");
  if (increment) {
    event.preventDefault();
    updateInputNumber(increment, 1);
    return;
  }
  const decrement = closest(target, "[data-r5-number-decrement]");
  if (decrement) {
    event.preventDefault();
    updateInputNumber(decrement, -1);
    return;
  }
  const dropdown = closest(target, '[aria-haspopup="menu"]');
  if (dropdown) {
    event.preventDefault();
    toggleDropdown(root, dropdown);
    return;
  }
  const carouselPrevious = closest(target, ".r5-carousel-previous");
  const carouselNext = closest(target, ".r5-carousel-next");
  const carouselPaginationItem = closest(target, ".r5-carousel-pagination-item");
  if (carouselPaginationItem) {
    event.preventDefault();
    const carousel = carouselPaginationItem.closest<HTMLElement>("[data-r5-carousel]");
    if (carousel) {
      const items = carouselPagination(carousel, carouselSlides(carousel).length);
      setCarouselIndex(carousel, items.indexOf(carouselPaginationItem));
    }
    return;
  }
  const carouselControl = carouselPrevious ?? carouselNext;
  if (carouselControl) {
    event.preventDefault();
    const carousel = carouselControl.closest<HTMLElement>("[data-r5-carousel]");
    if (carousel) {
      const current = Number(carousel.dataset["r5CarouselIndex"] ?? 0);
      setCarouselIndex(carousel, current + (carouselNext ? 1 : -1));
    }
    return;
  }
  const stepperControl = closest(
    target,
    "[data-r5-stepper-next-btn], [data-r5-stepper-back-btn], [data-r5-stepper-finish-btn], [data-r5-stepper-reset-btn]",
  );
  if (stepperControl) {
    const stepper = stepperControl.closest<HTMLElement>("[data-r5-stepper]");
    if (!stepper) return;
    event.preventDefault();
    const current = Number(stepper.dataset["r5StepperIndex"] ?? 1);
    if (stepperControl.hasAttribute("data-r5-stepper-next-btn"))
      setStepperIndex(stepper, current + 1);
    if (stepperControl.hasAttribute("data-r5-stepper-back-btn"))
      setStepperIndex(stepper, current - 1);
    if (stepperControl.hasAttribute("data-r5-stepper-finish-btn"))
      setStepperIndex(stepper, current, true);
    if (stepperControl.hasAttribute("data-r5-stepper-reset-btn")) setStepperIndex(stepper, 1);
    return;
  }
  const uploadRemove = closest(target, "[data-r5-upload-remove]");
  if (uploadRemove) {
    event.preventDefault();
    removeFilePreview(uploadRemove);
    return;
  }
  const uploadReload = closest(target, "[data-r5-upload-reload]");
  if (uploadReload) {
    event.preventDefault();
    reloadFilePreview(uploadReload);
    return;
  }

  queryAll(root, '[aria-haspopup="menu"][aria-expanded="true"]').forEach((trigger) => {
    const parts = dropdownParts(trigger);
    if (parts && !parts.container.contains(target as Node)) setDropdownOpen(trigger, false);
  });
}

function keydownHandler(root: RuntimeRoot, event: KeyboardEvent): void {
  const tab = closest(event.target, "[data-r5-tab-target]");
  if (tab && !isDisabled(tab)) {
    const list = tab.closest('[role="tablist"]');
    const vertical = list?.getAttribute("aria-orientation") === "vertical";
    const rtl = list && ownerDocument(root).defaultView?.getComputedStyle(list).direction === "rtl";
    const next = vertical ? "ArrowDown" : rtl ? "ArrowLeft" : "ArrowRight";
    const previous = vertical ? "ArrowUp" : rtl ? "ArrowRight" : "ArrowLeft";
    if ([next, previous, "Home", "End"].includes(event.key)) {
      const tabs = tabPeers(tab).filter((peer) => !isDisabled(peer));
      const current = tabs.indexOf(tab);
      const index =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? tabs.length - 1
            : (current + (event.key === next ? 1 : -1) + tabs.length) % tabs.length;
      const target = tabs[index];
      if (target) {
        event.preventDefault();
        activateTab(root, target);
        target.focus();
      }
      return;
    }
  }
  const menuTrigger = closest(event.target, '[aria-haspopup="menu"]');
  if (menuTrigger && !isDisabled(menuTrigger) && ["ArrowDown", "ArrowUp"].includes(event.key)) {
    event.preventDefault();
    if (menuTrigger.getAttribute("aria-expanded") !== "true") toggleDropdown(root, menuTrigger);
    const menu = dropdownParts(menuTrigger)?.menu;
    if (menu && event.key === "ArrowUp") focusableElements(menu).at(-1)?.focus();
    return;
  }
  const menu = closest(event.target, '[role="menu"]');
  if (menu && ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
    const items = focusableElements(menu);
    const current = items.indexOf(event.target as HTMLElement);
    const index =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? items.length - 1
          : (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    event.preventDefault();
    items[index]?.focus();
    return;
  }
  if (event.key === "Enter" || event.key === " ") {
    const paginationItem = closest(event.target, ".r5-carousel-pagination-item");
    if (paginationItem && !(paginationItem instanceof HTMLButtonElement)) {
      event.preventDefault();
      paginationItem.click();
      return;
    }
  }
  if (event.key === "Escape") {
    // Overlays close in the order they were opened, which is not DOM order.
    const stillOpen = (overlay: HTMLElement) =>
      overlay instanceof HTMLDialogElement
        ? overlay.open
        : overlay.classList.contains("overlay-open");
    const opened = [...(openedOverlays.get(root) ?? [])].filter(stillOpen);
    const active = opened.at(-1) ?? queryAll(root, ".overlay-open, dialog[open]").at(-1);
    if (active) {
      event.preventDefault();
      setOverlayOpen(root, active, false);
      return;
    }
    const dropdown = queryAll(root, '[aria-haspopup="menu"][aria-expanded="true"]').at(-1);
    if (dropdown) {
      event.preventDefault();
      setDropdownOpen(dropdown, false);
      dropdown.focus();
    }
    return;
  }

  if (event.key !== "Tab") return;
  const overlay = closest(event.target, ".overlay-open, dialog[open]");
  if (!overlay) return;
  const focusables = focusableElements(overlay);
  if (focusables.length === 0) return;
  const first = focusables[0]!;
  const last = focusables.at(-1)!;
  if (event.shiftKey && event.target === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && event.target === last) {
    event.preventDefault();
    first.focus();
  }
}

/** Initialize native interactions for all blocks below `root`. */
export function initBlockInteractions(options: BlockInteractionOptions = {}): () => void {
  const root = options.root ?? (typeof document === "undefined" ? undefined : document);
  if (!root) return () => undefined;

  const existingCleanup = cleanupByRoot.get(root);
  if (existingCleanup) return existingCleanup;

  configureNativeSelects(root);
  configureDropdowns(root);
  configureTooltips(root);
  configureAccordions(root);
  configureTabs(root);
  configureRangeSliders(root);
  const cleanupPins = configurePinInputs(root);
  configureCarousels(root);
  configureSteppers(root);
  configureFileUploads(root);
  const cleanupDatatables = initNativeDatatables(root);

  const onClick = (event: Event) => clickHandler(root, event as MouseEvent);
  const onKeydown = (event: Event) => keydownHandler(root, event as KeyboardEvent);
  const onFocus = (event: Event) => {
    queryAll(root, '[aria-haspopup="menu"][aria-expanded="true"]').forEach((trigger) => {
      if (!dropdownParts(trigger)?.container.contains(event.target as Node))
        setDropdownOpen(trigger, false);
    });
  };
  const onClose = (event: Event) => {
    if (event.target instanceof HTMLElement && openedOverlays.get(root)?.has(event.target))
      setOverlayOpen(root, event.target, false);
  };
  root.addEventListener("focusin", onFocus);
  root.addEventListener("close", onClose, true);
  root.addEventListener("click", onClick);
  root.addEventListener("keydown", onKeydown);

  const cleanup = () => {
    for (const overlay of openedOverlays.get(root) ?? []) setOverlayOpen(root, overlay, false);
    openedOverlays.delete(root);
    cleanupPins();
    cleanupDatatables();
    root.removeEventListener("focusin", onFocus);
    root.removeEventListener("close", onClose, true);
    root.removeEventListener("click", onClick);
    root.removeEventListener("keydown", onKeydown);
    cleanupByRoot.delete(root);
  };
  cleanupByRoot.set(root, cleanup);
  return cleanup;
}

export const initSharedBlockInteractions = initBlockInteractions;
