# Microsoft Store (MSIX) 发布

## 1. Partner Center 准备（一次性）

1. 在 Partner Center 注册个人开发者账号（免费），新建应用并保留名称“萌新工具箱”。
2. 打开 **产品管理 → 产品标识**，记下三项值：
   - `Package/Identity/Name`，例如 `12345emm.MxTools`
   - `Package/Identity/Publisher`，例如 `CN=XXXXXXXX-XXXX-...`
   - `Package/Properties/PublisherDisplayName`
3. 隐私政策 URL：https://mxtools.0w0.online/privacy/ （由 mxtools-web 部署）。

## 2. 打包

已保留的产品标识已作为默认值写入 `scripts/msix-manifest.mjs`（公开信息，非机密）：
Name `E07AF1E3.32085AA70E6E3`，Publisher `CN=F6867E07-8222-4811-89A6-2D342305EFCF`，
PublisherDisplayName `小萌新`。如需覆盖，设置 `MXTOOLS_MSIX_*` 环境变量：

```powershell
npm run "build window msix"
```

- 打包已有的 exe：`npm run "build window msix" -- --skip-build`。
- 产物路径：`src-tauri/target/release/<version>/msix/MxTools_<version>.0_x64.msix`。
- 需要安装 Windows 10/11 SDK（提供 makeappx）。
- 包不签名，商店上传后会自动签名。
- 版本号取自 `tauri.conf.json`，格式为 `X.Y.Z.0`。每次提交的版本号必须比上次高。

## 3. 提交

在“程序包”页上传 `.msix`，然后填写年龄分级、商店描述和截图。

- 隐私政策 URL：https://mxtools.0w0.online/privacy/
- 使用条款（“其他许可条款”）：https://mxtools.0w0.online/terms/
- 支持联系：https://github.com/xmx-emm/mxtools/issues
- 类别：实用工具和工具（Utilities & tools）；价格：免费，无应用内购买。

受限功能需要填写说明，可参考以下内容：

- `runFullTrust`：桌面 Win32 应用（Tauri/WebView2），需要完整信任才能运行。
- `allowElevation`：网络修复、远程桌面、文件夹共享等系统设置需要经用户 UAC 确认后，以管理员身份重新启动。
- `unvirtualizedResources`：应用修改游戏（Apex、PUBG）位于 `%LOCALAPPDATA%` 的配置文件，以及游戏读取的 HKCU 设置。这些写入必须对游戏本身可见，因此关闭了写入虚拟化。

### 商店描述（中文）

> 萌新工具箱是一款完全免费的游戏配置工具：没有付费功能、没有广告、不收集遥测数据。
>
> **Apex 英雄**
> - 可视化编辑画面配置（videoconfig）、游戏设置和启动项，修改前可预览差异并自动备份。
> - 导入、导出和分享配置预设；可选登录后浏览和发布在线预设。
> - 检查语音包是否完整，提供手动下载指引；诊断常见的游戏启动问题。
>
> **PUBG：绝地求生**
> - 管理启动项和常用配置。
>
> **Windows 工具**
> - 网络修复、远程桌面、文件夹共享、输入法、端口转发、雷蛇鼠标回报率等常用设置。
>
> 本应用只修改本地配置文件和启动选项，不读写游戏内存、不注入代码、不提供任何作弊功能。
>
> 系统更改说明：网络修复、远程桌面、文件夹共享、端口转发等功能会修改 Windows 系统设置，每次操作都需要你确认，并经 Windows UAC 授权后执行。
>
> 本应用为独立第三方工具，与 Electronic Arts、Respawn Entertainment、KRAFTON、PUBG Studios、Razer、Valve 均无关联，也未获其认可。所有商标归各自权利人所有。

### Store description (English)

> MXTools is a completely free game configuration toolkit: no paid features, no ads, no telemetry.
>
> **Apex Legends**
> - Edit video config, game settings and launch options visually, with a diff preview and automatic backups.
> - Import, export and share presets; optionally sign in to browse and publish online presets.
> - Check voice pack completeness with manual download guidance, and diagnose common launch problems.
>
> **PUBG: BATTLEGROUNDS**
> - Manage launch options and common settings.
>
> **Windows tools**
> - Network repair, Remote Desktop, folder sharing, input method, port forwarding and Razer mouse polling rate.
>
> MXTools only edits local configuration files and launch options. It never reads or writes game memory, injects code or provides cheats.
>
> System changes: network repair, Remote Desktop, folder sharing and port forwarding change Windows settings. Each action asks for your confirmation and runs only after Windows UAC approval.
>
> MXTools is an independent third-party tool. It is not affiliated with or endorsed by Electronic Arts, Respawn Entertainment, KRAFTON, PUBG Studios, Razer or Valve. All trademarks belong to their respective owners.

截图使用应用真实界面（1366×768 以上），不要使用游戏官方美术素材。

### 年龄分级（IARC 问卷）

- 应用类型选“非游戏应用”（工具）。
- 无暴力、性、赌博、毒品内容；不分享用户位置；无应用内购买。
- 存在用户生成内容：在线预设和评论（需登录、可举报、管理员可删除）。如实回答“用户可以互动或分享内容”。
- 预期结果约为 12+ / PEGI 12（因用户互动），以问卷实际结果为准。

### 提交前自检（WACK）

- 在本机用 Windows App Certification Kit 测试已旁加载的包（见第 5 节），重点看“包合规性”“受限功能”“二进制检查”。
- 全信任桌面应用的部分 WACK 警告（如 `allowElevation`、WebView2 未打包）属于预期，不会单独导致拒审；失败项必须修复。
- 确认安装后能正常启动、卸载后无残留进程；首次启动不需要管理员权限。

## 4. 商店版行为差异

- 商店版带有包标识，关于页显示“微软商店版”。
- 内置在线更新关闭，由商店负责更新。
- 开机自启（Run 键）不可用，设置页和雷蛇回报率页隐藏该开关。以后如需支持，要在清单里添加 `StartupTask`。
- 设置页隐藏“应用更新”区（含 GitHub 发布页链接）。
- MSIX 不包含 WebView2 运行时。Win11 已自带；Win10 极少数精简系统需要另装 WebView2。

## 5. 本地旁加载测试（可选）

本地安装前，需要自签名证书，并且证书主题要等于 Publisher：

```powershell
$cert = New-SelfSignedCertificate -Type Custom -Subject "CN=F6867E07-8222-4811-89A6-2D342305EFCF" `
  -KeyUsage DigitalSignature -CertStoreLocation Cert:\CurrentUser\My `
  -TextExtension @("2.5.29.37={text}1.3.6.1.5.5.7.3.3", "2.5.29.19={text}")
signtool sign /fd SHA256 /sha1 $cert.Thumbprint <msix>
```

签名后，把证书导入“受信任的人”存储，再双击 `.msix` 安装。
