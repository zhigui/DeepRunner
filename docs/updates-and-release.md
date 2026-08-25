# 更新与正式发布

状态：M7 已实现；macOS 生产发布要求 Apple 签名凭据，Windows 签名暂为可选，并通过受保护的 `release` Environment 审批

## 应用内更新

DeepRunner 使用 `electron-updater` 和 electron-builder 生成的 GitHub provider 配置。应用菜单和托盘提供“Check for Updates…”，打包版本启动 30 秒后也会静默检查。

更新流程：

1. 从最新公开 GitHub Release 读取当前平台的 `latest*.yml`。
2. 发现新版本后由用户确认是否下载；应用窗口显示系统级下载进度。
3. updater 根据元数据中的 size/SHA-512 校验下载结果；已签名的 Windows 构建还会校验 Authenticode publisher，macOS Squirrel 更新要求签名应用。
4. 下载完成后用户可选择“Restart and update”，也可等到正常退出时自动安装。
5. macOS 使用 ZIP/Squirrel.Mac 替换应用；Windows 使用 per-user NSIS 静默更新；Linux 根据安装类型使用 AppImage 或 deb updater。

开发目录不会执行更新检查。更新失败或用户取消不会删除当前安装。Renderer 无法指定 provider、下载地址或安装路径。

## 发布产物

tag `v<package.version>` 触发 `.github/workflows/release.yml`：

- macOS arm64：`macos-15` 原生 runner，DMG + ZIP；
- macOS x64：`macos-15-intel` 原生 runner，DMG + ZIP；
- Windows x64：Windows runner，per-user NSIS；
- Linux x64：Ubuntu runner，AppImage + deb；
- electron-builder 同时生成 `latest.yml`、`latest-mac.yml`、`latest-linux.yml` 和更新所需的 ZIP/EXE blockmap；
- 汇总 job 合并并删除 macOS 双架构中间 metadata，逐项复验最终 metadata 中的 size/SHA-512；
- 全部 runner 先执行完整 check，`afterPack` 验证 runtime closure；
- macOS 执行 Developer ID 签名、notarization/stapling 和 Gatekeeper 复验；
- Windows 配置证书时强制执行 Authenticode 签名和 PowerShell 复验；未配置时明确生成并复验未签名安装器；
- 汇总阶段执行严格产物白名单、SHA-256 清单和 GitHub artifact attestation；
- 唯一拥有 `contents: write` 的独立发布 job 不 checkout 或执行仓库代码，先创建 draft，再下载实际字节并复验，最后才公开为 latest。

DMG 和 deb 保留给首次安装或人工恢复。macOS 后续更新实际使用 ZIP；Linux 包管理策略严格的发行版可继续通过 deb/软件仓库更新。

公开 Release 的 workflow 产物固定为 15 个文件：两种 Linux 安装包、两种架构的 macOS DMG/ZIP/ZIP blockmap、Windows EXE/EXE blockmap、三个最终更新 metadata、SPDX SBOM 和 `SHA256SUMS`。不发布 DMG blockmap、AppImage blockmap 或 `latest-mac-arm64.yml`/`latest-mac-x64.yml` 中间文件。GitHub 自动显示的 **Source code (zip)** 与 **Source code (tar.gz)** 由平台从 tag 生成，不属于 workflow 上传的产物，无法通过 release workflow 移除。

## GitHub 仓库配置

当前 electron-builder 的更新源写在 `apps/desktop/package.json`：

```json
{
  "provider": "github",
  "owner": "zhigui",
  "repo": "DeepRunner"
}
```

因此生产发布仓库应为公开仓库 `https://github.com/zhigui/DeepRunner`。如果实际仓库名或 owner 不同，先同步修改这两个字段再打包。普通用户的客户端不会携带 GitHub token；私有 GitHub Release 需要在每台用户机器提供凭据，不适合作为当前桌面应用的公开更新源。

在 GitHub 仓库中完成以下一次性设置：

1. 打开 **Settings → Actions → General**，确认仓库允许运行 GitHub Actions。组织策略不能禁止本仓库 workflow。
2. 打开 **Settings → Environments → New environment** 创建 `release`，配置 required reviewers，启用 **Prevent self-review**，关闭不必要的管理员绕过，并将 deployment branches/tags 限制为受保护的 `v*` tag。macOS、Windows 签名 job 和最终发布 job 都必须通过这个 Environment。
3. 在 `release` Environment 的 **Environment secrets** 中创建下表 macOS 必需 secrets；Windows 两项可以暂不配置。不要把签名凭据保存为 repository secrets。Environment 审批让 tag 被推送后仍需受信任维护者批准，才会把签名凭据交给 runner。参见 [GitHub：Deployment environments](https://docs.github.com/en/actions/concepts/workflows-and-actions/deployment-environments) 和 [Using secrets](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets?tool=webui)。
4. 不要创建名为 `GH_TOKEN` 的 Secret。workflow 使用 job 级 `${{ github.token }}`：默认和构建 job 均为 `contents: read`，只有不执行仓库代码的 publish job 为 `contents: write`。参见 [GitHub：GITHUB_TOKEN](https://docs.github.com/en/actions/concepts/security/github_token) 和 [workflow permissions](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#permissions)。
5. 使用 repository ruleset 保护 `main` 和 `v*` tag，只允许受信任的维护者合并 workflow 变更或创建发布 tag；对 `.github/workflows/**` 配置 CODEOWNERS 审核。能修改 release workflow 并触发 tag 的人应按发布管理员对待。
6. 保持 GitHub Actions 的 SHA pin。Dependabot 会每周提出 GitHub Actions 更新，但更新 pin 前仍应核对 action 官方仓库与 release commit。

## GitHub Secrets

| Secret | 内容 | 当前要求 |
|---|---|---|
| `DEEPRUNNER_MAC_CERT_P12_B64` | Developer ID Application P12 的 base64 | 必需 |
| `DEEPRUNNER_MAC_CERT_PASSWORD` | P12 密码 | 必需 |
| `DEEPRUNNER_APPLE_API_KEY_B64` | App Store Connect API `.p8` 的 base64 | 必需 |
| `DEEPRUNNER_APPLE_API_KEY_ID` | API key id | 必需 |
| `DEEPRUNNER_APPLE_API_ISSUER` | issuer UUID | 必需 |
| `DEEPRUNNER_APPLE_TEAM_ID` | Apple Developer Team ID | 必需 |
| `DEEPRUNNER_WINDOWS_CERT_PFX_B64` | Windows code-signing PFX 的 base64 | 可选 |
| `DEEPRUNNER_WINDOWS_CERT_PASSWORD` | PFX 密码 | 配置 PFX 时必需 |


### macOS 证书与公证信息

1. 需要有效的 Apple Developer Program 会员。按 [Apple：Create Developer ID certificates](https://developer.apple.com/help/account/certificates/create-developer-id-certificates/) 创建 **Developer ID Application** 证书，将证书及对应私钥安装到 macOS 钥匙串，再从“钥匙串访问”导出为有密码的 `.p12`。
2. 将 `.p12` 的单行 base64 填入 `DEEPRUNNER_MAC_CERT_P12_B64`，导出密码填入 `DEEPRUNNER_MAC_CERT_PASSWORD`。
3. 按 [Apple：Creating API Keys for App Store Connect API](https://developer.apple.com/documentation/appstoreconnectapi/creating-api-keys-for-app-store-connect-api)，在 App Store Connect 打开 **Users and Access → Integrations → App Store Connect API → Team Keys**，创建 Team API Key。首次使用 API 时可能需要 Account Holder 先申请访问；Team Key 需要 Account Holder 或 Admin 创建。
4. 下载只能下载一次的 `AuthKey_<KEY_ID>.p8`，将它的单行 base64 填入 `DEEPRUNNER_APPLE_API_KEY_B64`；页面显示的 Key ID 和 Issuer ID 分别填入 `DEEPRUNNER_APPLE_API_KEY_ID`、`DEEPRUNNER_APPLE_API_ISSUER`。
5. Apple Developer 账户 Membership details 中的 10 位 Team ID 填入 `DEEPRUNNER_APPLE_TEAM_ID`。

workflow 只在 macOS 签名 step 内把 `.p8` 还原到 `${{ runner.temp }}` 下的独占临时文件。脚本先验证它是 PKCS#8 EC P-256 私钥，以 `0600` 权限创建，并在 step 成功或失败退出时删除。临时路径位于 workspace 和 artifact glob 之外。

### Windows 证书

Windows 签名当前可选。两个 Windows signing secret 都未配置时，workflow 会关闭自动证书发现，生成未签名 NSIS 安装包，并确认 Authenticode 状态确实是 `NotSigned`。这不会消除浏览器、SmartScreen、“未知发布者”或组织策略拦截风险，但允许在尚未购买证书时发布。

以后配置证书时，必须同时设置 PFX 和密码；只配置其中一个会直接失败。workflow 会启用 `forceCodeSigning`，并要求 PowerShell Authenticode 状态为 `Valid`，签名失败不会静默回退为未签名安装器。证书配置方式参见 [electron-builder：Code Signing for Windows](https://www.electron.build/docs/features/code-signing/code-signing-win/)。

如果购买的是硬件 USB Token/HSM 型 EV 证书，通常不能导出成 PFX，因此不能直接套用这组 Secrets；需要把 Windows job 改为对应 CA 的云签名、Azure Trusted Signing 或 HSM 方案。electron-builder 的普通证书和 EV 证书都支持自动更新，但签名方式不同。

### 生成单行 base64

macOS 或 Linux 可用 OpenSSL，命令只输出编码结果，不要把结果提交进仓库：

```bash
openssl base64 -A -in DeveloperID.p12
openssl base64 -A -in AuthKey_ABC123XYZ.p8
openssl base64 -A -in WindowsCodeSigning.pfx
```

复制完整输出到对应 GitHub Secret。也可以安装 GitHub CLI 后直接从标准输入保存，避免经过剪贴板历史：

```bash
openssl base64 -A -in DeveloperID.p12 | gh secret set DEEPRUNNER_MAC_CERT_P12_B64 --env release
openssl base64 -A -in AuthKey_ABC123XYZ.p8 | gh secret set DEEPRUNNER_APPLE_API_KEY_B64 --env release
openssl base64 -A -in WindowsCodeSigning.pfx | gh secret set DEEPRUNNER_WINDOWS_CERT_PFX_B64 --env release
```

其余密码和 ID 可在 GitHub 页面直接填写。证书、私钥、密码和 base64 结果不得写入仓库、artifact 或日志。

## 发版步骤

1. 将根 `package.json`、desktop 以及 workspace packages 的版本更新为相同 semver，完成 release notes。新版本必须高于已安装版本。
2. 在 main 上确认三平台 CI 通过，并确认上游 pin/lockfile 未漂移。
3. 确认 Apple 证书/API key 仍有效；如果已配置 Windows 证书，也确认它仍有效，并由 release reviewer 核对即将发布的 commit。
4. 创建并推送与 `package.version` 一致的 annotated tag，例如：`git tag -a v0.1.1 -m "DeepRunner v0.1.1" && git push origin v0.1.1`。
5. 在 GitHub **Actions → Release** 观察执行并审批 `release` Environment。tag 必须严格等于 `v<package.version>`；macOS 签名/公证以及 metadata、白名单、checksum 或 attestation 失败都会阻止公开 Release。Windows 未配置证书时会按预期发布未签名安装器。
6. workflow 会上传严格白名单内的 15 个文件到 draft Release，再回下载并比较文件名与 checksum；全部成功后才公开并设为 latest。
7. 从旧版本在干净真实机器执行一次应用内更新，检查下载进度、重启安装、Deep Link、市场目录和正常退出安装。

## 回滚

- GitHub Release 保留上一稳定安装器，供人工恢复。
- 已公开版本不原地替换 artifact 或 metadata；修复通过发布更高 patch 版本完成。
- updater 默认拒绝降级，不使用 mutable metadata 强制回滚。

## 本地验证

没有 Apple 生产证书时可运行 `yarn check` 和目录打包，但不能完成正式 Release。Windows 可以暂时发布未签名 NSIS。真正的 Squirrel.Mac、NSIS、Gatekeeper、notarization、可选 Authenticode 与退出安装体验必须在目标平台、从旧版本升级到新版本验证。
