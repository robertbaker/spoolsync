export interface SafeUrlOptions {
  allowHash?: boolean;
  allowRelative?: boolean;
  allowMailto?: boolean;
  allowTel?: boolean;
}

const DEFAULT_OPTIONS: Required<SafeUrlOptions> = {
  allowHash: true,
  allowRelative: true,
  allowMailto: true,
  allowTel: true,
};

export function sanitizeUrl(
  value: string | null | undefined,
  options: SafeUrlOptions = {},
): string | undefined {
  if (typeof value !== "string") return undefined;

  const href = value.trim();
  // eslint-disable-next-line no-control-regex
  if (!href || /[\u0000-\u001F\u007F]/.test(href)) return undefined;

  const resolvedOptions = { ...DEFAULT_OPTIONS, ...options };
  const lower = href.toLowerCase();

  if (resolvedOptions.allowHash && href.startsWith("#")) return href;
  if (resolvedOptions.allowMailto && lower.startsWith("mailto:")) return href;
  if (resolvedOptions.allowTel && lower.startsWith("tel:")) return href;

  if (resolvedOptions.allowRelative) {
    if (href.startsWith("/") && !href.startsWith("//")) return href;
    if (href.startsWith("./") || href.startsWith("../")) return href;
    if (!/^[a-z][a-z0-9+.-]*:/i.test(href) && !href.startsWith("//")) return href;
  }

  try {
    const url = new URL(href);
    if (url.protocol === "https:" || url.protocol === "http:") return href;
  } catch {
    return undefined;
  }

  return undefined;
}

export function sanitizeFormAction(value: string | null | undefined): string | undefined {
  return sanitizeUrl(value, {
    allowHash: false,
    allowRelative: true,
    allowMailto: false,
    allowTel: false,
  });
}
