# ADR-0003：只读上游 pin 与独立 workspace

状态：Accepted  

替代说明：提交只读 Git submodule 的部分已由 [ADR-0008](0008-upstream-metadata-pin.md) 替代；独立 workspace、精确运行时包和不修改上游源码的边界继续有效。
日期：2026-08-17

## 背景

DeepRunner 需要审计和对比 DeepSeek Harness 源码，但不能让产品 feature commit 改写上游。上游使用自己的 pnpm workspace；把它加入 DeepRunner 的包管理图会破坏锁文件和发布可复现性。

## 决策

- `upstream/deepseek-harness` 作为只读 Git submodule 固定到官方 commit。
- DeepRunner 外层使用独立 Yarn workspace 和 lockfile。
- 上游目录不属于外层 workspace。
- 产品构建使用精确固定的已发布 `@deepseek-ai/*` 包。
- `upstream.json` 分别记录源码 commit/version 与运行时 package version。
- 上游 pin 和运行时 family 的变更分别提交并验证。

## 结果

- 上游与产品代码所有权清晰。
- 可以机械检查意外 submodule 修改。
- 开发者需要维护 Yarn 与 pnpm 两套有意隔离的工具链。
- 源码版本与 npm artifact 可能不完全对应，必须明确记录而不是假设。

## 验证

`check:layout` 必须校验 submodule URL、commit、dirty state、workspace 成员、package manager 和 DSH package family。
