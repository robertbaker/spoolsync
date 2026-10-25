import { TIGERTAG_FIREBASE } from "./cloud-config";
import { googleError } from "./cloud-errors";
import { defaultFetch, type FetchLike, type TigertagSession } from "./session";

const IDENTITY = "https://identitytoolkit.googleapis.com/v1";
const SECURE_TOKEN = "https://securetoken.googleapis.com/v1";

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
    expiresIn: string;
  };
  return {
    uid: body.localId,
    email: body.email,
    idToken: body.idToken,
    refreshToken: body.refreshToken,
    expiresAt: Date.now() + (Number(body.expiresIn) - 60) * 1000,
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
    user_id: string;
    expires_in: string;
  };
  return {
    ...session,
    uid: body.user_id,
    idToken: body.id_token,
    refreshToken: body.refresh_token,
    expiresAt: Date.now() + (Number(body.expires_in) - 60) * 1000,
  };
}
