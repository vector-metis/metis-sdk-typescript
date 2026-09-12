import assert from "node:assert/strict";
import test from "node:test";
import { init } from "../dist/index.js";

const platformSDK = {
  appURL: (path) => `/apps/current${path || ""}`,
  getContext: async () => ({ appId: "current", appType: "RUNTIME_APPLICATION_TYPE_WEB", tenantId: "1", userId: "2", role: "member", actorType: "RUNTIME_ACTOR_TYPE_USER" }),
  listDependencies: async () => [],
  dependency: async (selector) => ({ appId: selector, alias: selector, required: true, appType: "RUNTIME_APPLICATION_TYPE_WEB", available: true, webBasePath: `/apps/${selector}` }),
  dependencyURL: async (selector, path) => `/apps/${selector}${path || ""}`,
  openAppPage: async () => {},
};

test("loads the platform script and returns the ready SDK", async () => {
  const scripts = [];
  globalThis.window = {};
  globalThis.document = {
    createElement: (tag) => {
      assert.equal(tag, "script");
      return {};
    },
    head: {
      appendChild: (script) => {
        scripts.push(script);
        globalThis.window.Metis = platformSDK;
        script.onload();
      },
    },
  };

  const sdk = await init({ nonce: "test-nonce" });
  assert.equal(sdk, platformSDK);
  assert.equal(scripts.length, 1);
  assert.equal(scripts[0].src, "/api/runtime/v1/browser-sdk.js");
  assert.equal(scripts[0].nonce, "test-nonce");
  assert.equal(sdk.appURL("/home"), "/apps/current/home");
});

test("reuses an already loaded platform SDK", async () => {
  globalThis.window = { Metis: platformSDK };
  globalThis.document = undefined;
  assert.equal(await init(), platformSDK);
});

test("fails clearly outside a browser", async () => {
  globalThis.window = undefined;
  globalThis.document = undefined;
  await assert.rejects(init(), /requires a browser environment/);
});

test("fails when the platform script cannot be loaded", async () => {
  globalThis.window = {};
  globalThis.document = {
    createElement: () => ({}),
    head: { appendChild: (script) => script.onerror() },
  };
  await assert.rejects(init({ timeoutMs: 1000 }), /Failed to load Metis browser SDK/);
});
