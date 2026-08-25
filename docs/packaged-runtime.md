# 安装包与 Node 运行时闭包

状态：macOS arm64 目录产物的静态、命令/native 与真实 Renderer 冒烟已通过；Windows/Linux、签名和安装器验证仍待完成

## 结论

DeepRunner 安装包直接携带固定版本的 `@deepseek-ai/dsh` package family、pnpm、native modules 和所有传递生产依赖。用户不需要预装全局 Node、pnpm 或 `dsh`。

源码子模块与发布运行时是两条独立供应链：前者用于架构参考、升级审阅和兼容性对照；安装包中的运行时代码来自 `yarn.lock` 固定的 npm packages。

## 发布闭包

Electron Builder 以 `apps/desktop` 为 deploy root，只收集该 workspace 的生产依赖。当前产物布局如下：

```text
DeepRunner.app/Contents/Resources/
├── app.asar                 # 可解析的逻辑模块树
└── app.asar.unpacked/       # 相同条目的真实文件系统镜像
    ├── lib/
    └── node_modules/
        ├── @deepseek-ai/dsh/
        ├── @deepseek-ai/dsh-app-boot/
        ├── @deepseek-ai/dsh-web-app/
        ├── pnpm/
        ├── node-pty/
        └── koffi/
```

整个生产 `node_modules` 目前有意进入 `app.asar.unpacked`。原因不是 native module 一项：Profile 初始化与损坏修复会把上游 preset 和桌面插件目录作为 fallback 创建符号链接。ASAR 内路径是 Electron 的虚拟路径，不能成为操作系统符号链接的可靠目标，因此这些 package 必须有物理目录。

打包配置同时排除：

- 开发依赖中的第二份 `node_modules/electron`；应用外层已经包含 Electron Framework。
- DeepRunner workspace package 的 `src`、测试和构建配置。
- 未进入 desktop 生产依赖图的 fixture 和工具包。

macOS arm64 的当前无签名目录产物约为 507 MB，其中 `app.asar` 约 5.7 MB、`app.asar.unpacked` 约 225 MB。此前重复携带 Electron 的产物约为 812 MB；这一轮移除了约 300 MB 的重复运行时。体积会随 Electron 和 DSH package family 变化，数字不是发布 contract。

## ASAR 路径规则

Node 从 `app.asar` 加载 JavaScript 时，普通模块解析可以工作；子进程入口、native addon、配置 fallback 和符号链接目标则必须使用真实路径。

运行时路径分为两个明确的锚点：

1. 桌面应用自身的 `package.json` 是生产依赖闭包根，用于修复 `$DSH_HOME/profiles/node_modules`，保证 DSH 与 `@deeprunner/desktop-plugin` 都可被 Profile 和 Client Module Registry 解析。
2. `packagedDependencyPath(import.meta.url, entry)` 用于定位具体生产依赖入口；`unpackedAsarPath()` 在打包环境把 `app.asar` 映射为 `app.asar.unpacked`，开发环境保持原路径。

Loader 的 `baseUrl` 指向 Profile 自身的 `package.json`，由 Node 向上解析到修复后的物理 fallback。这个约束很重要：如果用嵌套的 `@deepseek-ai/dsh/package.json` 作为闭包根，DSH 可以启动，但桌面 Client package 不在解析闭包中，最终会从 `window.__DSH_BOOT__` 静默缺失。

## 自动门禁

Electron Builder 的 `afterPack` 会在签名和生成安装器前失败退出，除非同时满足：

- DSH CLI、app boot、web app、pnpm、native module 和 DeepRunner Host 的关键 entry 存在于 archive。
- archive 中每个运行时条目都有 `app.asar.unpacked` 物理镜像。
- 关键 package exports 能从物理解包根解析，且结果没有逃逸该根目录。
- 产物不包含第二份 `node_modules/electron`。

验证命令：

```sh
corepack yarn package:dir
corepack yarn verify:packaged-runtime apps/desktop/release/mac-arm64/DeepRunner.app
corepack yarn smoke:packaged-runtime apps/desktop/release/mac-arm64/DeepRunner.app
corepack yarn smoke:packaged-app apps/desktop/release/mac-arm64/DeepRunner.app
corepack yarn check
```

`verify:packaged-runtime` 检查 archive/物理镜像和 exports；`smoke:packaged-runtime` 通过安装包内 Electron 的 Node 模式运行 DSH、pnpm，并加载 `node-pty`、`koffi`；`smoke:packaged-app` 使用隔离的 HOME、DSH_HOME、Chromium user-data 和净化后的 PATH 启动真实应用，直到桌面 Client 插件报告 Renderer 健康后自动退出。

`package:dir` 只生成无签名目录产物。上述三项已在 macOS arm64 通过，但不等同于三平台发布验证；macOS 公证、Windows NSIS、Linux 发行格式与对应平台 native ABI/真实 UI 仍必须在目标 OS runner 上执行。

## 后续瘦身边界

只有在 Profile fallback 不再依赖 package 目录符号链接，或改为构建期生成最小只读 runtime overlay 后，才能把纯 JavaScript 依赖留在 ASAR、只解包 native/可执行/资源文件。在此之前用通配规则缩小 `asarUnpack` 会产生“开发环境正常、安装包首次启动或修复 Profile 失败”的隐蔽回归。
