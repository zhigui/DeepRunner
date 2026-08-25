# 工程与仓库结构

状态：当前仓库结构已实现；发布门禁持续完善

## 推荐目录

```text
DeepRunner/
├── README.md
├── package.json                 # Yarn workspace root
├── yarn.lock
├── upstream.json                # 上游源码与运行时版本记录
├── apps/
│   └── desktop/                 # Electron 入口、打包和发布
├── packages/
│   ├── desktop-plugin/          # DeepRunner Host + Client Cordis faces
│   ├── plugin-market/           # 市场 Host/Client bundle
│   ├── contracts/               # 稳定公共类型和协议
│   └── test-fixtures/           # Loader/Profile/插件测试 fixture
├── upstream/
│   └── README.md                # 可选上游源码 checkout 说明
├── scripts/                     # runtime closure、smoke、release gate
└── docs/
```

以下所有权边界保持不变：

- `apps/desktop` 拥有 Electron bootstrap 和平台发布。
- `desktop-plugin` 拥有 DeepRunner Cordis Host/Client 实现。
- `plugin-market` 只能通过公共 service 管理 Profile 和包。
- `contracts` 不导入 Electron，也不暴露 Launcher 私有事实。
- `upstream.json` 只记录官方来源、源码 commit 与运行时版本；DeepRunner feature 不修改上游源码。

## 包管理边界

- 外层 DeepRunner 使用 Yarn 4 和 `nodeLinker: node-modules`。
- 当前仓库不提交上游 submodule；如为审计或源码构建在 `upstream/deepseek-harness` 创建本地 checkout，应保留上游官方 pnpm 版本和 lockfile。
- 外层 workspace 不包含上游目录。
- DeepRunner 正常构建使用固定的已发布 `@deepseek-ai/*` 包。
- 上游源码用于审计、差异比较和兼容验证，不通过 workspace link 进入发布产物。

当前根脚本包括：

```json
{
  "scripts": {
    "build": "yarn workspaces foreach -At run build",
    "typecheck": "yarn workspaces foreach -At run typecheck",
    "test": "yarn workspaces foreach -At run test",
    "check": "yarn check:layout && yarn check:docs && yarn test:updater && yarn build && yarn typecheck && yarn test",
    "upstream:install": "cd upstream/deepseek-harness && corepack pnpm install --frozen-lockfile",
    "upstream:build": "cd upstream/deepseek-harness && corepack pnpm run build"
  }
}
```

`upstream:install` 和 `upstream:build` 只适用于维护者自行创建的可选 `upstream/deepseek-harness` checkout；普通构建与一键升级器都不依赖该目录。

## TypeScript 与构建

- Host 和 Launcher 使用严格 TypeScript ESM。
- Client face 使用 React，并以 DSH Client 平台构建。
- Host/Client 使用独立 tsconfig，防止 Node 类型泄漏进浏览器代码。
- 构建产物生成 source map 和 declaration。
- package exports 明确区分 Host、Client 和公共 contract。
- 不允许从 `src/` 深层路径形成事实上的公共 API。

## 依赖规则

- 所有 `@deepseek-ai/*` 使用同一精确版本族。
- Electron、Electron Builder、Node engine 和 native module ABI 固定。
- 禁止 `latest`、caret 或未审计的 Git dependency 进入生产依赖。
- native dependency 必须进入运行时闭包验证。
- patch 文件必须记录目标包、原始版本、原因、上游 issue 和删除条件。

## 配置与环境

- 使用上游 layered environment loader。
- `DSH_HOME` 只在受控子进程环境中设置，不伪造系统 `HOME`。
- Profile 名称必须经过固定格式校验。
- 所有生成路径必须为绝对路径、不含 NUL，并拒绝符号链接替换。
- secret 不写入日志、更新状态或市场缓存。

## 版本与来源记录

`upstream.json` 包含：

```json
{
  "repository": "https://github.com/deepseek-ai/deepseek-harness.git",
  "sourceCommit": "<commit>",
  "sourceVersion": "<version>",
  "runtimePackageVersion": "<version>",
  "electronVersion": "<version>",
  "updatedAt": "<ISO-8601>"
}
```

更新 source pin、运行时包族和 Electron 应分别提交，以便定位兼容性回归。

### 上游 Harness 一键升级

日常升级不再手工编辑 package family 和 lockfile。在仓库根目录运行：

```sh
corepack yarn upstream:update --dry-run
corepack yarn upstream:update
```

升级器会解析最新官方 `dsh-v*` tag、同步 workspace manifests、处理停止发布或新增的 DSH 模块、重建桌面运行时闭包、刷新 `yarn.lock` 并运行完整检查。指定版本和打包模式等详细说明见 [DeepSeek Harness 上游升级](upstream-maintenance.md)。

## CI 基线

每次提交至少运行：

- layout 与版本一致性检查。
- build、typecheck、lint、unit tests。
- Host Loader smoke。
- Profile composition smoke。
- Renderer Client boot smoke。
- runtime closure 和许可证检查。

目标平台流水线还应运行打包和真实启动 smoke。详见 [测试与质量](testing-and-quality.md)。
