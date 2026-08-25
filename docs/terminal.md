# 终端

状态：第一阶段已实现；内嵌 PTY 已规划

## 终端能力分层

DeepRunner 将终端分成两个阶段，避免把“能运行 DSH 命令”和“完整内嵌 PTY”混成一个不受控功能。

### 第一阶段：DeepRunner Terminal

从托盘或应用命令打开系统终端，预配置：

- 当前 Profile 名称。
- DSH Home。
- 打包的 `dsh` 命令。
- 打包的 pnpm 命令。
- 使用 Electron ABI 的 Node helper。
- 清晰的产品版本和 Profile 提示。

该终端适合诊断、插件修复和高级命令，不要求 Renderer 获得 shell 权限。

### 第二阶段：内嵌 PTY

在 Harness 已有 terminal service/route 的基础上增加 DeepRunner Client surface。Renderer 只消费终端协议，不直接访问 `node-pty`。

内嵌 PTY 必须在单独 ADR 和威胁模型通过后实施。

## Runtime environment

发布包需要提供真实物理路径：

- Electron executable 或专用 Node runtime。
- `dsh` JavaScript bootstrap。
- pnpm JavaScript entry。
- 用于清理 `ELECTRON_RUN_AS_NODE` 的 preloader。
- Windows 命令 shim 或隐藏控制台 launcher。

要求：

- 不依赖用户全局安装的 `node`、`pnpm` 或 `dsh`。
- 不修改系统 HOME。
- 只在目标子进程环境设置 `DSH_HOME`、Profile 和 ABI 变量。
- PATH 变更可以精确回滚，不覆盖启动后其它组件的修改。
- 生成目录和文件拒绝符号链接替换并使用原子写入。

## 进程所有权

所有终端和包操作通过上游 subprocess service 或等价的进程树 owner 启动：

- argv 数组跨边界，不拼接 shell string。
- 明确 cwd、stdio 和环境白名单。
- cancellation 先发送温和终止，grace 到期后升级。
- generation dispose 等待完整进程树退出。
- stdout/stderr 或 PTY history 有容量上限。

## 系统终端启动

平台 adapter 负责：

- macOS：通过系统认可方式打开 Terminal/iTerm 兼容命令文件，首版只保证系统 Terminal。
- Windows：启动 Windows Terminal 或受支持 PowerShell host；避免弹出无关控制台窗口。
- Linux：根据桌面环境发现受支持 terminal emulator，找不到时给出明确错误。

启动文件位于 Electron 私有状态目录，不包含 API key 或其它 secret。

## 内嵌终端安全要求

- 终端创建必须来自明确用户操作。
- Host 绑定当前用户、当前 generation 和 workspace policy。
- 支持 read-only/受限 sandbox 时必须显示当前 policy。
- 浏览器断开后由 Host 决定保留或终止 PTY，不由页面隐式控制。
- 重连 token 不进入 URL query 或日志。
- 终端输出按二进制/文本协议正确处理，不能插入 DOM HTML。

## 验收要求

- 打包后无需全局 Node 即可运行 `dsh --version` 和 Profile 查询。
- 当前 Profile 身份不可由 consumer 覆盖。
- 关闭应用能够终止测试用完整子进程树。
- Windows 不出现意外控制台窗口。
- 路径包含空格、Unicode 和引号时仍能正确执行。
- secret 不出现在生成脚本、日志或错误报告中。
