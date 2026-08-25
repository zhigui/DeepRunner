# Profile 与插件管理

状态：部分实现

## Profile 所有权

DeepRunner 复用上游 DSH Profile 格式，不创建第二套插件清单。每个 Profile 继续拥有：

- `package.json` 中的 `dsh.profile.bundles`。
- Profile 依赖和 lockfile。
- Profile 自有 `cordis.patch.yml`。
- Profile 安装的第三方插件。

DeepRunner 只拥有选择状态、兼容性检查和启动恢复，不直接解释或重写第三方插件业务配置。

## 默认 Profile

建议名称：`deeprunner`。

初始化顺序：

1. 官方基础 Bundle。
2. 官方 Web App Bundle。
3. DeepRunner Desktop Bundle。
4. 后续由用户安装的第三方 Bundle。

DeepRunner 在每次启动时只修复自己拥有的前缀，不改变第三方 Bundle 的相对顺序。

## `deepRunnerProfiles` contract

计划公开：

```ts
interface DeepRunnerProfiles {
  readonly current: {
    readonly name: string
    readonly dir: string
  }
  list(): readonly DeepRunnerProfileSummary[]
  select(name: string): Promise<void>
}
```

规则：

- `current` 对当前 generation 不可变。
- `list()` 只读发现，不初始化、安装或修改 Profile。
- `select()` 先持久化目标，再请求有序重启。
- service dispose 后的调用失败。
- 第三方不得从 argv、settings、URL 或 Loader base 推断当前 Profile。

当前实现：

- 启动器在 Electron `userData/profile-selection/state.json` 原子保存版本化状态。
- `list()` 只读发现现有 Profile，并暴露可延迟初始化的 `deeprunner` 与 `web` Profile。
- `select()` 校验 Web carrier 后保存 `pending`，再请求 generation 有序重启。
- 原生窗口挂载后才将当前 Profile 提升为 `lastKnownGood`。
- 当前实现进一步要求主 Renderer 的完整 Client Loader 报告 `healthy`；仅 `loadURL()` 成功不能提交健康。
- 未确认 generation 会自动 relaunch 并回退到 `lastKnownGood`；若 last-known-good 也失败，则挂载独立于 DSH Host 的恢复窗口。
- 恢复窗口可以选择其他兼容 Profile，或请求一次性安全模式；安全模式从解析阶段忽略用户 manifest/patch 与第三方 bundle。
- Profile discovery service 仍不直接修改 Profile；插件变更由已实现的 `deepRunnerPackages` provider 委托官方 CLI，Profile 创建/删除留给后续显式产品流程。

Renderer 报告包含当前 generation id。Host 拒绝跨 generation、跨 origin、超出大小限制或 schema 无效的报告，Native runtime 只接受第一个 terminal outcome。这样 Profile 健康证据与具体 Bundle/Client 组合一一对应。

Profile summary 至少包含：

- 名称与绝对目录。
- manifest 是否有效。
- 是否包含 Web carrier。
- 是否满足 DeepRunner 最低 contract。
- 是否可在兼容/高级模式启动。
- 最近健康状态和不可选原因。

## `deepRunnerPackages` contract

计划公开两个方法：

```ts
interface DeepRunnerPackages {
  runPnpm(args: readonly string[], signal?: AbortSignal): DeepRunnerProcessHandle
  runPlugin(
    args: readonly string[],
    invokingDir: string,
    signal?: AbortSignal,
  ): DeepRunnerProcessHandle
}
```

`runPnpm()` 是 Profile 目录中的低层包管理操作。`runPlugin()` 执行：

```text
dsh plugin --profile <current> ...args
```

插件安装、移除、更新和 dependency repair 必须使用 `runPlugin()`，因为官方 CLI 负责：

- Profile 初始化。
- 相对 `file:`/`link:` source 的调用方锚定。
- pnpm 工作目录。
- 成功后的 `dsh.profile.bundles` reconcile。

## Process handle

```ts
interface DeepRunnerProcessHandle {
  readonly stdout: NodeJS.ReadableStream
  readonly stderr: NodeJS.ReadableStream
  readonly done: Promise<{
    readonly exitCode: number | null
    readonly signal: NodeJS.Signals | null
  }>
  cancel(): void
}
```

约束：

- 每个 generation 同时只允许一个包变更操作。
- argv 非空、不含 NUL，跨边界时不拼接 shell 文本。
- `invokingDir` 必须是绝对路径。
- consumer 负责进度 UI、超时和错误表达。
- provider 负责命令路径、环境、Electron ABI、取消和完整进程树回收。
- `done` 只有整个进程树结束后才 settle。

## 插件变更事务

市场或其它 consumer 应按以下事务执行：

1. 校验插件来源和目标版本。
2. 获取 generation 包操作锁。
3. 记录操作前 manifest、lockfile 和 Bundle 列表摘要。
4. 执行 `runPlugin()` 并流式读取输出。
5. 检查 signal 和 exit code。
6. 重新读取 manifest，确认预期 Bundle 已 reconcile。
7. 运行轻量 Loader validation。
8. 提示重启或立即请求 generation 重启。

安装成功不等于插件健康；真正健康状态在下一次 Host/Client boot 后确认。

## 兼容性分级

插件市场建议显示：

- **已验证**：DeepRunner CI 或受信任发布者提供匹配版本证据。
- **声明兼容**：插件 manifest 声明兼容，但未由 DeepRunner 验证。
- **未知**：普通 DSH 插件，无 DeepRunner metadata。
- **不兼容**：平台、DSH 版本、Host/Client contract 或许可不满足。

DeepRunner 专属插件可以把公共 services 作为 required injection；跨环境插件必须保持普通 DSH fallback。
