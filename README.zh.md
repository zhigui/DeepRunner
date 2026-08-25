# DeepRunner

[English](README.md) | 中文

DeepRunner 是基于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的桌面客户端。它保留 DSH 官方的 Agent、会话、工具、模型和 Web UI，并补充 Profile 恢复、插件市场、系统终端、托盘与应用更新等桌面能力。

![screenshot](docs/screenshot.png)

## 已实现的功能

- **DSH 桌面运行环境**：在单实例 Electron 窗口中启动官方 DSH Web 应用，Host 仅监听随机的 `127.0.0.1` 端口。
- **Profile 恢复**：发现兼容的本机 Profile；启动失败时回退到 last-known-good Profile，或进入独立恢复窗口和一次性安全模式。日常菜单不暴露 Profile 的实现细节。
- **插件市场**：浏览固定的受控目录，查看信任、来源和兼容状态，并安装、更新、禁用、启用或移除当前 Profile 的插件。
- **手动来源安装**：支持 NPM 包名、NPM 包页面和公开 GitHub 仓库根链接。GitHub 链接仅用于发现并核对已经发布到 NPM 的包；手动安装始终标记为 `Sideloaded · Unverified`。
- **DeepRunner Terminal**：从系统终端打开带有当前 Profile 环境的 `dsh` 与 `pnpm`。目前不是应用内嵌 PTY。
- **桌面集成**：提供应用菜单、系统托盘、窗口隐藏与恢复、系统/亮色/暗色主题，以及 `deeprunner://` 插件市场 Deep Link。
- **应用更新与发布**：打包版本使用 `electron-updater` 从固定的 GitHub Releases 来源检查并下载更新；发布流水线强制 macOS 签名、支持可选 Windows 签名，校验元数据与 checksum，并只发布白名单内的最小产物集合。

DSH 的模型配置、Workspace、会话、Agent 工作流和工具能力来自当前固定版本的官方运行时，不由 DeepRunner 重新实现。

## 当前边界

- 手动安装不支持本地 `file:` 或 `link:` 来源、私有仓库、任意 registry，或直接安装 GitHub 制品。
- macOS 主窗口使用系统标题栏；Windows 使用 title-bar overlay 与 Mica；Linux 保留窗口管理器装饰。DeepRunner 当前不替换官方根布局，也不提供 Renderer 自定义工具栏。
- 自动更新仅在打包应用中启用；开发运行不会检查更新。
- macOS arm64 目录产物和真实 Renderer 冒烟已经验证；Windows、Linux 和 macOS x64 的安装包与 UI 仍需在发布环境和真机上验收。
- 桌面通知和应用内嵌终端尚未实现，不应视为已经交付的功能。

## 本地开发

要求：

- Node.js `22.19+`（也支持 `24+`）
- Corepack
- Yarn `4.18.0`（由 `packageManager` 字段固定）

安装依赖并启动应用：

```bash
corepack enable
corepack yarn install --immutable
corepack yarn build
corepack yarn start
```

在 macOS 上也可以使用开发脚本。它会重新构建应用、停止上一次由该脚本启动的实例，并使用仓库内隔离的 Electron userData 目录（包括其中私有的 DSH Home）：

```bash
corepack yarn dev
```

常用命令：

```bash
corepack yarn check       # 文档/布局检查、上游升级器测试、构建、类型检查和测试
corepack yarn build       # 构建所有 workspace
corepack yarn typecheck   # 运行 TypeScript 类型检查
corepack yarn test        # 运行 workspace 测试
corepack yarn package:dir # 生成当前平台的未签名目录产物
```

正常构建使用固定的已发布 `@deepseek-ai/*` 包。`upstream.json` 记录对应的上游版本与源码 commit；仓库当前不提交完整的上游 checkout。

## 仓库结构

```text
apps/desktop/            Electron 启动、窗口、Profile、恢复、终端和更新
packages/contracts/      DeepRunner 的公共类型与边界
packages/desktop-plugin/ Desktop Host 和 Client 插件
packages/plugin-market/  插件目录、兼容审计、操作服务和市场 UI
scripts/                 上游升级、布局、文档、打包和发布校验
docs/                    产品、架构、安全、测试和发布文档
upstream/                固定的 DSH 上游源码参考
```

## 文档

从[开发文档索引](docs/README.md)开始。要快速了解实现边界，请阅读：

- [产品范围](docs/product-scope.md)
- [总体架构](docs/architecture.md)
- [Profile 与插件管理](docs/profiles-and-plugins.md)
- [插件市场](docs/plugin-market.md)
- [原生 UI](docs/native-ui.md)
- [更新与发布](docs/updates-and-release.md)
- [测试与质量](docs/testing-and-quality.md)
- [路线图](docs/roadmap.md)

## 设计原则

- 不 fork 或修改 DSH 的 Agent loop、Session、Tool、Model 与业务 UI。
- Renderer 保持 `sandbox: true`、`contextIsolation: true`、`nodeIntegration: false`，不提供通用 preload 或 IPC 桥。
- 插件和 Profile 变更通过受控的领域操作执行，不向网页内容暴露任意 shell。
- Profile、主题或插件组合变化以完整的 generation 重启为边界。

## 许可证

DeepRunner 使用 GNU Affero General Public License v3.0 或更高版本授权。

你可以使用、研究、修改和重新分发本项目。如果你分发本应用或修改版本，主要需要：

- 提供相应的源代码；
- 保留版权和许可证声明；
- 以 GNU AGPL v3.0 或更高版本授权衍生作品；
- 当修改版本通过网络向用户提供时（包括托管服务），向这些用户提供相应源代码；
- 说明对项目所作的重要更改。

DeepRunner 是独立开发的非官方 DeepSeek Harness 客户端，与 DeepSeek 不存在隶属、赞助或背书关系。DeepSeek Harness 及其他第三方组件继续适用各自的许可证，详见[第三方声明](THIRD_PARTY_NOTICES.md)。本许可证不授予以暗示官方关联、赞助或背书的方式使用 DeepRunner 名称或标识的商标权。

完整且具有法律效力的条款以 [LICENSE](LICENSE) 为准。
