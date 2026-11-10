/** Query parameter names that carry a secret, such as `?token=...` or `?api_key=...`. */
const SECRET_PARAMETER = /token|key|secret|password|passwd|auth/i;

/**
 * What in a service URL holds a credential, or `undefined` when nothing does: the userinfo part, or
 * a query parameter whose name says it is a secret. Never returns the secret itself.
 */
export function urlCredential(url: URL): string | undefined {
  if (url.username || url.password) return "user name or password";
  for (const name of url.searchParams.keys())
    if (SECRET_PARAMETER.test(name)) return `query parameter "${name}"`;
  return undefined;
}

/** The URL text with any credential replaced, safe to show in `--show-config` and messages. */
export function redactUrl(text: string): string {
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return text;
  }
  if (!urlCredential(url)) return text;
  if (url.username) url.username = "redacted";
  if (url.password) url.password = "redacted";
  for (const name of url.searchParams
    .keys()
    .filter((key) => SECRET_PARAMETER.test(key))
    .toArray())
    url.searchParams.set(name, "redacted");
  return url.toString();
}
