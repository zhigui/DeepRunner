# ADR-0007：主窗口使用系统所有的窗口框架

状态：Accepted  
日期：2026-08-22  

## 背景

早期实现曾让 Renderer 绘制 macOS/Windows 主窗口工具栏，并自行处理 traffic lights、拖拽区、modal 遮罩和官方 sidebar toggle。实际验证后，macOS 自定义 chrome 增加了安全区、主题、可访问性和上游布局适配成本，而这些能力由系统标题栏提供得更稳定。

## 决策

1. 主 Renderer 不创建 DeepRunner 自定义标题栏、不替换官方 root layout，也不接管官方 sidebar 状态。
2. macOS 主窗口使用完整系统 frame 和默认 title bar，由系统管理 traffic lights、拖拽、主题与可访问性。
3. Windows 保留系统 frame，使用 Electron `titleBarOverlay` 和系统 caption controls；支持时启用 Mica 背景。
4. Linux 保留窗口管理器提供的原生装饰，不开放高级材质。
5. DeepRunner Client 只安装必要的页面尺寸、主题同步、Renderer 健康和市场入口。
6. `compatibility` / `advanced` mode 暂时保留为运行时 contract 和平台策略标记，但当前两种模式都不替换官方 DSH 根布局。

## 结果

- macOS 与 Linux 的主窗口 chrome 完全由系统所有；Windows 的 overlay 仍由系统 caption controls 完成窗口操作。
- 删除 Renderer 工具栏、traffic-light 补偿、drag/no-drag CSS 和额外顶部布局偏移。
- 官方 DSH layout、sidebar、conversation、settings 和 modal 继续原样工作。
- 高级模式当前表达平台窗口选项，不表示一套自定义业务布局。
