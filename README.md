# Metis TypeScript SDK

本仓库包含两个独立 npm 包：

- `@vector-metis/server-sdk`：应用后端 Runtime API 客户端；
- `@vector-metis/browser-sdk`：调用平台注入的 `window.Metis` 浏览器能力。

```bash
npm install @vector-metis/server-sdk
npm install @vector-metis/browser-sdk
```

两个包独立版本和发布，不复制平台服务端实现。浏览器包通过 `init()` 自动加载平台提供的 `/api/runtime/v1/browser-sdk.js`。

```ts
import { init } from "@vector-metis/browser-sdk";

const Metis = await init();
```

后端 `Dependency` 返回 `requestedVersion`、`resolvedVersion`、`packageSha256`、`direct`、
`available` 和 `resolutionError`，应用应在使用可选依赖前检查 `available`。

服务端 SDK 可用 `newModelRequest()` 携带模型 slot API key，并通过 `platformIdentityFromRequest()`、`withExternalUser()` 或 `withoutUserAttribution()` 显式记录最终用户归因。浏览器 SDK 不暴露模型密钥或外部用户归因能力。

```bash
pnpm install --frozen-lockfile
pnpm -r test
pnpm -r build
```

Apache-2.0，见 [LICENSE](LICENSE)。
