import { refreshSession } from "./auth";
import { FIRESTORE } from "./cloud-config";
import { TigertagCloudError, conflictError, googleError, isWriteConflict } from "./cloud-errors";
import { decodeFields, encodeLike, type FirestoreValue } from "./firestore";
import type { TigertagInventoryClient } from "./inventory-client";
import type { TtagRecord } from "./schema";
import { defaultFetch, type FetchLike, type TigertagSession } from "./session";

/** Field paths in an update mask need backticks unless they are plain identifiers. */
const fieldPath = (key: string) =>
  /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) ? key : `\`${key.replace(/[`\\]/g, "\\$&")}\``;

interface LoadedDocument {
  updateTime?: string;
  fields: Record<string, FirestoreValue>;
}

export class TigertagCloud implements TigertagInventoryClient {
  private refreshing: Promise<void> | undefined;
  /** Each document as loaded: its version and typed fields, so writes can detect and preserve. */
  private loaded = new Map<string, LoadedDocument>();
  constructor(
    private session: TigertagSession,
    /** Called whenever the session is refreshed, so the caller can store the new tokens. */
    private readonly onSession: (session: TigertagSession) => void = () => {},
    private readonly fetchImpl: FetchLike = defaultFetch,
  ) {}

  get uid(): string {
    return this.session.uid;
  }

  private async token(): Promise<string> {
    if (Date.now() >= this.session.expiresAt) {
      this.refreshing ??= refreshSession(this.session, this.fetchImpl)
        .then((fresh) => {
          this.session = fresh;
          this.onSession(fresh);
        })
        .finally(() => {
          this.refreshing = undefined;
        });
      await this.refreshing;
    }
    return this.session.idToken;
  }

  private async request(url: string, init: RequestInit = {}, retried = false): Promise<Response> {
    const token = await this.token();
    const response = await this.fetchImpl(url, {
      ...init,
      headers: {
        ...(init.headers as Record<string, string>),
        authorization: `Bearer ${token}`,
      },
    });
    if (response.status === 401 && !retried) {
      if (this.session.idToken === token) this.session = { ...this.session, expiresAt: 0 };
      return this.request(url, init, true);
    }
    if (response.status === 403)
      throw new TigertagCloudError(
        "TigerTag refused access to this inventory.",
        "PERMISSION_DENIED",
      );
    if (!response.ok) throw await googleError(response);
    return response;
  }

  private inventoryUrl(docId?: string): string {
    const base = `${FIRESTORE}/users/${encodeURIComponent(this.session.uid)}/inventory`;
    return docId === undefined ? base : `${base}/${encodeURIComponent(docId)}`;
  }

  /** Every inventory document, each with its Firestore id in `__docId`. */
  async listInventory(): Promise<TtagRecord[]> {
    const records: TtagRecord[] = [];
    const pageTokens = new Set<string>();
    const documentIds = new Set<string>();
    const loaded = new Map<string, LoadedDocument>();
    let pageToken: string | undefined;
    do {
      const url = new URL(this.inventoryUrl());
      url.searchParams.set("pageSize", "300");
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const body = (await (await this.request(url.toString())).json()) as {
        documents?: Array<{
          name: string;
          updateTime?: string;
          fields?: Record<string, FirestoreValue>;
        }>;
        nextPageToken?: string;
      };
      for (const document of body.documents ?? []) {
        const docId = decodeURIComponent(document.name.split("/").at(-1)!);
        if (documentIds.has(docId))
          throw new TigertagCloudError(
            `TigerTag returned duplicate inventory document ${docId}. Reload the inventory before syncing.`,
            "INVALID_RESPONSE",
          );
        documentIds.add(docId);
        loaded.set(docId, { updateTime: document.updateTime, fields: document.fields ?? {} });
        const fields = decodeFields(document.fields ?? {});
        records.push({
          ...fields,
          uid: typeof fields["uid"] === "string" && fields["uid"] ? fields["uid"] : docId,
          __docId: docId,
        } as TtagRecord);
      }
      pageToken = body.nextPageToken;
      if (pageToken) {
        if (pageTokens.has(pageToken))
          throw new TigertagCloudError(
            "TigerTag repeated an inventory page token. Reload the inventory before syncing.",
            "INVALID_RESPONSE",
          );
        pageTokens.add(pageToken);
      }
    } while (pageToken);
    this.loaded = loaded;
    return records;
  }

  /**
   * Writes the given fields of one document. Fields set to `undefined` are deleted. With `create`,
   * the document must not exist yet; otherwise it must.
   */
  async writeDocument(
    docId: string,
    fields: Record<string, unknown>,
    options: { create?: boolean } = {},
  ): Promise<void> {
    const create = options.create === true;
    const url = new URL(this.inventoryUrl(docId));
    for (const key of Object.keys(fields))
      url.searchParams.append("updateMask.fieldPaths", fieldPath(key));
    const before = this.loaded.get(docId);
    if (create) url.searchParams.set("currentDocument.exists", "false");
    else if (before?.updateTime)
      url.searchParams.set("currentDocument.updateTime", before.updateTime);
    else url.searchParams.set("currentDocument.exists", "true");
    const encoded = Object.fromEntries(
      Object.entries(fields)
        .filter(([, value]) => value !== undefined)
        .map(([k, v]) => [k, encodeLike(v, before?.fields[k])]),
    );
    let response: Response;
    try {
      response = await this.request(url.toString(), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fields: encoded }),
      });
    } catch (error) {
      if (isWriteConflict(error)) throw conflictError(create);
      throw error;
    }
    // Keep a later write to this document in step with what was just saved.
    const saved = (await response.json().catch(() => ({}))) as { updateTime?: string };
    const merged = { ...before?.fields, ...encoded };
    for (const key of Object.keys(fields)) if (fields[key] === undefined) delete merged[key];
    this.loaded.set(docId, { updateTime: saved.updateTime, fields: merged });
  }
}
