import { z } from "zod";

// Zod's fast path compiles each schema with `new Function`, which the Content-Security-Policy
// blocks (R-19). Even a probe that is caught is reported as a violation, so the probe is switched off
// here, before any schema is built. Every module with a schema imports `z` from this file, so the
// order the modules load in cannot matter (R-23).
z.config({ jitless: true });

export { z };
