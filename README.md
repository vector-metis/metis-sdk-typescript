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

服务端 SDK 的 `runtimeConfig()` 返回当前 service 的模型展示名称、图标、能力、上下文限制、状态和 revision，不返回 API key 或供应商凭据。

Runtime Config 中原始 protobuf 类型为 `int64` 或 `uint64` 的字段（如 `revision`、`contextWindow` 和 `iconFileId`）在 protojson 中使用十进制字符串，TypeScript SDK 也声明为 `string`。即使运行在 Node.js 后端也不能用 JavaScript `number` 安全表示全部 64 位整数；SDK 不执行 `Number()` 或递归类型猜测，需要计算时由应用显式调用 `BigInt(value)`。`int32/uint32` 和有限浮点字段仍按数字处理。

```bash
pnpm install --frozen-lockfile
pnpm -r test
pnpm -r build
```

Apache-2.0，见 [LICENSE](LICENSE)。
