# DeepSeek Harness 上游升级

状态：一键升级器已实现并通过真实升级、重复执行和完整测试验证

## 日常使用

在 DeepRunner 根目录执行：

```sh
corepack yarn upstream:update
```

该命令默认查找官方仓库中版本最高的 `dsh-v*` tag，完成依赖和来源记录更新，然后运行完整的 build、typecheck 和 test 门禁。

修改文件前建议先预览：

```sh
corepack yarn upstream:update --dry-run
```

升级到指定版本：

```sh
corepack yarn upstream:update --version 0.1.1-rc.2
```

在完整检查后继续生成并验证当前平台目录包：

```sh
corepack yarn upstream:update --package
```

仅在故障排查或分阶段验证时跳过完整检查：

```sh
corepack yarn upstream:update --skip-check
```

`--skip-check` 不能用于发布判定；后续仍必须运行 `corepack yarn check` 和目标平台 packaged smoke。

## 自动执行内容

升级器位于 `scripts/update-dsh.mjs`，执行以下流程：

1. 从官方 Git repository 读取全部 `dsh-v*` tag，并按 SemVer 选择目标版本。
2. 解析 lightweight 或 annotated tag 对应的完整源码 commit。
3. 确认目标 `@deepseek-ai/dsh` 已发布到当前 npm registry。
4. 更新 `upstream.json` 中的 source commit、source version、runtime package version 和更新时间。
5. 同步各 workspace 的直接 DSH dependencies、devDependencies、optionalDependencies 和 peerDependencies。
6. 先让 Yarn 批量解析目标版本；遇到 `No candidates found` 时，从 manifests 中删除上游已停止发布的模块并重新解析。
7. 从安装后的 package manifests 遍历 dependencies、optionalDependencies 和非可选 peerDependencies，生成 `apps/desktop` 的完整 DSH 运行时闭包。
8. 重复安装与闭包计算，直到新增 peer、模块拆分和模块删除全部收敛。
9. 只更新明确声明的 DeepRunner runtime baseline，不扫描或替换第三方兼容范围、测试和说明文档。
10. 刷新共享 `yarn.lock`，并默认运行仓库完整检查。

根 `package.json` 不直接声明 DSH。DeepRunner 是 Yarn Workspaces 项目，桌面生产依赖位于 `apps/desktop/package.json`，插件所需依赖位于各自 workspace manifest；根 `yarn.lock` 统一锁定所有 workspace 的直接和传递依赖。

## 安全与失败行为

- `--dry-run` 会访问 GitHub 和 npm，但不写入任何文件，也不运行安装或测试。
- manifest 和 `upstream.json` 使用临时文件加 rename 的方式原子写入。
- 脚本不会执行 `git reset`、checkout 或自动覆盖整个工作树，因此可以保留升级前已有的未提交修改。
- 如果安装、编译或测试失败，脚本保留已经生成的升级 diff，便于检查 API 破坏性变更；不会用回滚覆盖用户文件。
- 重复执行同一版本是幂等的：来源 pin、runtime closure 和 lockfile 收敛后不会继续产生文件变化。
- Yarn 可能继续报告插件 workspace 的宿主型 peer warning；升级门禁关注 desktop runtime 是否仍缺 peer、命令是否非零退出，以及完整测试/packaged smoke 是否通过。

## 验证与发布

普通上游维护至少要求：

```sh
corepack yarn upstream:update
git diff --check
```

准备发布时还必须执行：

```sh
corepack yarn package:dir
corepack yarn verify:packaged-runtime apps/desktop/release/mac-arm64/DeepRunner.app
corepack yarn smoke:packaged-runtime apps/desktop/release/mac-arm64/DeepRunner.app
corepack yarn smoke:packaged-app apps/desktop/release/mac-arm64/DeepRunner.app
```

上面的路径是 macOS arm64 示例；Windows、Linux 和其他架构必须使用对应平台产物路径，并遵循[测试与质量门禁](testing-and-quality.md)中的平台矩阵。

## 升级器自身维护

纯逻辑测试位于 `scripts/update-dsh.test.mjs`，覆盖版本选择、参数解析、运行时闭包、缺失 peer、已停止发布模块、workspace manifest 更新，以及 runtime baseline 的定点更新。测试会确认第三方范围和历史文案不会被替换。测试已接入根 `corepack yarn check`，也可以单独运行：

```sh
corepack yarn test:updater
```

当上游改变 tag 命名、registry 发布方式或 package graph contract 时，应先更新这些测试，再调整升级器实现。
