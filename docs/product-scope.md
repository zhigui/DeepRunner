# 产品范围

状态：首版范围已确定；实现与平台验收进度见根 README 和路线图

## 产品定义

DeepRunner 是 DeepSeek Harness 的桌面发行与扩展平台。它复用官方 Harness 的运行时和 Web 能力，并补充普通 CLI/Web 运行模式缺少的桌面宿主能力。

目标用户包括：

- 希望安装后直接使用 Harness 的个人开发者。
- 需要多个 Agent 配置和插件组合的高级用户。
- 需要从受控市场安装组织或社区插件的团队。
- 需要本地终端、更新和原生窗口体验的桌面用户。

## 第一版产品能力

### 核心运行

- 单实例桌面应用。
- 自动启动官方 DSH Web Profile。
- 仅监听随机 `127.0.0.1` 端口。
- Renderer 保持 Chromium sandbox、关闭 Node integration。
- 托盘驻留和有序退出。
- 启动失败时提供可恢复的错误界面。

### Profile

- 初始化 DeepRunner 默认 Profile。
- 列出兼容的本机 DSH Profile。
- 在故障恢复流程中列出兼容 Profile，并标记当前选择与不可用项；日常菜单不暴露 Profile 概念。
- 切换 Profile 时持久化 pending 目标并有序重启。
- 启动失败时回退到 last-known-good Profile。

### 插件市场

- 浏览受控目录中的内置、已验证发布者和社区收录插件元数据。
- 持续显示信任层级、来源、版本、许可、支持平台和风险提示。
- 由用户显式触发安装、更新、禁用、启用或移除；移除操作额外显示确认界面。
- 通过高级入口允许用户主动输入 NPM 包名、NPM 页面或公开 GitHub 仓库根链接，并明确标记为手动、未经验证来源。
- 所有变更通过官方 `dsh plugin --profile ...` 语义执行。
- 插件导致启动失败时支持 Profile 回退或一次性安全模式；插件卸载仍从正常市场界面执行。

### 原生 UI

- 完整保留官方 Web UI 和根布局。
- macOS 使用系统窗口框架；Windows 使用系统 caption controls 和支持时的 Mica；Linux 保留窗口管理器装饰。
- 不在 Renderer 中绘制自定义主窗口工具栏。

### 终端

- 提供带当前 Profile 身份的 DeepRunner Terminal。
- 提供打包的 `dsh`、`pnpm` 和所需 Node 运行环境。
- 命令进程可取消，并在关闭 generation 时完整回收进程树。
- 内嵌 PTY 终端作为后续能力，不阻塞基础产品交付。

### 更新

- 检查受信任发布源的版本清单。
- 下载匹配平台和架构的签名产物。
- 使用 electron-builder 元数据校验大小和 SHA-512，并由平台更新器校验应用签名后执行安装。
- 支持失败恢复，不在 Renderer 中处理安装器。

## 明确不做

- 不允许市场静默安装插件。
- 不把任意 npm/GitHub 搜索结果直接当作市场目录条目。
- 不承诺所有第三方 DSH Profile 都能在高级模式中运行。
- 不提供任意 npm registry 的自动信任。
- 不支持本地 `file:` / `link:`、私有仓库、任意 tarball 或直接 GitHub 制品安装。
- 不让网页直接访问文件系统、shell、安装器或 Electron 对象。
- 不在首版自建云同步、账号系统或远程插件执行环境。

## 成功标准

- 干净机器安装后，无需全局 Node、pnpm 或 dsh 即可启动。
- 官方 Web UI、模型配置、会话和 Agent 工作流保持可用。
- Profile 或插件故障不会永久阻止应用启动。
- macOS、Windows 和 Linux 的打包产物最终通过目标平台 smoke test；当前完成度见[测试与质量](testing-and-quality.md)。
- 所有外部导航、包安装、更新和终端操作都有明确的信任边界。
- 上游升级可以通过自动化兼容门禁判断是否允许合并。

## 平台优先级

建议但尚待产品确认：

1. macOS Apple Silicon。
2. Windows x64。
3. macOS Intel（取决于 Electron 和上游支持周期）。
4. Linux x64 兼容模式。
5. Windows ARM64 和 Linux ARM64 在需求出现后评估。
