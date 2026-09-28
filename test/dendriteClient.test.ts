import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { DendriteApiError, DendriteClient } from "../src/dendriteClient.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function mockFetch(impl: (url: string, init?: RequestInit) => Promise<Response>) {
  globalThis.fetch = impl as typeof fetch;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const client = new DendriteClient({
  baseUrl: "https://matrix.example.com",
  adminToken: "admin-token",
});

test("request attaches the admin bearer token by default", async () => {
  let seenUrl = "";
  let seenInit: RequestInit | undefined;
  mockFetch(async (url, init) => {
    seenUrl = String(url);
    seenInit = init;
    return jsonResponse(200, { ok: true });
  });

  await client.request("GET", "/_dendrite/admin/registrationTokens");

  assert.equal(seenUrl, "https://matrix.example.com/_dendrite/admin/registrationTokens");
  assert.deepEqual(seenInit?.headers, { Authorization: "Bearer admin-token" });
});

test("request omits the bearer token when auth: false", async () => {
  let seenInit: RequestInit | undefined;
  mockFetch(async (_url, init) => {
    seenInit = init;
    return jsonResponse(200, { nonce: "abc" });
  });

  await client.request("GET", "/_synapse/admin/v1/register", { auth: false });

  assert.deepEqual(seenInit?.headers, {});
});

test("request serializes body as JSON with Content-Type header", async () => {
  let seenInit: RequestInit | undefined;
  mockFetch(async (_url, init) => {
    seenInit = init;
    return jsonResponse(200, {});
  });

  await client.request("POST", "/_dendrite/admin/resetPassword/%40alice%3Aexample.com", {
    body: { password: "newpass", logout_devices: true },
  });

  assert.equal(seenInit?.method, "POST");
  assert.equal(seenInit?.body, JSON.stringify({ password: "newpass", logout_devices: true }));
  assert.deepEqual(seenInit?.headers, {
    Authorization: "Bearer admin-token",
    "Content-Type": "application/json",
  });
});

test("request returns parsed JSON on 2xx", async () => {
  mockFetch(async () => jsonResponse(200, { tokens: [{ token: "T1" }] }));

  const result = await client.request("GET", "/_dendrite/admin/registrationTokens");
  assert.deepEqual(result, { tokens: [{ token: "T1" }] });
});

test("request returns {} on 2xx with empty body", async () => {
  mockFetch(async () => new Response("", { status: 200 }));

  const result = await client.request("GET", "/_dendrite/admin/registrationTokens");
  assert.deepEqual(result, {});
});

test("request throws DendriteApiError with status and parsed body on non-2xx", async () => {
  mockFetch(async () => jsonResponse(403, { errcode: "M_FORBIDDEN", error: "nope" }));

  await assert.rejects(
    () => client.request("GET", "/_dendrite/admin/registrationTokens"),
    (err: unknown) => {
      assert.ok(err instanceof DendriteApiError);
      assert.equal(err.status, 403);
      assert.deepEqual(err.body, { errcode: "M_FORBIDDEN", error: "nope" });
      assert.match(err.message, /403/);
      return true;
    },
  );
});

test("request throws DendriteApiError with empty body on non-2xx without body", async () => {
  mockFetch(async () => new Response("", { status: 500 }));

  await assert.rejects(
    () => client.request("GET", "/_dendrite/admin/registrationTokens"),
    (err: unknown) => err instanceof DendriteApiError && err.status === 500,
  );
});