# 原生 UI

状态：主窗口、菜单、托盘和主题已实现；Windows/Linux 与无障碍仍需真机验收

## 当前实现

DeepRunner 保留官方 DSH Web UI 和根布局，只在 Electron 层补充桌面宿主能力：

- 主窗口与安全导航策略。
- 应用菜单和托盘。
- Profile 故障恢复；外观设置由 APP 内的设置页提供。
- 系统终端和更新入口。
- 插件市场在官方 sidebar additive slot 中的入口。

主 Renderer 不包含 DeepRunner 自定义标题栏，不替换官方 sidebar、conversation、workspace、settings 或 modal。相关决策见 [ADR-0007](adr/0007-system-owned-main-window-chrome.md)。

## 主窗口

所有平台共享以下安全选项：

- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`
- `webSecurity: true`
- 无 preload

主窗口只允许当前 generation 的精确 loopback origin 在主框架内导航。允许的 HTTP、HTTPS 和 `mailto:` 新窗口请求交给系统应用，其余请求拒绝。关闭主窗口时应用继续驻留托盘；从托盘、Dock 激活或第二实例可以恢复窗口。

### 平台策略

| 平台 | 当前窗口行为 | 验证状态 |
| --- | --- | --- |
| macOS | 系统 frame 与默认 title bar；系统管理 traffic lights、拖拽和可访问性 | 开发运行已验证 |
| Windows | 系统 frame、隐藏标题栏 overlay、原生 caption controls；支持时使用 Mica | 配置与单元测试覆盖，待真机视觉验收 |
| Linux | 保留窗口管理器标题栏和装饰，不启用高级材质 | 配置与单元测试覆盖，待多桌面环境验收 |

`native` 配置会在 macOS/Windows 解析为 `advanced`，在 Linux 解析为 `compatibility`。这两个 mode 当前只是平台窗口策略和兼容 contract，不代表替换官方根布局。

## 菜单与托盘

应用菜单和托盘当前提供：

- 打开或恢复 DeepRunner 主窗口。
- 打开带当前 Profile 环境的 DeepRunner Terminal。
- 检查应用更新。
- 退出应用。

当前没有桌面通知功能，也没有供第三方扩展 Tray 的 contribution contract。

Profile 是内部运行与故障恢复概念，不在日常应用菜单或托盘中展示。外观设置以 APP 内设置页为唯一用户入口，避免与原生菜单形成重复配置。

## 主题

- 主题来源只有 `system`、`light` 和 `dark`。
- Electron `nativeTheme` 与官方 DSH Client theme service 使用同一个偏好。
- 主题变化通过有序重启应用到新的 generation。
- Windows caption symbol color 随主题变化；macOS/Linux 的系统 frame 由操作系统处理。

## 未实现或待验证

- Renderer 自定义主窗口工具栏、DeepRunner root layout 和自定义 sidebar toggle 均不在当前实现中。
- macOS vibrancy 不在当前主窗口配置中。
- Windows 真机上的 Mica、caption controls、键盘和 Narrator 仍需发布级验收。
- Linux 不承诺透明材质或跨桌面环境一致的高级窗口效果。
- VoiceOver、Narrator、reduced motion 和完整键盘路径需要持续手工验收。
- 应用内嵌 PTY 和桌面通知属于后续能力。
