import { GlobalRegistrator } from "@happy-dom/global-registrator";

const nativeFetch = globalThis.fetch;
const NativeRequest = globalThis.Request;
const NativeResponse = globalThis.Response;
const NativeHeaders = globalThis.Headers;
const NativeFormData = globalThis.FormData;

GlobalRegistrator.register();

// Restore Bun's native Fetch primitives (Happy DOM's Fetch blocks forbidden headers, and Happy DOM FormData breaks Bun Request.formData parsing)
globalThis.fetch = nativeFetch;
globalThis.Request = NativeRequest;
globalThis.Response = NativeResponse;
globalThis.Headers = NativeHeaders;
globalThis.FormData = NativeFormData;

if (typeof window !== "undefined") {
  window.fetch = nativeFetch;
  window.Request = NativeRequest;
  window.Response = NativeResponse;
  window.Headers = NativeHeaders;
  window.FormData = NativeFormData;
}

// The site downloads one language at a time; tests exercise all of them, so register every
// catalogue up front (after Happy DOM, because the i18n module reads the saved language).
const { registerCatalogue } = await import("../src/lib/i18n");
const [{ de }, { es }, { fr }, { nl }] = await Promise.all([
  import("../src/lib/i18n/de"),
  import("../src/lib/i18n/es"),
  import("../src/lib/i18n/fr"),
  import("../src/lib/i18n/nl"),
]);
registerCatalogue("de", de);
registerCatalogue("es", es);
registerCatalogue("fr", fr);
registerCatalogue("nl", nl);
