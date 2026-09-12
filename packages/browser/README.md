# @vector-metis/browser-sdk

智办应用浏览器 SDK，为平台注入的 `window.Metis` 能力提供 TypeScript 类型和统一调用代理。

## 安装

```bash
npm install @vector-metis/browser-sdk
```

应用入口仍需先加载平台脚本：

```html
<script src="/api/runtime/v1/browser-sdk.js"></script>
```

```ts
import { Metis } from "@vector-metis/browser-sdk";

const dependencies = await Metis.listDependencies();
```

浏览器 SDK 不暴露应用令牌、模型 API key、对象存储凭据或 Service 端口。完整说明见[开发文档](https://github.com/vector-metis/metis-sdk-typescript#readme)。

Apache-2.0，见仓库中的 `LICENSE`。
