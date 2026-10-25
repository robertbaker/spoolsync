export interface TigertagSession {
  uid: string;
  email: string;
  idToken: string;
  /** Long-lived; keeps the session going without the password. */
  refreshToken: string;
  /** Epoch ms after which `idToken` must be refreshed. */
  expiresAt: number;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
export const defaultFetch: FetchLike = (input, init) => fetch(input, init);
