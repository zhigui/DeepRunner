# 实施路线图

状态：已规划

路线图按“先证明上游组合与发布闭包，再增加产品能力”的顺序推进。每个里程碑必须满足退出条件后再进入下一阶段。

## M0：上游兼容性 Spike

目标：确认目标 DSH 版本可以被 DeepRunner 以 Cordis 原生方式启动。

工作：

- 建立 `upstream.json` 来源 pin；完整上游 checkout 仅作为本地可选审计工具。
- 固定一组 `@deepseek-ai/*` 运行时包。
- 研究官方 app-boot、Web Profile、Host/Client runner contract。
- 生成并保存默认 Web Profile `--dump-config` 基线。
- 用最小 Node 程序启动 Host、获得随机 loopback port 并返回 Web UI。

退出条件：

- headless Host smoke 通过。
- 已知必须依赖的公开/非公开 contract 列表完成。
- Electron/Node/native ABI 组合已记录。
- M1 是否可行有明确结论。

## M1：工程脚手架与兼容桌面壳

目标：形成可启动、可测试、尚不带高级产品功能的桌面应用。

工作：

- 创建 Yarn workspace、Electron app 和 desktop Cordis plugin。
- 单实例、BrowserWindow、托盘、安全导航和退出协调。
- 强制 loopback 随机端口。
- 兼容模式加载官方 Web UI。
- 建立 Host、Client、Profile 和 package smoke。

退出条件：

- macOS/Windows/Linux 开发构建可以启动。
- Renderer 安全选项自动测试通过。
- 无 preload、无通用 Electron IPC。
- CI 执行 build、typecheck、unit 和 Loader smoke。

## M2：可发布运行时闭包

目标：在无全局 Node/dsh/pnpm 的干净机器运行。

当前进度：生产依赖物理镜像、重复 Electron 排除、`afterPack` 静态闭包门禁、安装包内 DSH/pnpm/native module 冒烟和真实 BrowserWindow/Client Loader 健康冒烟已在 macOS arm64 通过；SPDX SBOM 生成已进入发布流水线。Windows/Linux 的真实 packaged smoke、许可证汇总和安装器真机预检仍待完成。

工作：

- Electron Builder、ASAR/unpack 策略。
- 打包 pnpm、DSH entry、Node helper 和 native dependency。
- runtime closure、许可证、SBOM 和 packaged smoke。
- 三平台安装包和签名预检。

退出条件：

- 目标平台 packaged smoke 通过。
- 打包命令不依赖开发机 PATH。
- 所有可执行 entry 为真实物理路径。
- 发布阻断门禁进入 CI。

## M3：Profile 与恢复

目标：安全支持多个 Profile。

当前进度：Profile discovery、选择 service、`pending / active / lastKnownGood`、完整 Client Loader 健康提交、失败后自动重启回滚、独立恢复窗口和一次性安全模式已完成。恢复窗口当前提供 Profile 选择、安全模式、重试和退出；终端与插件卸载不在该窗口中。

工作：

- `deepRunnerProfiles` service。
- Profile discovery、compatibility summary 和选择 UI。
- pending/active/last-known-good 状态。
- Renderer boot health。
- 启动失败回滚和最小恢复模式。

退出条件：

- Profile 切换、并发、失败和回退测试通过。
- 损坏状态文件能恢复。
- 第三方失败插件不会永久阻止启动。

## M4：受控包管理与 DeepRunner Terminal

目标：建立市场和运维共用的安全变更基础。

当前进度：`deepRunnerPackages`、随包 pnpm/DSH runtime、generation busy gate、deadline、取消/dispose 完整进程树回收，以及系统 DeepRunner Terminal 已实现。真实 fixture 的安装/Bundle reconcile/移除、后代进程回收和 macOS arm64 packaged smoke 已通过；Windows/Linux adapter 已单测，真实 runner smoke 随对应平台 CI 执行。

工作：

- `deepRunnerPackages` service。
- 打包 pnpm/DSH command runtime。
- 完整进程树 owner、取消、deadline 和 busy gate。
- 系统 DeepRunner Terminal。

退出条件：

- 测试插件可通过 `runPlugin()` 安装和移除。
- cancellation/dispose 能回收后代进程。
- 三平台 terminal smoke 通过。

## M5：插件市场 MVP

目标：以受控市场目录和分级信任提示完成插件发现与单插件生命周期。收录和信任结论由外部市场仓库产生，本仓库负责目录消费与操作策略。

当前进度：受控 catalog schema/解析器、内置和固定远程目录、ETag/last-known-good 缓存、信任/兼容/撤回读模型、同源有界 Market API、浏览/搜索/筛选/详情 UI、Preview/Execute 一次性确认令牌、精确版本 mutation、registry integrity 预检、安装后 manifest/patch/lockfile 校验、安装 Receipt、DSH/DeepRunner/Node/原生 ABI 兼容审计、启动隔离、禁用/启用、进度轮询、取消、移除、重启入口和结构化手动来源 UI 已经实现。手动来源限 NPM 包名/NPM 页面/公开 GitHub 仓库，GitHub 只用于发现并互证已发布的 NPM 包。远程目录签名、私有或本地来源、直接 GitHub 制品，以及能重建原生依赖并带配置快照/自动回滚的完整 Repair/Loader 健康事务仍待完成。

工作：

- 市场目录 schema、信任层级和 fixture catalog。
- 浏览、分类、搜索、筛选、详情、已安装和更新 UI。
- 目录来源、版本、缓存、完整性和内置回退验证。
- 兼容性、许可和风险提示。
- NPM 包名、NPM 页面和公开 GitHub 仓库的结构化侧载入口与来源记录。
- post-install validation 和重启。

退出条件：

- 内置、已验证发布者和社区收录 fixture 端到端通过。
- 普通市场不能把任意 npm/GitHub 搜索结果当作目录条目。
- 所有 mutation 都经过公共包 service。
- 信任标签、手动来源、篡改、不兼容、暂停/撤回、busy、cancel、non-zero exit 测试通过。

## M6：原生 UI 高级模式

目标：在不复制上游业务 UI 的情况下提供可靠的桌面窗口体验。

当前进度：已恢复系统所有的主窗口 chrome，不再使用 Renderer 自定义标题栏或替换官方 root layout。macOS 使用默认系统标题栏，Windows 配置 title-bar overlay 与 Mica，Linux 保留窗口管理器装饰；统一主题、菜单和托盘已实现。Windows/Linux 真实机器、无障碍和发布级视觉验收仍待完成。

工作：

- 保持 compatibility/advanced mode contract 与重启边界。
- 保持官方 layout、sidebar、conversation 和 settings 的所有权。
- 系统窗口框架、Windows Mica 和统一主题。
- 可访问性和真实机器视觉验收。

退出条件：

- 兼容模式仍通过所有基线。
- 高级模式 slot/service dispose 正确。
- 上游 sidebar/conversation/settings 无复制实现。

## M7：安全更新与正式发布

目标：交付可签名、可验证、可更新的公开版本。

当前进度：已完成 electron-updater GitHub provider、应用内下载进度、SHA-512 校验、重启/退出安装、菜单与后台更新检查；已完成 macOS arm64/x64 metadata 合并、Windows x64、Linux x64 的原生 runner 发布矩阵、Developer ID 公证/stapling、Authenticode、NSIS、DMG/ZIP/AppImage/deb、SPDX SBOM、draft 上传后回下载复验及 latest 发布门禁。仓库所有者配置生产证书与 GitHub Secrets 后即可从 `v*` tag 产出正式安装包。

工作：

- electron-builder update metadata、checksum 和平台签名。
- macOS Developer ID/notarization。
- Windows Authenticode/NSIS。
- 更新检查、应用内下载、确认和退出安装流程。
- 发布后下载复验和回滚说明。

退出条件：

- 签名产物在干净机器通过 Gatekeeper/SmartScreen 预期流程。
- 篡改 manifest/artifact 被拒绝。
- 更新失败不影响旧版本启动。

## M8：内嵌终端与生态增强

候选工作：

- 内嵌 PTY terminal surface。
- 组织市场源和私有插件索引。
- 插件权限/能力声明增强。
- 自动化诊断包和兼容性报告。
- Linux 高级模式和新增架构。

该阶段不进入首版承诺，按用户反馈和安全审计排序。
