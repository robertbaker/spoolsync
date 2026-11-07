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
/** Pages requested at once once the total is known; small, so a home server is not flooded. */
const PAGE_CONCURRENCY = 3;

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
    outer?: AbortSignal,
  ): Promise<T[]> {
    const items: T[] = [];
    const seenIds = new Set<number>();
    const pageSchema = z.array(schema);
    const absorb = (page: T[]): void => {
      for (const item of page) {
        if (seenIds.has(item.id))
          throw new SpoolmanError(
            "parse",
            `Spoolman returned duplicate ${path} ID ${item.id} while paging inventory. Reload the inventory; the server may be ignoring pagination or changing records during the request.`,
          );
        seenIds.add(item.id);
        items.push(item);
      }
    };
    const fetchPage = async (offset: number, inner?: AbortSignal) => {
      const signal = outer && inner ? AbortSignal.any([outer, inner]) : (outer ?? inner);
      const options = {
        query: { ...query, limit: PAGE_SIZE, offset },
        schema: pageSchema,
        ...(signal ? { signal } : {}),
      };
      if (this.transport.requestPage) return this.transport.requestPage("GET", path, options);
      return { data: await this.transport.request("GET", path, options) };
    };

    let offset = 0;
    const first = await fetchPage(offset);
    absorb(first.data);
    offset += PAGE_SIZE;
    if (first.data.length < PAGE_SIZE) return items;

    // The first page says how many records there are, so the remaining pages can be requested a
    // few at a time instead of one round trip each. They are still absorbed in offset order and
    // stop at the first short page, so the result and the duplicate check match one-by-one paging.
    // Without a readable total (no header, or CORS does not expose it) paging stays serial below.
    const total = first.totalCount;
    if (first.data.length === PAGE_SIZE && total !== undefined && total > PAGE_SIZE) {
      const offsets: number[] = [];
      for (let next = offset; next < total; next += PAGE_SIZE) offsets.push(next);
      const pages: T[][] = Array.from<T[]>({ length: offsets.length });
      const stop = new AbortController();
      let cursor = 0;
      try {
        await Promise.all(
          Array.from({ length: Math.min(PAGE_CONCURRENCY, offsets.length) }, async () => {
            while (cursor < offsets.length) {
              const index = cursor++;
              pages[index] = (await fetchPage(offsets[index]!, stop.signal)).data;
            }
          }),
        );
      } catch (error) {
        stop.abort();
        throw error;
      }
      for (const page of pages) {
        absorb(page);
        offset += PAGE_SIZE;
        if (page.length < PAGE_SIZE) return items;
      }
    }

    // The total is only a hint for how many pages to ask for at once. A full last page still means
    // there may be more (records added meanwhile, or a low count), so carry on one at a time.
    for (; ; offset += PAGE_SIZE) {
      const page = (await fetchPage(offset)).data;
      absorb(page);
      if (page.length < PAGE_SIZE) return items;
    }
  }

  info(): Promise<SpoolmanInfo> {
    return this.transport.request("GET", "/info", { schema: InfoSchema });
  }

  health(): Promise<{ status: string }> {
    return this.transport.request("GET", "/health", { schema: HealthSchema });
  }

  listSpools(
    options: { allowArchived?: boolean; signal?: AbortSignal } = {},
  ): Promise<SpoolmanSpool[]> {
    return this.listAll(
      "/spool",
      SpoolSchema,
      { allow_archived: options.allowArchived ?? true },
      options.signal,
    );
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
