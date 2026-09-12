# @vector-metis/browser-sdk

智办应用浏览器 SDK，为平台注入的 `window.Metis` 能力提供 TypeScript 类型和统一调用代理。

## 安装

```bash
npm install @vector-metis/browser-sdk
```

```ts
import { init } from "@vector-metis/browser-sdk";

const Metis = await init();
const dependencies = await Metis.listDependencies();
```

`init()` 会自动加载当前平台的 `/api/runtime/v1/browser-sdk.js`，并在脚本完成且能力校验通过后返回 SDK。重复调用会复用已经加载的 `window.Metis`。本地开发或严格 CSP 场景可以覆盖脚本地址、nonce 和超时时间：

```ts
const Metis = await init({
  scriptUrl: "/api/runtime/v1/browser-sdk.js",
  nonce: document.querySelector("meta[name=csp-nonce]")?.content,
  timeoutMs: 10000,
});
```

请在浏览器应用启动阶段调用 `init()`；服务端渲染、Node.js 和构建阶段不提供浏览器环境。

浏览器 SDK 不暴露应用令牌、模型 API key、对象存储凭据或 Service 端口。完整说明见[开发文档](https://github.com/vector-metis/metis-sdk-typescript#readme)。

Apache-2.0，见仓库中的 `LICENSE`。
