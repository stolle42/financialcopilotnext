import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import {
  createServer,
  request,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type Server,
} from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Connect } from "vite";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { AI_PATH } from "../src/ai/path";
import { MAX_BODY_BYTES, OPENAI_RESPONSES_URL, aiRoute, forwardToOpenAi } from "./aiRoute";

// contracts/ai.md, route; R-24: the route the local server adds, which passes the AI features'
// requests on to OpenAI with the key from .env.

const openAi = vi.fn<typeof fetch>();
let server: Server | undefined;

beforeEach(() => {
  openAi.mockReset();
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await new Promise((resolve) => (server ? server.close(resolve) : resolve(undefined)));
  server = undefined;
});

/**
 * Serves `handler` on loopback, as Vite mounts it at the AI path. `remoteAddress`, when given,
 * pretends the caller is another computer.
 */
async function serve(handler: Connect.NextHandleFunction, remoteAddress?: string) {
  server = createServer((req, res) => {
    if (remoteAddress) Object.defineProperty(req.socket, "remoteAddress", { value: remoteAddress });
    handler(req, res, () => {
      res.statusCode = 404;
      res.end();
    });
  });
  server.listen(0, "127.0.0.1");
  await new Promise((resolve) => server!.once("listening", resolve));
  return (server.address() as AddressInfo).port;
}

interface Answer {
  status: number;
  headers: IncomingHttpHeaders;
  body: string;
}

/** Sends one request to the served route, with exactly the headers given. */
function send(
  port: number,
  {
    method = "POST",
    headers = {},
    body,
  }: { method?: string; headers?: Record<string, string>; body?: string | Buffer },
): Promise<Answer> {
  return new Promise((resolve, reject) => {
    const sent = request({ host: "127.0.0.1", port, path: AI_PATH, method, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () =>
        resolve({
          status: res.statusCode ?? 0,
          headers: res.headers,
          body: Buffer.concat(chunks).toString("utf8"),
        }),
      );
    });
    sent.on("error", reject);
    sent.end(body);
  });
}

const appOrigin = (port: number) => `http://127.0.0.1:${port}`;
const question = JSON.stringify({ model: "gpt-6.1-sol", store: false, input: "Answer with OK." });

const bodyText = (body: BodyInit | null | undefined) =>
  typeof body === "string" ? body : Buffer.from(body as Uint8Array).toString("utf8");

const openAiAnswer = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("forwardToOpenAi: what the route passes on (contracts/ai.md, route)", () => {
  test("posts the body of a POST from the app's origin unchanged to OpenAI's Responses API, with only the key and the content type", async () => {
    openAi.mockResolvedValue(openAiAnswer({ status: "completed" }));
    const port = await serve(forwardToOpenAi("sk-test", openAi));

    await send(port, {
      headers: {
        "Content-Type": "application/json",
        Origin: appOrigin(port),
        Cookie: "session=secret",
        Referer: `${appOrigin(port)}/#/insights`,
      },
      body: question,
    });

    expect(openAi).toHaveBeenCalledTimes(1);
    const [url, init] = openAi.mock.calls[0]!;
    expect(String(url)).toBe(OPENAI_RESPONSES_URL);
    expect(OPENAI_RESPONSES_URL).toBe("https://api.openai.com/v1/responses");
    expect(init?.method).toBe("POST");
    const headers = new Headers(init?.headers);
    expect([...headers.keys()].sort()).toEqual(["authorization", "content-type"]);
    expect(headers.get("authorization")).toBe("Bearer sk-test");
    expect(headers.get("content-type")).toBe("application/json");
    expect(bodyText(init?.body)).toBe(question);
  });

  test("passes on a POST without an Origin, as from curl on this computer", async () => {
    openAi.mockResolvedValue(openAiAnswer({ status: "completed" }));
    const port = await serve(forwardToOpenAi("sk-test", openAi));

    const answer = await send(port, {
      headers: { "Content-Type": "application/json" },
      body: question,
    });

    expect(answer.status).toBe(200);
    expect(openAi).toHaveBeenCalledTimes(1);
  });

  test.each([
    [200, { status: "completed", output: [] }],
    [401, { error: { message: "Incorrect API key provided." } }],
    [429, { error: { message: "You exceeded your current quota." } }],
  ])("returns OpenAI's status %i, content type and body unchanged", async (status, body) => {
    openAi.mockResolvedValue(openAiAnswer(body, status));
    const port = await serve(forwardToOpenAi("sk-test", openAi));

    const answer = await send(port, {
      headers: { "Content-Type": "application/json", Origin: appOrigin(port) },
      body: question,
    });

    expect(answer.status).toBe(status);
    expect(answer.headers["content-type"]).toBe("application/json");
    expect(JSON.parse(answer.body)).toEqual(body);
  });

  test("passes OpenAI's events on as they arrive, the first before OpenAI sends its last (R-26)", async () => {
    let upstream!: ReadableStreamDefaultController<Uint8Array>;
    const events = new ReadableStream<Uint8Array>({
      start(controller) {
        upstream = controller;
      },
    });
    openAi.mockResolvedValue(
      new Response(events, { headers: { "Content-Type": "text/event-stream" } }),
    );
    const port = await serve(forwardToOpenAi("sk-test", openAi));
    const first = "event: response.created\ndata: {}\n\n";
    const last = "event: response.completed\ndata: {}\n\n";

    const received: string[] = [];
    const answer = await new Promise<IncomingMessage>((resolve, reject) => {
      const sent = request({ host: "127.0.0.1", port, path: AI_PATH, method: "POST" }, (res) => {
        res.on("data", (chunk: Buffer) => {
          received.push(chunk.toString("utf8"));
          resolve(res);
        });
      });
      sent.on("error", reject);
      sent.end(question);
      void vi
        .waitFor(() => expect(openAi).toHaveBeenCalledTimes(1))
        .then(() => upstream.enqueue(new TextEncoder().encode(first)));
    });

    expect(answer.statusCode).toBe(200);
    expect(answer.headers["content-type"]).toBe("text/event-stream");
    expect(received.join("")).toBe(first);

    const ended = new Promise((resolve) => answer.on("end", resolve));
    upstream.enqueue(new TextEncoder().encode(last));
    upstream.close();
    await ended;
    expect(received.join("")).toBe(first + last);
  });

  test("gives 502 when OpenAI cannot be reached", async () => {
    openAi.mockRejectedValue(new TypeError("fetch failed"));
    const port = await serve(forwardToOpenAi("sk-test", openAi));

    const answer = await send(port, { headers: { Origin: appOrigin(port) }, body: question });

    expect(answer.status).toBe(502);
  });

  test("cancels OpenAI's request when the browser's request closes", async () => {
    let upstream: AbortSignal | undefined;
    openAi.mockImplementation((_url, init) => {
      upstream = init?.signal ?? undefined;
      return new Promise<Response>(() => {});
    });
    const port = await serve(forwardToOpenAi("sk-test", openAi));

    const sent = request({ host: "127.0.0.1", port, path: AI_PATH, method: "POST" });
    sent.on("error", () => {});
    sent.end(question);
    await vi.waitFor(() => expect(openAi).toHaveBeenCalledTimes(1));
    sent.destroy();

    await vi.waitFor(() => expect(upstream?.aborted).toBe(true));
  });
});

describe("forwardToOpenAi: what the route refuses, sending nothing (R-24)", () => {
  test.each<[string, (port: number) => { method?: string; headers?: Record<string, string> }]>([
    ["a GET", (port) => ({ method: "GET", headers: { Origin: appOrigin(port) } })],
    ["another web page's POST", () => ({ headers: { Origin: "https://example.com" } })],
    ["another app's POST on localhost", () => ({ headers: { Origin: "http://localhost:3000" } })],
    ["a POST with the Origin null", () => ({ headers: { Origin: "null" } })],
    ["a POST with an unreadable Origin", () => ({ headers: { Origin: "not a url" } })],
  ])("gives 403 to %s", async (_, of) => {
    const port = await serve(forwardToOpenAi("sk-test", openAi));
    const { method, headers } = of(port);

    const answer = await send(port, {
      method,
      headers,
      body: method === "GET" ? undefined : question,
    });

    expect(answer.status).toBe(403);
    expect(openAi).not.toHaveBeenCalled();
  });

  test("gives 403 to a caller that is not this computer", async () => {
    const port = await serve(forwardToOpenAi("sk-test", openAi), "192.168.1.20");

    const answer = await send(port, { body: question });

    expect(answer.status).toBe(403);
    expect(openAi).not.toHaveBeenCalled();
  });

  test.each(["::1", "::ffff:127.0.0.1"])("accepts the loopback address %s", async (address) => {
    openAi.mockResolvedValue(openAiAnswer({ status: "completed" }));
    const port = await serve(forwardToOpenAi("sk-test", openAi), address);

    expect((await send(port, { body: question })).status).toBe(200);
  });

  test("gives 413 to a body over 2 MB", async () => {
    const port = await serve(forwardToOpenAi("sk-test", openAi));

    const answer = await send(port, { body: Buffer.alloc(MAX_BODY_BYTES + 1, "a") });

    expect(MAX_BODY_BYTES).toBe(2 * 1024 * 1024);
    expect(answer.status).toBe(413);
    expect(openAi).not.toHaveBeenCalled();
  });
});

describe("aiRoute: the plugin (R-24)", () => {
  let envDir: string;
  let saved: string | undefined;

  beforeEach(() => {
    envDir = mkdtempSync(join(tmpdir(), "ai-route-"));
    saved = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
  });

  afterEach(() => {
    rmSync(envDir, { recursive: true, force: true });
    if (saved === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = saved;
  });

  type Hook = "configureServer" | "configurePreviewServer";

  /** Starts the plugin as Vite does, with `env` as the content of .env, and returns `use`. */
  function start(env: string | null, hook: Hook = "configurePreviewServer") {
    if (env !== null) writeFileSync(join(envDir, ".env"), env);
    const plugin = aiRoute();
    const use = vi.fn();
    (plugin.configResolved as (config: unknown) => void)({ mode: "production", envDir });
    (plugin[hook] as (server: unknown) => void)({ middlewares: { use } });
    return use;
  }

  test("runs only in the servers, never in a build", () => {
    expect(aiRoute().apply).toBe("serve");
  });

  test.each<Hook>(["configureServer", "configurePreviewServer"])(
    "with a key in .env, %s mounts the route at the AI path",
    (hook) => {
      const use = start("OPENAI_API_KEY=sk-test\n", hook);

      expect(use).toHaveBeenCalledTimes(1);
      expect(use.mock.calls[0]![0]).toBe(AI_PATH);
      expect(use.mock.calls[0]![1]).toBeTypeOf("function");
    },
  );

  test("the mounted route posts with the key from .env", async () => {
    vi.stubGlobal("fetch", openAi);
    openAi.mockResolvedValue(openAiAnswer({ status: "completed" }));
    const use = start("OPENAI_API_KEY=sk-from-env-file\n");
    const port = await serve(use.mock.calls[0]![1] as Connect.NextHandleFunction);

    await send(port, { body: question });

    const [, init] = openAi.mock.calls[0]!;
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer sk-from-env-file");
  });

  test.each([
    ["no .env", null],
    ["no key in .env", "OTHER_SETTING=1\n"],
    ["an empty key", "OPENAI_API_KEY=\n"],
  ])("with %s, adds no route, so nothing leaves the computer", (_, env) => {
    expect(start(env)).not.toHaveBeenCalled();
  });

  test("an empty key in the environment wins over .env, as Playwright starts its preview", () => {
    process.env.OPENAI_API_KEY = "";
    expect(start("OPENAI_API_KEY=sk-test\n")).not.toHaveBeenCalled();
  });
});
