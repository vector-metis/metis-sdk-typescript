# @vector-metis/server-sdk

智办应用后端 Runtime SDK，读取平台注入配置并查询已声明的依赖、模型和对象存储能力。

## 安装

```bash
npm install @vector-metis/server-sdk
```

## 使用

```ts
import { fromEnv } from "@vector-metis/server-sdk";

const client = fromEnv();
const dependency = await client.dependency("wiki");
const model = client.model("llm.0");
const embedding = client.model("embedding.0");
const rerank = client.model("rerank.0");
```

`model()` 支持 `llm.N`、`embedding.N` 和 `rerank.N` 三类 slot，并返回对应的网关地址、模型别名、API key 及类型专属参数。SDK 不创建厂商客户端。

生产环境使用 `fromEnv()` 读取 `METIS_PLATFORM_ENDPOINT`、`METIS_APP_ID` 和 `METIS_APP_TOKEN`。完整方法和应用协作示例见[开发文档](https://github.com/vector-metis/metis-sdk-typescript#readme)。

Apache-2.0，见仓库中的 `LICENSE`。
