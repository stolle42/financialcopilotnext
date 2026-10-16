import type { IncomingMessage, ServerResponse } from "node:http";
import { loadEnv, type Connect, type Plugin } from "vite";
import { AI_PATH } from "../src/ai/path.ts";

// The route the local server adds for the AI features: it passes each request's body on to
// OpenAI's Responses API with the key from .env, which never reaches the app (contracts/ai.md,
// route; R-24). The answer streams back as it arrives (R-26).

export const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

/** The largest body passed on; a question with 13 months of a busy ledger stays well below. */
export const MAX_BODY_BYTES = 2 * 1024 * 1024;

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

/**
 * Only the app itself may use the route: a POST from this computer whose Origin, when the browser
 * sends one, is the app's own. Anything else could spend the owner's credit (R-24).
 */
function allowed(req: IncomingMessage): boolean {
  if (req.method !== "POST") return false;
  if (!LOOPBACK.has(req.socket.remoteAddress ?? "")) return false;
  const origin = req.headers.origin;
  return origin === undefined || origin === `http://${req.headers.host}`;
}

/** The request's body, or null once it grows past the limit. Reads it to the end either way. */
function readBody(req: IncomingMessage): Promise<Buffer | null> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size <= MAX_BODY_BYTES) chunks.push(chunk);
    });
    req.on("end", () => resolve(size > MAX_BODY_BYTES ? null : Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function refuse(res: ServerResponse, status: number) {
  res.statusCode = status;
  res.end();
}

/** The route's handler, which posts with `key` through `fetchImpl` (the global one by default). */
export function forwardToOpenAi(
  key: string,
  fetchImpl: typeof fetch = (input, init) => globalThis.fetch(input, init),
): Connect.NextHandleFunction {
  return (req, res) => {
    if (!allowed(req)) return refuse(res, 403);

    const upstream = new AbortController();
    // Closing the browser's request, as Stop does, cancels OpenAI's.
    res.on("close", () => {
      if (!res.writableEnded) upstream.abort();
    });

    void (async () => {
      let body: Buffer | null;
      try {
        body = await readBody(req);
      } catch {
        return refuse(res, 400);
      }
      if (!body) return refuse(res, 413);

      let answer: Response;
      try {
        answer = await fetchImpl(OPENAI_RESPONSES_URL, {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          // A copy as a plain byte array, which fetch accepts as a body.
          body: new Uint8Array(body),
          signal: upstream.signal,
        });
      } catch {
        if (!upstream.signal.aborted) refuse(res, 502);
        return;
      }

      res.statusCode = answer.status;
      const type = answer.headers.get("content-type");
      if (type) res.setHeader("Content-Type", type);
      try {
        // Each part goes on as it arrives, so a streamed answer streams.
        for await (const part of answer.body ?? []) res.write(part);
      } catch {
        // OpenAI broke off, or the browser left; the app sees the events end early.
      }
      res.end();
    })();
  };
}

/** A Vite plugin that adds the route to the dev server and to `vite preview` when a key is set. */
export function aiRoute(): Plugin {
  let key = "";
  return {
    name: "ai-route",
    apply: "serve",
    configResolved(config) {
      const envDir = typeof config.envDir === "string" ? config.envDir : config.root;
      key = loadEnv(config.mode, envDir, "OPENAI_").OPENAI_API_KEY ?? "";
    },
    configureServer(server) {
      if (key) server.middlewares.use(AI_PATH, forwardToOpenAi(key));
    },
    configurePreviewServer(server) {
      if (key) server.middlewares.use(AI_PATH, forwardToOpenAi(key));
    },
  };
}
