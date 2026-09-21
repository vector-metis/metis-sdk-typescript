# Changelog

## 0.3.0

- 浏览器 SDK 增加 `ui.sidebar.hide()` / `show()`、统一 Toast 和生命周期事件订阅。
- 浏览器上下文增加安装版本、locale、theme、viewport 和当前路由投影。
- 平台运行时使用 v1 能力握手、nonce、request ID、能力协商和结构化错误。
- 同步更新浏览器 SDK README 和公开类型声明。

## 0.2.1

- 服务端 SDK 强类型重构 `ModelConfig`，彻底移除弱类型 `values` 字典。
- 增加模型特性与卡片参数属性：`supportsVision`, `supportsThinking`, `supportsTools`, `contextWindow`, `maxInputTokens`, `maxOutputTokens`, `dimensions`, `normalized`。
- 增加批量模型枚举 `models(modelType)` 与安全探活 `tryModel(slot)` API。

## 0.2.0

- 浏览器 SDK 改为通过 `init()` 自动加载并校验平台脚本。
- 移除手动注入所需的 `Metis` 和 `injected` 兼容入口。

## 0.1.0

- 首次公开发布。
