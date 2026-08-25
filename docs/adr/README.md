# 架构决策记录

ADR 用于记录会长期约束实现的技术选择。ADR 一旦接受不直接重写结论；需要改变方向时，新增 ADR 并注明替代关系。

## 状态

- Proposed：待验证或评审。
- Accepted：后续实现必须遵守。
- Superseded：已被后续 ADR 替代。
- Rejected：曾评估但未采用。

## 索引

| ADR | 标题 | 状态 |
| --- | --- | --- |
| [0001](0001-cordis-native-desktop-host.md) | 采用 Cordis 原生桌面宿主 | Accepted |
| [0002](0002-loopback-web-carrier.md) | Renderer 只使用 loopback Web carrier | Accepted |
| [0003](0003-pinned-upstream-and-workspace-boundary.md) | 只读上游 pin 与独立 workspace | Superseded in part by 0008 |
| [0004](0004-generation-restart-boundary.md) | Profile 和模式切换以重启为边界 | Accepted |
| [0007](0007-system-owned-main-window-chrome.md) | 主窗口使用系统所有的窗口框架 | Accepted |
| [0008](0008-upstream-metadata-pin.md) | 使用来源元数据 pin，不提交上游 checkout | Accepted |

## 模板

新 ADR 应包含：

- 标题、状态、日期。
- 背景和要解决的问题。
- 决策。
- 结果与代价。
- 考虑过的替代方案。
- 验证方式。
