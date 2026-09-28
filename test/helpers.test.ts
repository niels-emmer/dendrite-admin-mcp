import { test } from "node:test";
import assert from "node:assert/strict";
import { ok, run } from "../src/tools/helpers.js";
import { DendriteApiError } from "../src/dendriteClient.js";

test("ok returns a string value verbatim", () => {
  const result = ok("hello");
  assert.equal(result.isError, undefined);
  assert.equal(result.content[0].type, "text");
  assert.equal(result.content[0].text, "hello");
});

test("ok pretty-prints non-string values as JSON", () => {
  const result = ok({ a: 1, b: [2, 3] });
  assert.equal(result.content[0].text, JSON.stringify({ a: 1, b: [2, 3] }, null, 2));
});

test("run returns ok result on success", async () => {
  const result = await run(async () => ({ done: true }));
  assert.equal(result.isError, undefined);
  assert.match(result.content[0].text, /"done": true/);
});

test("run converts DendriteApiError into isError result with status message", async () => {
  const result = await run(async () => {
    throw new DendriteApiError(404, { errcode: "M_NOT_FOUND" });
  });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /404/);
  assert.match(result.content[0].text, /M_NOT_FOUND/);
});

test("run converts generic errors into isError result", async () => {
  const result = await run(async () => {
    throw new Error("boom");
  });
  assert.equal(result.isError, true);
  assert.equal(result.content[0].text, "boom");
});

test("run converts non-Error throws into isError result", async () => {
  const result = await run(async () => {
    throw "string failure";
  });
  assert.equal(result.isError, true);
  assert.equal(result.content[0].text, "string failure");
});