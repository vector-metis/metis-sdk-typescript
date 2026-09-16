# Changelog

## 0.2.1

- 服务端 SDK 强类型重构 `ModelConfig`，彻底移除弱类型 `values` 字典。
- 增加模型特性与卡片参数属性：`supportsVision`, `supportsThinking`, `supportsTools`, `contextWindow`, `maxInputTokens`, `maxOutputTokens`, `dimensions`, `normalized`。
- 增加批量模型枚举 `models(modelType)` 与安全探活 `tryModel(slot)` API。

## 0.2.0

- 浏览器 SDK 改为通过 `init()` 自动加载并校验平台脚本。
- 移除手动注入所需的 `Metis` 和 `injected` 兼容入口。

## 0.1.0

- 首次公开发布。
