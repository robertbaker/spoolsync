import { getAvatarGroupLimit } from "./avatarVariants";

const boundImages = new WeakSet<HTMLImageElement>();

export function initAvatarGroups(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>("[data-avatar-group]").forEach((group) => {
    const overflow = group.querySelector<HTMLElement>(":scope > [data-avatar-group-overflow]");
    if (!overflow) return;
    const avatars = Array.from(group.querySelectorAll<HTMLElement>(":scope > [data-avatar]"));
    // Only undo visibility changes made by this initializer. Author-hidden children
    // remain hidden and do not consume a visible position.
    avatars.forEach((avatar) => {
      if (avatar.hasAttribute("data-avatar-group-limited")) {
        avatar.hidden = false;
        avatar.removeAttribute("data-avatar-group-limited");
      }
    });
    const available = avatars.filter((avatar) => !avatar.hidden);
    const maxAttribute = group.dataset["avatarGroupMax"];
    const max = maxAttribute === undefined ? undefined : Number(maxAttribute);
    const visible = Math.min(available.length, getAvatarGroupLimit(available.length, max));
    available.slice(visible).forEach((avatar) => {
      avatar.hidden = true;
      avatar.setAttribute("data-avatar-group-limited", "");
    });
    const total = Number(group.dataset["avatarGroupTotal"]);
    const baseTotal = Number.isFinite(total)
      ? Math.max(available.length, Math.floor(total))
      : available.length;
    const remaining = Math.max(0, baseTotal - visible);
    overflow.hidden = remaining === 0;
    overflow.setAttribute(
      "aria-label",
      `${remaining} ${group.dataset["avatarGroupOverflowLabel"] ?? "more people"}`,
    );
    overflow.querySelectorAll<HTMLElement>("[data-avatar-group-count]").forEach((counter) => {
      counter.textContent = `+${remaining}`;
    });
  });
}

export function initAvatars(root: ParentNode = document): void {
  root.querySelectorAll<HTMLImageElement>("[data-avatar-image]").forEach((image) => {
    if (boundImages.has(image)) return;
    const fallback = image
      .closest("[data-avatar]")
      ?.querySelector<HTMLElement>("[data-avatar-fallback]");
    if (!fallback) return;

    const showImage = (): void => {
      image.hidden = false;
      fallback.hidden = true;
    };
    const showFallback = (): void => {
      image.hidden = true;
      fallback.hidden = false;
    };

    image.addEventListener("load", showImage);
    image.addEventListener("error", showFallback);
    boundImages.add(image);
    if (image.complete) {
      if (image.naturalWidth > 0) showImage();
      else showFallback();
    }
  });
}
