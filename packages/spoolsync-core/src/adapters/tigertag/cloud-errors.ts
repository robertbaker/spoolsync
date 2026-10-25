export class TigertagCloudError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "TigertagCloudError";
  }
}

const SIGN_IN_MESSAGES: Record<string, string> = {
  INVALID_LOGIN_CREDENTIALS: "Wrong email or password.",
  INVALID_PASSWORD: "Wrong email or password.",
  EMAIL_NOT_FOUND: "Wrong email or password.",
  USER_DISABLED: "This TigerTag account is disabled.",
  TOO_MANY_ATTEMPTS_TRY_LATER: "Too many attempts. Wait a few minutes and try again.",
  TOKEN_EXPIRED: "Your TigerTag session expired. Sign in again.",
  INVALID_REFRESH_TOKEN: "Your TigerTag session expired. Sign in again.",
};

export async function googleError(response: Response): Promise<TigertagCloudError> {
  const body = (await response.json().catch(() => ({}))) as {
    error?: { message?: string; status?: string };
  };
  const code = body.error?.message?.split(" ")[0] ?? body.error?.status ?? String(response.status);
  return new TigertagCloudError(
    SIGN_IN_MESSAGES[code] ?? `TigerTag cloud error: ${body.error?.message ?? response.status}`,
    code,
  );
}
