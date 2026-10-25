import { z } from "../../zod";
import { SpoolmanError, type SpoolmanConnection } from "./connection";
import {
  ExtraFieldSchema,
  FilamentSchema,
  HealthSchema,
  InfoSchema,
  SpoolSchema,
  VendorSchema,
  type FilamentParameters,
  type SpoolmanEntity,
  type SpoolmanFilament,
  type SpoolmanInfo,
  type SpoolmanSpool,
  type SpoolmanVendor,
  type SpoolParameters,
  type VendorParameters,
} from "./schema";
import {
  HttpSpoolmanTransport,
  type FetchLike,
  type RequestOptions,
  type SpoolmanTransport,
} from "./transport";

export {
  SpoolmanError,
  normalizeBaseUrl,
  isLocalHostname,
  needsLocalNetworkFlag,
} from "./connection";
export type { SpoolmanConnection, SpoolmanErrorKind } from "./connection";
export type { SpoolmanTransport } from "./transport";

const PAGE_SIZE = 1000;

export class SpoolmanClient {
  readonly baseUrl: URL;
  private readonly transport: SpoolmanTransport;

  constructor(
    connection: SpoolmanConnection,
    fetchImpl?: FetchLike,
    pageProtocol: string | undefined = globalThis.location?.protocol,
    transport?: SpoolmanTransport,
  ) {
    this.transport = transport ?? new HttpSpoolmanTransport(connection, fetchImpl, pageProtocol);
    this.baseUrl = this.transport.baseUrl;
  }

  apiUrl(path: string, query?: RequestOptions<unknown>["query"]): string {
    return this.transport.apiUrl(path, query);
  }

  requestInit(init: RequestInit = {}): RequestInit {
    return this.transport.requestInit(init);
  }

  /** Reads every page of a list endpoint. Spoolman pages with `limit` and `offset`. */
  private async listAll<T extends { id: number }>(
    path: string,
    schema: z.ZodType<T>,
    query: RequestOptions<unknown>["query"] = {},
  ): Promise<T[]> {
    const items: T[] = [];
    const seenIds = new Set<number>();
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const page = await this.transport.request("GET", path, {
        query: { ...query, limit: PAGE_SIZE, offset },
        schema: z.array(schema),
      });
      for (const item of page) {
        if (seenIds.has(item.id))
          throw new SpoolmanError(
            "parse",
            `Spoolman returned duplicate ${path} ID ${item.id} while paging inventory. Reload the inventory; the server may be ignoring pagination or changing records during the request.`,
          );
        seenIds.add(item.id);
        items.push(item);
      }
      if (page.length < PAGE_SIZE) return items;
    }
  }

  info(): Promise<SpoolmanInfo> {
    return this.transport.request("GET", "/info", { schema: InfoSchema });
  }

  health(): Promise<{ status: string }> {
    return this.transport.request("GET", "/health", { schema: HealthSchema });
  }

  listSpools(options: { allowArchived?: boolean } = {}): Promise<SpoolmanSpool[]> {
    return this.listAll("/spool", SpoolSchema, { allow_archived: options.allowArchived ?? true });
  }

  listFilaments(): Promise<SpoolmanFilament[]> {
    return this.listAll("/filament", FilamentSchema);
  }

  listVendors(): Promise<SpoolmanVendor[]> {
    return this.listAll("/vendor", VendorSchema);
  }

  createVendor(params: VendorParameters): Promise<SpoolmanVendor> {
    return this.transport.request("POST", "/vendor", { body: params, schema: VendorSchema });
  }

  createFilament(params: FilamentParameters): Promise<SpoolmanFilament> {
    return this.transport.request("POST", "/filament", { body: params, schema: FilamentSchema });
  }

  updateFilament(id: number, params: Partial<FilamentParameters>): Promise<SpoolmanFilament> {
    return this.transport.request("PATCH", `/filament/${id}`, {
      body: params,
      schema: FilamentSchema,
    });
  }

  createSpool(params: SpoolParameters): Promise<SpoolmanSpool> {
    return this.transport.request("POST", "/spool", { body: params, schema: SpoolSchema });
  }

  updateSpool(id: number, params: Partial<SpoolParameters>): Promise<SpoolmanSpool> {
    return this.transport.request("PATCH", `/spool/${id}`, { body: params, schema: SpoolSchema });
  }

  /**
   * Records filament drawn from a spool. Additive: Spoolman decrements the remaining weight itself,
   * so this does not race other clients the way PATCHing an absolute weight would.
   */
  useSpool(
    id: number,
    usage: { weightGrams: number } | { lengthMm: number },
  ): Promise<SpoolmanSpool> {
    const body =
      "weightGrams" in usage ? { use_weight: usage.weightGrams } : { use_length: usage.lengthMm };
    return this.transport.request("PUT", `/spool/${id}/use`, { body, schema: SpoolSchema });
  }

  listExtraFields(entity: SpoolmanEntity): Promise<Array<{ key: string }>> {
    return this.transport.request("GET", `/field/${entity}`, { schema: z.array(ExtraFieldSchema) });
  }

  /**
   * Registers text extra fields that are missing. Spoolman rejects writes that use an unregistered
   * extra key with "Unknown extra field".
   */
  async ensureExtraFields(
    entity: SpoolmanEntity,
    fields: Record<string, string>,
  ): Promise<string[]> {
    const existing = new Set((await this.listExtraFields(entity)).map((field) => field.key));
    const created: string[] = [];
    for (const [key, name] of Object.entries(fields)) {
      if (existing.has(key)) continue;
      await this.transport.send("POST", `/field/${entity}/${encodeURIComponent(key)}`, {
        body: { name, field_type: "text" },
      });
      created.push(key);
    }
    return created;
  }
}
