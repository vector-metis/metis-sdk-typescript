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
await Metis.ui.sidebar.hide();
await Metis.ui.toast.show({ level: "success", message: "已保存" });

const stop = Metis.on("route.changed", () => {
  // 按需重新读取上下文
});
```

`init()` 会自动加载当前平台的 `/api/runtime/v1/browser-sdk.js`，并在脚本完成且能力校验通过后返回 SDK。重复调用会复用已经加载的 `window.Metis`。本地开发或严格 CSP 场景可以覆盖脚本地址、nonce 和超时时间：

平台握手未在超时时间内完成，或宿主没有授予某项能力时，初始化或调用会失败；应用应按错误的 `reason`（例如 `DEADLINE_EXCEEDED`、`CAPABILITY_UNAVAILABLE`）显示降级状态，不要自行操作父窗口。

```ts
const Metis = await init({
  scriptUrl: "/api/runtime/v1/browser-sdk.js",
  nonce: document.querySelector("meta[name=csp-nonce]")?.content,
  timeoutMs: 10000,
});
```

请在浏览器应用启动阶段调用 `init()`；服务端渲染、Node.js 和构建阶段不提供浏览器环境。

浏览器 SDK 不暴露应用令牌、模型 API key、对象存储凭据或 Service 端口。完整说明见[开发文档](https://github.com/vector-metis/metis-sdk-typescript#readme)。

互动能力包括：

- `ui.sidebar.hide()` / `show()`：只在当前应用壳生命周期内隐藏或恢复侧边栏；平台浮动恢复按钮始终保留，刷新或离开应用后恢复。
- `ui.toast.show()`：显示平台统一的短提示，消息长度为 1-500 个字符。
- `on(name, callback)`：订阅 `context.changed`、`route.changed`、`sidebar.visibility.changed` 和 `platform.auth.required`，并返回取消订阅函数。

能力通过平台脚本和同源 iframe 握手授予。未授予能力、错误来源、非法路径或超时会返回带 `reason` 的错误。平台会话失效由宿主统一跳转登录，应用不维护自己的平台登录过期状态。

Apache-2.0，见仓库中的 `LICENSE`。
