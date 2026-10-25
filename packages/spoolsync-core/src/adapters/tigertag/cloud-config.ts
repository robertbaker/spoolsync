/**
 * TigerTag's cloud inventory, through the REST route TigerTag documents for third-party clients:
 * email/password sign-in with Google Identity Toolkit, then Firestore REST under
 * `users/{uid}/inventory`. No Firebase SDK is needed.
 *
 * The config is the public web config from Tiger Studio Manager (MIT). TigerTag's own
 * `tigertag-cdn.web.app/__/firebase/init.json` serves the same values but without CORS headers, so
 * a browser cannot fetch it.
 *
 * Google sign-in is not available here: Firebase only allows it on TigerTag's own domains. Accounts
 * that use Google need a password set in TigerTag to sign in from SpoolSync.
 *
 * @see https://github.com/TigerTag-Project/TigerTag-Studio-Manager/blob/main/TIGERTAG_FIREBASE_INTEGRATION.md
 */
export const TIGERTAG_FIREBASE = {
  apiKey: "AIzaSyCkxPTs_Cv0KVLqsZj-UKWWqIY0OtfVpnw",
  projectId: "tigertag-connect",
} as const;

export const FIRESTORE = `https://firestore.googleapis.com/v1/projects/${TIGERTAG_FIREBASE.projectId}/databases/(default)/documents`;
