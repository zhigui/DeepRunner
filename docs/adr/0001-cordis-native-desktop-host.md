# ADR-0001：采用 Cordis 原生桌面宿主

状态：Accepted  
日期：2026-08-17

## 背景

DeepRunner 的最终目标包括 Profile、插件市场、原生 UI、更新和终端。仅启动 `dsh web` 子进程再嵌入页面，无法稳定提供当前 Profile 身份、受控包管理、Host service 或与 Cordis 生命周期一致的桌面能力。

## 决策

Electron main 进程通过上游 app-boot 建立 Host Cordis root。Launcher 在 Loader entry 挂载前提供 generation 所需的 Profile、runtime path、Electron ABI 和 native adapter。

DeepRunner 的桌面能力实现为正常的 Cordis Host/Client plugins；兼容模式继续使用官方完整 Web UI。

## 结果

优点：

- Desktop service 可以参与官方 Cordis 生命周期。
- Profile 和包管理身份明确。
- 原生 UI 可以使用正式 slot/service seam。
- 不需要自建第二套桌面插件协议。

代价：

- Electron main 与 Host 同进程，Host 致命错误会结束应用。
- 对上游 app-boot、Profile 和 Client contract 的耦合更深。
- 上游升级必须通过严格兼容门禁。
- 运行时依赖闭包和打包复杂度显著增加。

## 未采用方案

- 纯 Electron Web wrapper：适合 MVP，但不能满足完整产品目标。
- 修改上游源码加入桌面能力：破坏所有权和升级边界。
- 自建 Electron IPC 插件系统：形成重复 contract 和更大的 Renderer 权限面。

## 验证

M0 必须证明：Host 可 headless boot、Web carrier 可用、Launcher facts 可以在 Loader 前提供、Cordis dispose 能完整释放 generation。

