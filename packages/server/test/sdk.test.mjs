import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  Client, MetisError, contextFromHeaders, newModelRequest, platformIdentityFromHeaders,
  platformIdentityFromRequest, withExternalUser, withPlatformIdentity, withoutUserAttribution,
} from "../dist/index.js";

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
  const llm = client.model("llm.0");
  assert.equal(llm.model, "example-chat");
  assert.equal(llm.supportsVision, true);
  assert.equal(llm.supportsThinking, false);
  assert.equal(llm.supportsTools, true);
  assert.equal(llm.contextWindow, 32768);
  assert.equal(llm.maxOutputTokens, 8192);

  assert.equal(client.tryModel("llm.0")?.model, "example-chat");
  assert.equal(client.tryModel("llm.1"), null);
  assert.equal(client.tryModel("invalid"), null);

  const llms = client.models("llm");
  assert.equal(llms.length, 1);
  assert.equal(llms[0].model, "example-chat");
  assert.throws(() => client.models("invalid"), (error) => error.reason === "INVALID_CONFIG");

  const emb = client.model("embedding.0");
  assert.equal(emb.model, "example-embedding");
  assert.equal(emb.dimensions, 1024);
  assert.equal(emb.normalized, true);

  assert.equal(client.model("rerank.0").model, "example-rerank");
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

test("model requests always carry the slot key and one attribution", () => {
  const model = {
    endpoint: "http://metis.internal/model-gateway/", model: "chat", apiKey: "slot-key",
    supportsVision: false, supportsThinking: false, supportsTools: false, contextWindow: 0,
    maxInputTokens: 0, maxOutputTokens: 0, dimensions: 0, normalized: false,
  };
  const platform = newModelRequest(model, "POST", "/v1/chat/completions", withPlatformIdentity(42, 84));
  assert.equal(platform.headers.get("authorization"), "Bearer slot-key");
  assert.equal(platform.headers.get("x-platform-tenant-id"), "42");
  assert.equal(platform.headers.get("x-platform-user-id"), "84");
  assert.equal(platform.headers.get("x-platform-external-user-id"), null);

  const external = newModelRequest(model, "POST", "/v1/embeddings", withExternalUser(" customer-1 "));
  assert.equal(external.headers.get("authorization"), "Bearer slot-key");
  assert.equal(external.headers.get("x-platform-tenant-id"), null);
  assert.equal(external.headers.get("x-platform-user-id"), null);
  assert.equal(external.headers.get("x-platform-external-user-id"), "customer-1");

  const other = newModelRequest(model, "POST", "/v1/rerank", withoutUserAttribution());
  assert.equal(other.headers.get("authorization"), "Bearer slot-key");
  assert.equal(other.headers.get("x-platform-external-user-id"), null);
});

test("model attribution validates identities and request paths", () => {
  assert.deepEqual(platformIdentityFromHeaders({ "x-platform-tenant-id": "42", "X-Platform-User-Id": "84" }), withPlatformIdentity(42, 84));
  assert.deepEqual(platformIdentityFromRequest(new Request("http://example.test", { headers: { "X-Platform-Tenant-Id": "42", "X-Platform-User-Id": "84" } })), withPlatformIdentity(42, 84));
  for (const ids of [[0, 1], [1, -1], [1.5, 2], [Number.MAX_SAFE_INTEGER + 1, 2]]) {
    assert.throws(() => withPlatformIdentity(ids[0], ids[1]), (error) => error instanceof MetisError && error.reason === "INVALID_CONFIG");
  }
  for (const id of ["", " ", "a".repeat(129), "你".repeat(43), "bad\nvalue"]) {
    assert.throws(() => withExternalUser(id), (error) => error instanceof MetisError && error.reason === "INVALID_CONFIG");
  }
  assert.throws(() => platformIdentityFromHeaders({}), (error) => error instanceof MetisError && error.reason === "INVALID_CONFIG");
  const model = { endpoint: "http://metis.internal/model-gateway", apiKey: "slot-key" };
  for (const path of ["", "v1/chat/completions", "//elsewhere.test/v1"]) {
    assert.throws(() => newModelRequest(model, "POST", path, withoutUserAttribution()), (error) => error instanceof MetisError && error.reason === "INVALID_CONFIG");
  }
  assert.throws(() => newModelRequest(model, "POST", "/v1/chat/completions", {}), (error) => error instanceof MetisError && error.reason === "INVALID_CONFIG");
});
