# ADR-0002：Renderer 只使用 loopback Web carrier

状态：Accepted  
日期：2026-08-17

## 背景

Electron preload 和 IPC 可以把原生能力直接暴露给页面，但这会让官方和第三方 Client plugins 获得一个独立于 DSH 的高权限通道，增加安全、生命周期和兼容成本。

## 决策

DeepRunner Renderer 继续使用上游 loopback HTTP/WebSocket carrier。应用不提供通用 preload，不暴露 Electron IPC 或 Node API。

桌面功能通过以下方式实现：

- Host Cordis service。
- 精确、同源、schema 化的 Host route/RPC。
- Client metadata、service、event 和 slot。
- Electron native adapter 只存在于 Host。

## 结果

- 官方 Web UI 和第三方 Client plugin 保持普通浏览器安全模型。
- Desktop feature 与 Host generation 同生命周期。
- 需要原生操作的 UI 必须设计明确领域 API，不能快速调用任意 Electron 方法。
- loopback route 必须防御 CSRF、恶意 origin、超大请求和无界状态流。

## 验证

- Window options 自动断言 sandbox/context isolation/no Node。
- 构建检查禁止 Client bundle 导入 Electron 和 Node built-in。
- 导航测试覆盖同源、外部协议和 malformed URL。
- Desktop mutation route 有 origin、method、schema、size 和 concurrency 测试。

