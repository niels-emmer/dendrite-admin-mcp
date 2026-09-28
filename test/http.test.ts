import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { DendriteClient } from "../src/dendriteClient.js";
import { startHttpServer } from "../src/transports/http.js";

const AUTH_TOKEN = "test-mcp-token-123";

const client = new DendriteClient({
  baseUrl: "http://127.0.0.1:1", // never reached by these tests
  adminToken: "admin-token",
});

let server: Server;
let baseUrl: string;

before(async () => {
  process.env.MCP_AUTH_TOKEN = AUTH_TOKEN;
  process.env.MCP_HTTP_HOST = "127.0.0.1";
  process.env.MCP_HTTP_PORT = "0";

  server = await startHttpServer(client, {
    baseUrl: "http://127.0.0.1:1",
    adminToken: "admin-token",
  });
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(() => {
  server.close();
});

function mcpRequest(body: unknown, token?: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (token !== undefined) headers.Authorization = `Bearer ${token}`;
  return fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

/**
 * The Streamable HTTP transport responds with SSE by default (the SDK's
 * content negotiation streams when the client accepts text/event-stream).
 * Parse the `data:` lines out of the event stream.
 */
function parseSse(text: string): unknown[] {
  const messages: unknown[] = [];
  for (const block of text.split("\n\n")) {
    const data = block
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("\n");
    if (data) messages.push(JSON.parse(data));
  }
  return messages;
}

interface JsonRpcError {
  error: { code: number; message: string };
}

interface JsonRpcResult {
  jsonrpc: string;
  id: number;
  result: {
    serverInfo?: { name: string };
    tools?: Array<{ name: string }>;
  };
}

test("GET /healthz returns 200 without auth", async () => {
  const res = await fetch(`${baseUrl}/healthz`);
  assert.equal(res.status, 200);
  assert.equal(await res.text(), "ok");
});

test("POST /mcp without token returns 401", async () => {
  const res = await mcpRequest({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
  assert.equal(res.status, 401);
  const body = await json<JsonRpcError>(res);
  assert.equal(body.error.code, -32001);
});

test("POST /mcp with wrong token returns 401", async () => {
  const res = await mcpRequest(
    { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
    "wrong-token",
  );
  assert.equal(res.status, 401);
});

test("POST /mcp with correct token handles initialize", async () => {
  const res = await mcpRequest(
    {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "test", version: "0" },
      },
    },
    AUTH_TOKEN,
  );
  assert.equal(res.status, 200);
  const body = parseSse(await res.text())[0] as JsonRpcResult;
  assert.equal(body.jsonrpc, "2.0");
  assert.equal(body.id, 1);
  assert.equal(body.result.serverInfo?.name, "dendrite-admin-mcp");
});

test("tools/list returns all 15 registered tools", async () => {
  const res = await mcpRequest(
    { jsonrpc: "2.0", id: 2, method: "tools/list" },
    AUTH_TOKEN,
  );
  assert.equal(res.status, 200);
  const body = parseSse(await res.text())[0] as JsonRpcResult;
  const names = (body.result.tools ?? []).map((t) => t.name).sort();
  assert.deepEqual(names, [
    "create_registration_token",
    "delete_registration_token",
    "download_room_state",
    "evacuate_room",
    "evacuate_user",
    "fulltext_reindex",
    "get_registration_token",
    "list_registration_tokens",
    "purge_room",
    "refresh_devices",
    "register_user",
    "reset_password",
    "send_server_notice",
    "update_registration_token",
    "whois",
  ]);
});

test("GET /mcp with auth returns 405", async () => {
  const res = await fetch(`${baseUrl}/mcp`, {
    headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
  });
  assert.equal(res.status, 405);
});

test("GET /mcp without auth returns 401 (auth precedes method check)", async () => {
  const res = await fetch(`${baseUrl}/mcp`);
  assert.equal(res.status, 401);
});