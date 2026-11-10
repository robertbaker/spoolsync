import { TIGERTAG_FIREBASE } from "./cloud-config";
import { googleError } from "./cloud-errors";
import { defaultFetch, type FetchLike, type TigertagSession } from "./session";

const IDENTITY = "https://identitytoolkit.googleapis.com/v1";
const SECURE_TOKEN = "https://securetoken.googleapis.com/v1";

/** Epoch ms to refresh at; a missing or invalid lifetime counts as already expiring. */
function expiryFrom(expiresIn: unknown, now: number): number {
  const seconds = Number(expiresIn);
  return Number.isFinite(seconds) && seconds > 0 ? now + Math.max(0, seconds - 60) * 1000 : now;
}

export async function signIn(
  email: string,
  password: string,
  fetchImpl: FetchLike = defaultFetch,
): Promise<TigertagSession> {
  const response = await fetchImpl(
    `${IDENTITY}/accounts:signInWithPassword?key=${TIGERTAG_FIREBASE.apiKey}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  if (!response.ok) throw await googleError(response);
  const body = (await response.json()) as {
    localId: string;
    email: string;
    idToken: string;
    refreshToken: string;
    expiresIn?: string;
  };
  return {
    uid: body.localId,
    email: body.email,
    idToken: body.idToken,
    refreshToken: body.refreshToken,
    expiresAt: expiryFrom(body.expiresIn, Date.now()),
  };
}

export async function refreshSession(
  session: TigertagSession,
  fetchImpl: FetchLike = defaultFetch,
): Promise<TigertagSession> {
  const response = await fetchImpl(`${SECURE_TOKEN}/token?key=${TIGERTAG_FIREBASE.apiKey}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ grant_type: "refresh_token", refresh_token: session.refreshToken }),
  });
  if (!response.ok) throw await googleError(response);
  const body = (await response.json()) as {
    id_token: string;
    refresh_token: string;
    user_id?: string;
    expires_in?: string;
  };
  return {
    ...session,
    uid: body.user_id || session.uid,
    idToken: body.id_token,
    refreshToken: body.refresh_token,
    expiresAt: expiryFrom(body.expires_in, Date.now()),
  };
}
