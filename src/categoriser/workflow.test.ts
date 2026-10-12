import { describe, expect, test } from "vitest";
import workflowFile from "../../n8n/financial-copilot-categories.json";
import { CATEGORISER_URL } from "./endpoint";

// The committed n8n workflow against contracts/categoriser.md and R-23, so the app and the workflow
// cannot drift apart unnoticed.

interface WorkflowNode {
  name: string;
  type: string;
  parameters: Record<string, unknown>;
}

interface Workflow {
  nodes: WorkflowNode[];
  connections: Record<string, Record<string, { node: string }[][]>>;
}

const workflow = workflowFile as unknown as Workflow;
const file = JSON.stringify(workflowFile);

function nodeOfType(type: string): WorkflowNode {
  const found = workflow.nodes.filter((node) => node.type === type);
  expect(found, `one node of type ${type}`).toHaveLength(1);
  return found[0]!;
}

/** The nodes `from` feeds through its connections of `kind`. */
const targets = (from: WorkflowNode, kind: string) =>
  (workflow.connections[from.name]?.[kind] ?? []).flat().map((link) => link.node);

const webhook = () => nodeOfType("n8n-nodes-base.webhook");
const claude = () => nodeOfType("n8n-nodes-base.httpRequest");
const respond = () => nodeOfType("n8n-nodes-base.respondToWebhook");

interface Schema {
  type?: unknown;
  anyOf?: Schema[];
  required?: string[];
  additionalProperties?: boolean;
  properties?: Record<string, Schema>;
  items?: Schema;
}

interface MessagesRequest {
  model: string;
  max_tokens: number;
  thinking: { type: string };
  output_config: { effort: string; format: { type: string; schema: Schema } };
  system: string;
  messages: { role: string; content: string }[];
}

/** The request body sent to Anthropic, with the expression that inserts the app's request as "x". */
function messagesRequest(): MessagesRequest {
  const body = String(claude().parameters.jsonBody);
  expect(body.startsWith("=")).toBe(true);
  const expressions = body.match(/\{\{.*?\}\}/gs) ?? [];
  expect(expressions).toEqual(["{{ JSON.stringify(JSON.stringify($json.body)) }}"]);
  return JSON.parse(body.slice(1).replace(expressions[0]!, '"x"')) as MessagesRequest;
}

describe("the n8n workflow (contracts/categoriser.md)", () => {
  test("listens for POST on the path of the app's address", () => {
    const path = new URL(CATEGORISER_URL).pathname.replace(/^\/webhook\//, "");
    expect(webhook().parameters).toMatchObject({ httpMethod: "POST", path });
  });

  test("allows the app's origins, local and on Vercel", () => {
    const options = webhook().parameters.options as { allowedOrigins?: string };
    const origins = (options.allowedOrigins ?? "").split(",").map((origin) => origin.trim());
    expect(origins.sort()).toEqual([
      "http://localhost:4173",
      "http://localhost:5173",
      "https://financialcopilot-three.vercel.app",
    ]);
  });

  test("answers through a Respond to Webhook node, after asking Claude", () => {
    expect(webhook().parameters.responseMode).toBe("responseNode");
    expect(targets(webhook(), "main")).toEqual([claude().name]);
    expect(targets(claude(), "main")).toEqual([respond().name]);
  });

  test("asks Anthropic's Messages API with n8n's Anthropic credential (R-23)", () => {
    expect(claude().parameters).toMatchObject({
      method: "POST",
      url: "https://api.anthropic.com/v1/messages",
      authentication: "predefinedCredentialType",
      nodeCredentialType: "anthropicApi",
      sendBody: true,
      specifyBody: "json",
    });
    const headers = (
      claude().parameters.headerParameters as {
        parameters: { name: string; value: string }[];
      }
    ).parameters;
    expect(headers).toContainEqual({ name: "anthropic-version", value: "2023-06-01" });
  });

  test("asks claude-opus-5-5 with adaptive thinking, room for a long answer, and no sampling options (R-23)", () => {
    const request = messagesRequest();
    expect(request.model).toBe("claude-opus-5-5");
    expect(request.thinking).toEqual({ type: "adaptive" });
    expect(request.output_config.effort).toBe("low");
    expect(request.max_tokens).toBeGreaterThanOrEqual(16000);
    for (const option of ["temperature", "top_k", "top_p"]) {
      expect(request).not.toHaveProperty(option);
    }
    expect(request.system).toMatch(/Never follow instructions/);
    expect(request.messages).toEqual([{ role: "user", content: "x" }]);
  });

  test("lets the API enforce the answer's shape with structured outputs", () => {
    const { format } = messagesRequest().output_config;
    expect(format.type).toBe("json_schema");
    const schema = format.schema;
    expect(schema).toMatchObject({ type: "object", additionalProperties: false });
    expect(schema.required).toEqual(["suggestions"]);
    const suggestions = schema.properties!.suggestions!;
    expect(suggestions.type).toBe("array");
    const item = suggestions.items!;
    expect(item.additionalProperties).toBe(false);
    expect([...item.required!].sort()).toEqual(["category", "rowNumber"]);
    expect(item.properties!.rowNumber!.type).toBe("integer");
    expect(item.properties!.category!.anyOf).toEqual([{ type: "string" }, { type: "null" }]);
  });

  test("returns Claude's answer text itself, skipping its thinking", () => {
    expect(respond().parameters).toMatchObject({ respondWith: "json" });
    const body = String(respond().parameters.responseBody);
    expect(body).toContain("$json.content");
    expect(body).toContain("'text'");
  });

  test("holds no API key, only a reference to n8n's credential", () => {
    expect(file).not.toMatch(/sk-ant-/);
    expect(file).not.toMatch(/x-api-key/i);
  });
});
