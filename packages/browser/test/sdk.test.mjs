import assert from "node:assert/strict";
import test from "node:test";
import { Metis, injected } from "../dist/index.js";

test("delegates to the platform injected SDK", async () => {
  const calls = [];
  globalThis.window = { Metis: {
    appURL: (path) => `/apps/current${path || ""}`,
    getContext: async () => ({ appId: "current", appType: "RUNTIME_APPLICATION_TYPE_WEB", tenantId: "1", userId: "2", role: "member", actorType: "RUNTIME_ACTOR_TYPE_USER" }),
    listDependencies: async () => [],
    dependency: async (selector) => ({ appId: selector, alias: selector, required: true, appType: "RUNTIME_APPLICATION_TYPE_WEB", available: true, webBasePath: `/apps/${selector}` }),
    dependencyURL: async (selector, path) => `/apps/${selector}${path || ""}`,
    openAppPage: async (options) => calls.push(options),
  } };
  assert.equal(Metis.appURL("/home"), "/apps/current/home");
  assert.equal((await Metis.dependency("target")).appId, "target");
  await Metis.openAppPage({ app: "target", path: "/home" });
  assert.deepEqual(calls, [{ app: "target", path: "/home" }]);
  assert.equal(injected().appURL(), "/apps/current");
});

test("fails clearly when platform injection is missing", () => {
  globalThis.window = {};
  assert.throws(() => injected(), /not injected/);
  assert.throws(() => Metis.appURL(), /not injected/);
});
