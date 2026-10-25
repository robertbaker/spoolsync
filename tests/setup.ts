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
