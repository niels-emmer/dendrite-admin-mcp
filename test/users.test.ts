import { test } from "node:test";
import assert from "node:assert/strict";
import { computeRegistrationMac, registerUser } from "../src/tools/users.js";
import type { DendriteClient } from "../src/dendriteClient.js";

// Vectors computed independently with `openssl dgst -sha1 -hmac`:
//   printf 'nonce123\0alice\0s3cret\0notadmin' | openssl dgst -sha1 -hmac 'sharedsecret'
//   printf 'abc\0bob\0pw\0admin' | openssl dgst -sha1 -hmac 'sekret'
test("computeRegistrationMac matches independent HMAC-SHA1 vectors", () => {
  assert.equal(
    computeRegistrationMac("nonce123", "alice", "s3cret", false, "sharedsecret"),
    "9aaf8b3ff8807ba93eb728f35ba97321bdadcc7c",
  );
  assert.equal(
    computeRegistrationMac("abc", "bob", "pw", true, "sekret"),
    "18d266856e21f988058d146371e21268cdcfcfce",
  );
});

test("computeRegistrationMac uses the admin flag in the MAC input", () => {
  const adminMac = computeRegistrationMac("n", "u", "p", true, "s");
  const notAdminMac = computeRegistrationMac("n", "u", "p", false, "s");
  assert.notEqual(adminMac, notAdminMac);
});

test("registerUser performs nonce GET then POST with computed MAC", async () => {
  const calls: Array<{ method: string; path: string; options: Record<string, unknown> }> = [];
  const fakeClient = {
    request: async (method: string, path: string, options: Record<string, unknown> = {}) => {
      calls.push({ method, path, options });
      if (method === "GET") return { nonce: "nonce123" };
      return { success: true };
    },
  } as unknown as DendriteClient;

  const result = await registerUser(fakeClient, { baseUrl: "x", adminToken: "t", registrationSharedSecret: "sharedsecret" }, {
    username: "alice",
    password: "s3cret",
    admin: false,
    displayname: "Alice",
  });

  assert.deepEqual(result, { success: true });
  assert.equal(calls.length, 2);

  const [getCall, postCall] = calls;
  assert.equal(getCall.method, "GET");
  assert.equal(getCall.path, "/_synapse/admin/v1/register");
  assert.equal(getCall.options.auth, false);

  assert.equal(postCall.method, "POST");
  assert.equal(postCall.path, "/_synapse/admin/v1/register");
  assert.equal(postCall.options.auth, false);
  const body = postCall.options.body as Record<string, unknown>;
  assert.equal(body.nonce, "nonce123");
  assert.equal(body.username, "alice");
  assert.equal(body.password, "s3cret");
  assert.equal(body.admin, false);
  assert.equal(body.displayname, "Alice");
  assert.equal(body.mac, "9aaf8b3ff8807ba93eb728f35ba97321bdadcc7c");
});

test("registerUser rejects when shared secret is not configured", async () => {
  const fakeClient = {
    request: async () => {
      throw new Error("should not be called");
    },
  } as unknown as DendriteClient;

  await assert.rejects(
    () =>
      registerUser(fakeClient, { baseUrl: "x", adminToken: "t" }, {
        username: "alice",
        password: "p",
        admin: false,
      }),
    /DENDRITE_REGISTRATION_SHARED_SECRET/,
  );
});