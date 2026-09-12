import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Client, contextFromHeaders } from "../dist/index.js";

const fixture = JSON.parse(await readFile(new URL("./fixtures/runtime.json", import.meta.url)));

test("shared contract, cache, refresh and capability config", async () => {
  let calls = 0;
  const fetch = async (input) => {
    calls++;
    const path = new URL(input).pathname;
    return new Response(JSON.stringify(path.endsWith("/endpoints/database") ? fixture.endpoint : fixture.dependencies), { status: 200, headers: { "content-type": "application/json" } });
  };
  const client = new Client({ platformEndpoint: "http://metis.internal", appId: "caller-a7x2m", appToken: "app-token", environment: fixture.environment, fetch });
  assert.equal((await client.listDependencies())[0].alias, "ui");
  await client.listDependencies();
  assert.equal(calls, 1);
  await client.listDependencies(true);
  assert.equal(calls, 2);
  assert.equal((await client.serviceEndpoint("data", "database")).port, 31001);
  assert.equal(client.model("llm.0").model, "example-chat");
  assert.deepEqual(client.objectStorage().sharedBuckets, ["shared-assets"]);
  assert.equal(contextFromHeaders(fixture.trustedHeaders).tenantId, "42");
});

test("failures are not cached", async () => {
  let calls = 0;
  const fetch = async () => new Response(JSON.stringify(++calls === 1 ? { reason: "UPSTREAM_FAILURE", message: "temporary" } : { dependencies: [] }), { status: calls === 1 ? 502 : 200, headers: { "content-type": "application/json" } });
  const client = new Client({ platformEndpoint: "http://metis.internal", appId: "caller-a7x2m", appToken: "token", fetch });
  await assert.rejects(client.listDependencies());
  await client.listDependencies();
  assert.equal(calls, 2);
});

test("invalid runtime and capability values use stable errors", async () => {
  const fetch = async () => new Response("gateway failed", { status: 502 });
  const client = new Client({
    platformEndpoint: "http://metis.internal", appId: "caller-a7x2m", appToken: "token", fetch,
    environment: { METIS_S3_ENDPOINT: "http://silo.internal", METIS_S3_ACCESS_KEY: "key", METIS_S3_SECRET_KEY: "secret", METIS_S3_BUCKET: "bucket", METIS_S3_SHARED_BUCKETS: "null" },
  });
  await assert.rejects(client.listDependencies(), (error) => error.reason === "UPSTREAM_FAILURE");
  assert.throws(() => client.model("llm.-1"), (error) => error.reason === "INVALID_CONFIG");
  assert.throws(() => client.objectStorage(), (error) => error.reason === "INVALID_CONFIG");
});

test("web dependency paths stay within the application root", async () => {
  const fetch = async () => new Response(JSON.stringify(fixture.dependencies.dependencies[0]), { status: 200, headers: { "content-type": "application/json" } });
  const client = new Client({ platformEndpoint: "http://metis.internal", appId: "caller-a7x2m", appToken: "token", fetch });
  for (const path of ["../admin", "%2e%2e/admin", "..\\admin"]) {
    await assert.rejects(client.webURL("ui", path), (error) => error.reason === "INVALID_CONFIG");
  }
});
