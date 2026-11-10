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

const STATUS_MESSAGES: Record<number, { message: string; code: string }> = {
  404: {
    message: "TigerTag could not find that item. Reload the inventory and try again.",
    code: "NOT_FOUND",
  },
  409: {
    message:
      "TigerTag rejected the change because the data moved on. Reload the inventory and try again.",
    code: "ABORTED",
  },
};

export const CONFLICT_CODE = "CONFLICT";
const CONFLICT_CODES = new Set(["NOT_FOUND", "ABORTED", "ALREADY_EXISTS", "FAILED_PRECONDITION"]);

/** Whether a Firestore error means the document is not in the state the write assumed. */
export function isWriteConflict(error: unknown): boolean {
  return (
    error instanceof TigertagCloudError &&
    error.code !== undefined &&
    CONFLICT_CODES.has(error.code)
  );
}

export function conflictError(create: boolean): TigertagCloudError {
  return new TigertagCloudError(
    create
      ? "This TigerTag chip already exists. Reload the inventory and sync again."
      : "This TigerTag chip changed since it was loaded. Reload the inventory and sync again.",
    CONFLICT_CODE,
  );
}

export async function googleError(response: Response): Promise<TigertagCloudError> {
  const body = (await response.json().catch(() => ({}))) as {
    error?: { message?: string; status?: string };
  };
  const code = body.error?.message?.split(" ")[0] ?? body.error?.status ?? String(response.status);
  const friendly = STATUS_MESSAGES[response.status];
  // Firestore's 400 for a failed precondition has a prose message, so the status is the only code.
  if (body.error?.status === "FAILED_PRECONDITION" && !Object.hasOwn(SIGN_IN_MESSAGES, code))
    return new TigertagCloudError(
      "TigerTag rejected the change because the data moved on. Reload the inventory and try again.",
      body.error.status,
    );
  if (friendly && !Object.hasOwn(SIGN_IN_MESSAGES, code))
    return new TigertagCloudError(friendly.message, body.error?.status ?? friendly.code);
  const message = Object.hasOwn(SIGN_IN_MESSAGES, code)
    ? SIGN_IN_MESSAGES[code]!
    : `TigerTag cloud error: ${body.error?.message ?? response.status}`;
  return new TigertagCloudError(message, code);
}
