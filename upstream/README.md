# 可选的上游源码 checkout

DeepRunner 的普通构建使用固定版本的已发布 `@deepseek-ai/*` 包，不需要完整的 DeepSeek Harness 源码。官方仓库、版本和对应 commit 记录在根目录 `upstream.json`，`scripts/update-dsh.mjs` 通过远程 Git tags 与 NPM registry 维护这些记录。

需要审计、比较或构建上游源码时，可以在此目录创建不提交到 DeepRunner 的本地 checkout：

```sh
git clone https://github.com/deepseek-ai/deepseek-harness.git upstream/deepseek-harness
git -C upstream/deepseek-harness checkout "$(node -p \"require('./upstream.json').sourceCommit\")"
```

不要提交该 checkout，也不要从 DeepRunner feature branch 修改其中的文件。`corepack yarn upstream:version`、`upstream:install` 和 `upstream:build` 只有在此可选目录存在时才可用。
