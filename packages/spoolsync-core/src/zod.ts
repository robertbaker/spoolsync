import { z } from "zod";

// Zod 4 probes `new Function` to decide whether to compile schemas. The site's CSP forbids eval, so
// the probe only logs a violation on every page; skip it.
z.config({ jitless: true });

export { z };
