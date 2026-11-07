export interface ClipboardEnvironment {
  writeText?: (text: string) => Promise<void>;
  /** Last resort: a hidden text box and the legacy copy command. Returns whether it worked. */
  legacyCopy?: (text: string) => boolean;
}

function browserEnvironment(): ClipboardEnvironment {
  return {
    writeText:
      typeof navigator !== "undefined" && navigator.clipboard?.writeText
        ? (text) => navigator.clipboard.writeText(text)
        : undefined,
    legacyCopy: (text) => {
      if (typeof document === "undefined") return false;
      const box = document.createElement("textarea");
      box.value = text;
      box.setAttribute("readonly", "");
      box.setAttribute("aria-hidden", "true");
      box.style.position = "fixed";
      box.style.opacity = "0";
      const previous = document.activeElement as HTMLElement | null;
      document.body.append(box);
      try {
        box.select();
        return (
          (document as { execCommand?: (commandId: string) => boolean }).execCommand?.("copy") ??
          false
        );
      } catch {
        return false;
      } finally {
        box.remove();
        previous?.focus?.();
      }
    },
  };
}

/** Copies plain text, falling back when the async clipboard is missing or refused. */
export async function copyText(
  text: string,
  environment: ClipboardEnvironment = browserEnvironment(),
): Promise<boolean> {
  if (environment.writeText) {
    try {
      await environment.writeText(text);
      return true;
    } catch {
      // Permission denied or insecure context: try the legacy path.
    }
  }
  try {
    return environment.legacyCopy?.(text) ?? false;
  } catch {
    return false;
  }
}
