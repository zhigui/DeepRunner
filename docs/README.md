# DeepRunner 开发文档

本文档集记录 DeepRunner 的当前实现、产品边界和后续计划。先通过根目录 [README](../README.md) 了解项目；需要修改代码或 contract 时，再进入对应专题。

文档中的“已实现”表示已有代码或自动化证据；“已规划”和路线图条目不代表当前产品已经支持。实现与计划同时出现时，以各节的“当前实现/当前边界”为准。

## 阅读顺序

### 了解当前实现

1. [产品范围](product-scope.md)：当前做什么、不做什么。
2. [总体架构](architecture.md)：Electron、Cordis Host、Web Renderer 和上游 DSH 的边界。
3. [运行时与生命周期](runtime-lifecycle.md)：启动、重启、退出和故障恢复。
4. [Profile 与插件管理](profiles-and-plugins.md)：Profile、generation 和包操作 contract。
5. [插件市场](plugin-market.md)：已实现的目录、侧载、安装和兼容隔离。
6. [原生 UI](native-ui.md)：主窗口、菜单、托盘和主题的平台差异。
7. [终端](terminal.md)：当前系统终端方案和未来内嵌 PTY 边界。

### 开发、验证与发布

1. [工程与仓库结构](engineering.md)
2. [DeepSeek Harness 上游升级](upstream-maintenance.md)
3. [安装包与 Node 运行时闭包](packaged-runtime.md)
4. [测试与质量](testing-and-quality.md)
5. [更新与发布](updates-and-release.md)
6. [安全模型](security.md)

### 产品决策与后续计划

- [M5 插件市场产品方案](m5-plugin-market-product.md)
- [实施路线图](roadmap.md)
- [待决问题](open-questions.md)

## ADR

架构决策记录位于 [adr/](adr/README.md)：

- [ADR-0001：采用 Cordis 原生桌面宿主](adr/0001-cordis-native-desktop-host.md)
- [ADR-0002：Renderer 不使用 Electron IPC 能力桥](adr/0002-loopback-web-carrier.md)
- [ADR-0003：只读上游 pin 与独立 workspace](adr/0003-pinned-upstream-and-workspace-boundary.md)
- [ADR-0004：Profile 和模式切换以重启为边界](adr/0004-generation-restart-boundary.md)
- [ADR-0007：主窗口恢复系统所有的窗口框架](adr/0007-system-owned-main-window-chrome.md)
- [ADR-0008：使用来源元数据 pin，不提交上游 checkout](adr/0008-upstream-metadata-pin.md)

## 文档状态约定

- **已接受**：作为实现约束，改变它需要新 ADR。
- **已规划**：方向明确，但细节允许在验证后收敛。
- **待验证**：必须先通过 spike、测试或目标平台实验。
- **待决定**：需要产品或工程选择，记录在 `open-questions.md`。
- **已实现**：已有代码和自动化证据支持。

## 维护规则

- 文档描述支持的 contract，不把偶然实现细节声明成公共 API。
- 每个里程碑必须有可执行的退出条件。
- 上游版本、源码 commit、npm 包版本和完整性哈希分别记录。
- 产品能力完成后，把相应文档状态和验证命令一起更新。
- 插件市场、自动更新、签名和沙箱相关变更必须同步更新安全文档。
