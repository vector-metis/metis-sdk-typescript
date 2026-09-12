# Metis TypeScript SDK

本仓库包含两个独立 npm 包：

- `@vector-metis/server-sdk`：应用后端 Runtime API 客户端；
- `@vector-metis/browser-sdk`：调用平台注入的 `window.Metis` 浏览器能力。

```bash
npm install @vector-metis/server-sdk
npm install @vector-metis/browser-sdk
```

两个包独立版本和发布，不复制平台服务端实现。浏览器包必须在平台注入 `/api/runtime/v1/browser-sdk.js` 后使用。

```bash
pnpm install --frozen-lockfile
pnpm -r test
pnpm -r build
```

Apache-2.0，见 [LICENSE](LICENSE)。
