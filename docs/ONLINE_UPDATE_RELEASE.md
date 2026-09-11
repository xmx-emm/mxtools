# 签名在线更新与正式发布

从 0.0.8 开始，普通安装版内置 Tauri 更新公钥。旧版本需要手动安装一次
0.0.8。已发布的 0.0.8 便携版仍需手动替换 EXE；新的便携启动器支持独立便携
更新通道，需要先手动换成包含此功能的新版便携 EXE，后续才可应用内更新。
系统商店包由商店管理。Tauri 更新签名不等于
Windows Authenticode，不能据此宣称已获得受信任发布者证书。

## 发布

1. 同步更新 `package.json`、`package-lock.json`、`src-tauri/Cargo.toml`、
   `src-tauri/Cargo.lock`、`src-tauri/tauri.conf.json` 的版本；编写 `docs/releases/<版本>.md`。
2. 提交并推送 GitHub `master`。
3. 在 Actions 手动运行 **Publish signed Windows release**。

工作流只构建已提交的源码，固定检出 `windows_tool` 依赖版本。它执行代码检查、
单元测试、三种 Windows 产物构建和体积门禁，再在临时 Windows runner 上安装
已知 SHA-256 的 0.0.7 安装包，通过真实 updater 插件验证新包、拒绝修改后的包、
调用 NSIS 更新，并检查新版本进程重新启动。只有这些步骤成功才发布 GitHub Release。
该测试验证原生更新和安装路径，不代表用户主窗口中的每个交互都经过自动化点击。

更新包名固定为 `MxTools_<版本>_x64_setup.exe`，清单 URL 与此一致。
中文是 Release 显示标签，不参与更新校验。发布附件还包含 `.exe.sig`、
`latest.json`、便携包和离线包。已发布版本不会原地覆盖。
新清单同时提供 `windows-x86_64-portable`，指向 `MxTools_<版本>_x64_portable.exe`，
并发布该便携文件自己的 `.exe.sig`。两种包分别签名，不能互换。

由于默认 `GITHUB_TOKEN` 创建的发行不会触发新的发行事件，发布工作流明确调用
Gitee 同步工作流。手工在 GitHub 发布的正式 Release 仍可由 `release.published` 自动同步。
若附件上传中断，草稿保留；脚本不使用 `--clobber`，需要先核查草稿附件再重新上传。
若发布已成功而 Gitee 同步失败，只需重跑 **Sync release to Gitee**，不用重建或重新发布。

## 国内清单与回退

- Gitee：`https://gitee.com/mengxin_code/mxtools/raw/updates/latest.json`
- GitHub：`https://github.com/xmx-emm/mxtools/releases/latest/download/latest.json`

Gitee 清单仅在对应安装包和签名附件已上传、下载 SHA-256 一致后发布。
更新独立 `updates` 分支，不移动 Gitee 代码主分支；补同步旧版本不会使清单降级。
清单保留原签名，仅替换为实际 Gitee 安装包 URL。
包含便携通道时，便携附件和签名也必须验证通过，才能发布完整清单。

客户端优先检查 Gitee。检查失败、清单无效或没有更高版本时再检查 GitHub。
下载失败时仅允许回退到相同版本、相同签名的 GitHub 安装包；发布期间版本发生变化
会要求重新检查。每次下载都由 Tauri 验签；校验未通过的字节不会交给安装器。
清单检查每源最多 15 秒，下载每源最多 180 秒。回退会重置下载进度。

## 便携更新

启动器向缓存内的程序提供原 EXE 路径和进程 ID，原生端核对实际进程映像。
缺少这套协议的旧启动器、直接运行缓存程序和开发构建仍显示手动更新。
便携版只选择便携清单目标，继续使用 Tauri 下载验签及同版本同签名回退。

验证后的包暂存到原 EXE 同目录下随机命名的 `.mxtools-update-*` 子目录。
原缓存程序以独立更新辅助进程启动，在进入 Tauri/单实例逻辑之前处理更新；
辅助进程再次验签并取得两个旧进程的句柄，然后通知应用可以退出。
应用退出时保留后台恢复和 Tauri 清理，外层启动器随之退出。
辅助进程等待两者退出，检查旧文件未被修改，备份并替换原 EXE，然后从原路径重启。
用户自定义文件名、位置不变；文件名带旧版本号时也保留，但内容已更新。

只读文件/目录不能原地更新，需移到可写位置；更新失败保留原文件，替换或启动失败
尝试恢复备份。退出后失败通过原生提示框和暂存目录中的 `error.txt` 报告；无法恢复时
备份留在 `previous.exe`，不能静默丢弃。启动成功后删除本次暂存文件。
旧版本缓存继续保留，遵循现有便携缓存策略。不写安装信息、不创建卸载器。
已开启的便携开机自启使用原启动器路径；更新时仅迁移确实指向当前旧缓存的启用项，
不改其它安装位置的自启项。未开启自启时不会因更新而开启。

`./scripts/test-portable-update.ps1` 使用临时签名密钥和隔离 NSIS 便携夹具验证：
中文/空格/自定义文件名、真实父进程身份、退出前不替换、签名包替换、重启和再次启动。
Rust 专项测试额外覆盖篡改、错误父进程、目标变化和启动失败回滚。

## 密钥与本机构建

公钥保存在 `src-tauri/tauri.conf.json`，客户端和构建器使用同一来源。
GitHub 仓库需配置 `TAURI_SIGNING_PRIVATE_KEY`、`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
及 `GITEE_TOKEN` Secrets。私钥和密码不进入源代码或发行附件。

维护者本机的加密私钥位于 `%USERPROFILE%\.tauri\mxtools\updater.key`，
对应公钥为 `updater.key.pub`。`password.dpapi` 由 Windows 当前用户加密保存。
本机构建可运行 `./scripts/build-signed-release.ps1`，它临时加载密钥环境变量，
构建后恢复原值。标准 `build window release` 现在要求签名配置；普通开发构建不受影响。

应额外备份加密私钥和密码到维护者自己的安全存储。仅复制 `password.dpapi`
到另一台电脑通常无法解密；不要把它当成可跨机器恢复的密码备份。
不要为了重新构建而重新生成密钥；更换公钥会使旧客户端不能验证新密钥签名的更新。

## 验证范围

脚本测试覆盖清单文件名、已验证附件映射、旧版本保护、同版本冲突和幂等重试。
Rust 测试使用独立测试公钥/签名，覆盖网络和非法清单回退、版本比较、真实签名下载、
篡改拒绝及下载回退时的版本/签名锁定。
需要实际安装的 Rust 测试默认 ignored，仅由发布工作流在隔离 Windows runner 显式运行。
