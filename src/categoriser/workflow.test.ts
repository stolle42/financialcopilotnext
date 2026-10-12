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
const chain = () => nodeOfType("@n8n/n8n-nodes-langchain.chainLlm");
const model = () => nodeOfType("@n8n/n8n-nodes-langchain.lmChatAnthropic");
const parser = () => nodeOfType("@n8n/n8n-nodes-langchain.outputParserStructured");
const respond = () => nodeOfType("n8n-nodes-base.respondToWebhook");

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

  test("answers through a Respond to Webhook node, not before the workflow finishes", () => {
    expect(webhook().parameters.responseMode).toBe("responseNode");
    expect(targets(webhook(), "main")).toEqual([chain().name]);
    expect(targets(chain(), "main")).toEqual([respond().name]);
  });

  test("returns the parsed answer itself, not the chain's whole item", () => {
    expect(respond().parameters).toMatchObject({ respondWith: "json" });
    expect(String(respond().parameters.responseBody)).toContain("$json.output");
  });

  test("asks claude-opus-5-5 with adaptive thinking, room for a long answer, and no sampling options (R-23)", () => {
    expect(targets(model(), "ai_languageModel")).toEqual([chain().name]);
    const parameters = model().parameters as {
      model: { value: string };
      options: Record<string, unknown>;
    };
    expect(parameters.model.value).toBe("claude-opus-5-5");
    expect(parameters.options).toMatchObject({ thinkingMode: "adaptive", effort: "low" });
    expect(parameters.options.maxTokensToSample).toBeGreaterThanOrEqual(16000);
    for (const option of ["temperature", "topK", "topP"]) {
      expect(parameters.options).not.toHaveProperty(option);
    }
  });

  test("requires the answer's shape through its output parser", () => {
    expect(chain().parameters.hasOutputParser).toBe(true);
    expect(targets(parser(), "ai_outputParser")).toEqual([chain().name]);
    expect(parser().parameters.schemaType).toBe("manual");
    const schema = JSON.parse(String(parser().parameters.inputSchema)) as {
      required: string[];
      properties: {
        suggestions: {
          type: string;
          items: { required: string[]; properties: Record<string, { type: unknown }> };
        };
      };
    };
    expect(schema.required).toEqual(["suggestions"]);
    expect(schema.properties.suggestions.type).toBe("array");
    const item = schema.properties.suggestions.items;
    expect([...item.required].sort()).toEqual(["category", "rowNumber"]);
    expect(item.properties.rowNumber!.type).toBe("integer");
    expect(item.properties.category!.type).toEqual(["string", "null"]);
  });

  test("holds no API key, only a reference to n8n's credential", () => {
    expect(file).not.toMatch(/sk-ant-/);
    expect(model()).not.toHaveProperty("parameters.apiKey");
  });
});
