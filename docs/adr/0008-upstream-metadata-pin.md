# ADR-0008：使用来源元数据 pin，不提交上游 checkout

状态：Accepted  
日期：2026-08-24  
替代：ADR-0003 中提交只读 Git submodule 和对其执行布局检查的决定

## 背景

DeepRunner 的生产运行时来自 NPM 上固定版本的 `@deepseek-ai/*` package family。完整上游源码不参与 workspace link、构建或打包，提交 submodule 会增加 checkout 和 CI 成本，却不会改变实际发布闭包。

## 决策

1. `upstream.json` 记录官方 repository、source version、完整 source commit、runtime package version 和 Electron version。
2. 一键升级器从官方 Git tags 解析源码 commit，从 NPM registry 解析发布包，并同步 workspace manifests 与 lockfile。
3. 仓库不提交 `upstream/deepseek-harness` gitlink 或源码副本。
4. 维护者可以为审计、差异比较或上游源码构建创建本地 checkout；该目录不进入 DeepRunner 的普通构建与发布产物。
5. DeepRunner feature 仍不得修改或复制上游源码来绕过公开 contract。

## 结果

- 普通 checkout、CI 和发布只处理实际使用的固定 NPM 运行时闭包。
- 来源版本与源码 commit 仍可审计，但本地源码 checkout 的存在和 dirty state 不再是布局门禁。
- `upstream:version`、`upstream:install` 和 `upstream:build` 成为可选 checkout 的维护命令，不是普通开发前置条件。
