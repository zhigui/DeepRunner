# 待决问题

状态：待决定

这里只保留尚未由代码、发布配置或 ADR 回答的问题。作出决定后，应创建 ADR 或更新对应专题，并从本页移除。

## 产品与平台

1. macOS Intel 的支持周期多长？
2. Windows、Linux 和 macOS x64 的发布级 packaged smoke 与 UI 真机验收由谁维护？

## 上游与许可

3. DeepRunner 是否发布为开源项目？采用哪种许可证？当前 package 均为 `UNLICENSED`。
4. 重新分发依赖所需的许可证汇总和 third-party notice 采用什么生成与审核流程？

## 插件市场

5. M8 是否开放多个用户自定义 source，还是只支持组织管理员配置的私有 source？
6. 发布者身份和远程目录签名使用 Git 签名、Sigstore 还是独立 key？
7. “已验证发布者”具体要求源码可用、CI evidence、人工审核中的哪些条件？
8. 插件权限提示继续使用静态 metadata，还是根据 Cordis service/tool registration 生成？
9. 是否支持本地、私有或直接 GitHub 制品；若支持，如何定义不可变身份、完整性和更新策略？

## UI 与终端

10. 内嵌 PTY 是否进入下一阶段，还是长期保留系统终端方案？
11. 是否增加桌面通知；若增加，哪些 Session 事件可以触发以及如何避免泄露内容？

## 更新与分发

12. 是否需要企业离线更新、固定版本通道或 GitHub Releases 镜像？
13. 生产 Apple/Windows 签名凭据由谁保管、轮换和执行应急吊销？

## 建议最先确认

公开发布前至少确认许可证、third-party notice、签名凭据所有权和各平台真机验收责任。自定义市场源与内嵌 PTY 在规划 M8 时确认。
