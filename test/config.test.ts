import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../src/config.js";

const KEYS = [
  "DENDRITE_BASE_URL",
  "DENDRITE_ADMIN_TOKEN",
  "DENDRITE_REGISTRATION_SHARED_SECRET",
] as const;

const ORIGINAL: Record<string, string | undefined> = {};
for (const k of KEYS) ORIGINAL[k] = process.env[k];

afterEach(() => {
  for (const k of KEYS) {
    if (ORIGINAL[k] === undefined) delete process.env[k];
    else process.env[k] = ORIGINAL[k];
  }
});

function setEnv(vars: Record<string, string | undefined>) {
  for (const k of KEYS) {
    if (vars[k] === undefined) delete process.env[k];
    else process.env[k] = vars[k];
  }
}

test("loadConfig returns all values when env vars are set", () => {
  setEnv({
    DENDRITE_BASE_URL: "https://matrix.example.com",
    DENDRITE_ADMIN_TOKEN: "s3cret-token",
    DENDRITE_REGISTRATION_SHARED_SECRET: "reg-secret",
  });

  const config = loadConfig();
  assert.equal(config.baseUrl, "https://matrix.example.com");
  assert.equal(config.adminToken, "s3cret-token");
  assert.equal(config.registrationSharedSecret, "reg-secret");
});

test("loadConfig strips trailing slashes from baseUrl", () => {
  setEnv({
    DENDRITE_BASE_URL: "https://matrix.example.com///",
    DENDRITE_ADMIN_TOKEN: "t",
  });

  assert.equal(loadConfig().baseUrl, "https://matrix.example.com");
});

test("loadConfig leaves registrationSharedSecret undefined when unset", () => {
  setEnv({
    DENDRITE_BASE_URL: "https://matrix.example.com",
    DENDRITE_ADMIN_TOKEN: "t",
  });

  assert.equal(loadConfig().registrationSharedSecret, undefined);
});

test("loadConfig throws when DENDRITE_BASE_URL is missing", () => {
  setEnv({ DENDRITE_BASE_URL: undefined, DENDRITE_ADMIN_TOKEN: "t" });
  assert.throws(() => loadConfig(), /DENDRITE_BASE_URL/);
});

test("loadConfig throws when DENDRITE_ADMIN_TOKEN is missing", () => {
  setEnv({ DENDRITE_BASE_URL: "https://matrix.example.com", DENDRITE_ADMIN_TOKEN: undefined });
  assert.throws(() => loadConfig(), /DENDRITE_ADMIN_TOKEN/);
});

test("loadConfig throws when DENDRITE_ADMIN_TOKEN is empty string", () => {
  setEnv({ DENDRITE_BASE_URL: "https://matrix.example.com", DENDRITE_ADMIN_TOKEN: "" });
  assert.throws(() => loadConfig(), /DENDRITE_ADMIN_TOKEN/);
});