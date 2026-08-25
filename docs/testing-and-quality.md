# 测试与质量门禁

状态：单元、类型、布局、打包静态门禁和 macOS arm64 packaged smoke 已实现；其余目标平台与签名门禁已规划

## 测试层次

### 单元测试

覆盖纯逻辑和边界条件：

- Profile 名称、selection state 和原子持久化。
- Bundle/Patch 顺序和平台 overlay。
- service 并发、dispose 和 cancellation。
- URL/origin/navigation policy。
- window options 和 mode 验证。
- 市场 schema、兼容性和 trust policy。
- 更新 manifest、semver、checksum 和 artifact selection。
- 命令 argv、环境和路径 quoting。

### Cordis Loader 测试

- Desktop Host plugin 可以作为普通 Loader entry 激活。
- 缺少 Launcher 私有 runtime 时 headless-safe 地退出或保持 inactive。
- 公共 services 在第三方 fixture 声明 injection 时可用。
- effect dispose 后 service、route、tray contribution 和 process 全部释放。

### Profile composition 测试

- 默认 Profile 初始化正确。
- 上游 Web Bundle 顺序保持不变。
- DeepRunner layer 插入位置固定。
- 用户 Profile 和 home patches 的优先级正确。
- loopback 和随机端口最终覆盖不能被用户 patch 取消。
- Windows/Linux 平台 overlay 正确。
- 兼容/高级 mode 产生预期 Client rows。

### Renderer 测试

- Client environment marker 严格解析。
- boot health 成功和失败报告。
- 兼容模式不抢占官方 root。
- 高级模式正确注册 layout/root/child slots。
- theme presenter 安装、更新和 dispose。
- 市场 UI 不含 Node/Electron import。

### 生命周期测试

- 单实例和 second-instance show。
- Profile select 的 persistence-before-restart。
- 同目标共享 operation，不同目标被串行或拒绝。
- dispose timeout、第二次退出升级和 relaunch 条件。
- last-known-good 提交与失败回滚。
- 启动失败后的自动 relaunch、恢复 generation dispose 和重复退出。
- 安全模式一次性 marker、损坏状态恢复和用户/第三方 layer 解析旁路。
- 活跃 pnpm、PTY、下载在 generation dispose 时取消。

### 打包测试

- `afterPack` 已验证关键 ASAR entry、完整 unpacked physical mirror 和 package exports。
- `afterPack` 已阻止重复打包 `node_modules/electron`。
- 打包的 DSH、pnpm 和 Node helper 可运行。
- native dependency 加载成功。
- 应用启动后 Web UI 返回预期 boot marker。
- BrowserWindow 实际加载且 Renderer 健康。
- 不包含测试 fixture 和非生产文件。

本地可用 `corepack yarn package:dir` 构建无签名目录产物，再依次运行 `corepack yarn verify:packaged-runtime <app-dir>`、`corepack yarn smoke:packaged-runtime <app-dir>` 和 `corepack yarn smoke:packaged-app <app-dir>`。三项分别覆盖静态闭包、安装包内命令/native addon、真实窗口与 Renderer Client Loader；签名和安装器仍需目标平台验证。完整边界见[安装包与 Node 运行时闭包](packaged-runtime.md)。

## 平台矩阵

| 平台 | Unit/Loader | Package | Packaged smoke | 签名验证 | UI 手测 |
| --- | --- | --- | --- | --- | --- |
| macOS arm64 | 必须 | 必须 | 必须 | 必须 | 必须 |
| Windows x64 | 必须 | 必须 | 必须 | 必须 | 必须 |
| Linux x64 | 必须 | 必须 | 必须 | 按格式 | 必须 |
| macOS x64 | 支持时必须 | 支持时必须 | 支持时必须 | 必须 | 发布前 |

## 上游升级门禁

每次升级 DSH package family，先按 [DeepSeek Harness 上游升级](upstream-maintenance.md)运行 `corepack yarn upstream:update`，再完成以下兼容性和跨平台门禁：

1. 审阅升级器记录的旧/新 package family、源码 commit、被删除模块和生成的运行时闭包。
2. 对比上游 Profile template 和 `--dump-config`。
3. 检查 DeepRunner 依赖的 service、event、slot 和 row id。
4. 运行 build/typecheck/unit。
5. 运行 Host Loader 和 Profile boot smoke。
6. 运行兼容模式 Client boot。
7. 运行高级模式 Client boot。
8. 在每个目标平台运行 packaged smoke。
9. 更新兼容矩阵和 release notes。

任何一步失败时，不通过额外 monkey patch 隐藏问题；先判断应该更新正式 contract、临时固定旧版本还是向上游反馈。

## 发布阻断条件

- lockfile 或 upstream pin 不一致。
- 浮动生产依赖。
- 许可证或 third-party notice 缺失。
- runtime closure 缺包或指向 ASAR 虚拟可执行路径。
- Renderer 开启 Node/preload/不安全导航。
- 更新产物未签名或 checksum 不匹配。
- packaged smoke 未在目标 OS 完成。
- Profile/插件故障无法进入恢复路径。

## 手工验收

- 首次启动和空 DSH Home。
- 模型配置、选择 Workspace、创建会话和运行工具。
- Profile 切换与故障回退。
- 插件安装、更新、取消、失败、移除。
- 托盘、窗口恢复和系统主题变化。
- macOS 系统标题栏和 Windows caption controls。
- DeepRunner Terminal。
- 更新检查、下载、取消和安装。
- macOS VoiceOver、Windows Narrator 和键盘导航。
