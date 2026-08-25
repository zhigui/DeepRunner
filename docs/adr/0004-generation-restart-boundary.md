# ADR-0004：Profile 和模式切换以重启为边界

状态：Accepted  
日期：2026-08-17

## 背景

Profile 决定 Bundle、依赖、Host/Client plugins 和配置；高级模式还影响 BrowserWindow 原生材质、Host patch、Client layout service 和 root slot。运行中局部热切换会产生不同层不同步以及悬空 service reference。

## 决策

当前 Profile 和 presentation mode 对一个 Cordis generation 不可变。切换时：

1. 校验并持久化目标。
2. 请求有序 dispose。
3. 只有零码成功退出才 `app.relaunch()`。
4. 新进程重新组合完整 generation。

所有 DeepRunner 公共 service 都是 generation-scoped，旧 reference 在 dispose 后失败。

## 结果

- Host、Client 和 native window 始终使用一致组合。
- 切换需要完整应用重启，用户会经历短暂中断。
- 所有活跃 package、terminal 和 update operation 必须参与 dispose。
- 需要 pending、last-known-good 和防重启循环状态。

## 验证

- Profile/mode 并发选择测试。
- persistence-before-restart 测试。
- dispose 后 retained service rejection。
- relaunch 仅发生在零码退出。
- 启动失败回退和最大重试边界。

