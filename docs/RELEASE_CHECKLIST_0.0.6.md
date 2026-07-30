# 0.0.6 发布核对记录

日期：2026-07-30

## 已完成

- [x] `package.json`、`.env`、`src-tauri/Cargo.toml` 和
  `src-tauri/tauri.conf.json` 版本统一为 `0.0.6`。
- [x] `package-lock.json` 与 `src-tauri/Cargo.lock` 已更新，并解除 Git 忽略。
- [x] `npm.cmd run lint` 通过。
- [x] 前端 28 个测试文件、107 项测试通过。
- [x] `cargo fmt --check` 通过。
- [x] `cargo clippy --all-targets -- -D warnings` 通过。
- [x] Rust 76 项测试通过、0 项失败、1 项管理员 SMB 集成测试忽略。
- [x] `npm.cmd run "build window release"` 成功。
- [x] `npm.cmd run release:size:check` 通过；便携版和安装版均严格小于
  5,000,000 字节。
- [x] 同一发布命令生成普通安装版、缓存式便携版和微软商店版共 3 份产物；
  微软商店版内置 WebView2 x64 离线安装器，不受 5 MB 门禁限制。
- [x] WebView2 离线安装器为微软官方有效签名文件（203,778,256 字节，
  SHA-256 `04B9F08D839C8C06F34A85ACEA0D9F1568D3D8AA309A77619AAA46BB29ADE0F8`），
  后续构建直接复用 `src-tauri/target/webview2/` 缓存。
- [x] 缓存式 NSIS 包装器探针连续启动两次均返回 0；首次缓存 SHA-256
  匹配内层 EXE，第二次缓存文件时间戳未变化，确认没有重复解压。
- [x] 发布便携版已完成一次真实启动并创建主窗口；测试进程已停止，临时
  Beta 设置已用测试前备份恢复，`betaFeaturesEnabled` 未留在用户配置中。

## 发布产物

| 产物 | 字节数 | SHA-256 |
| --- | ---: | --- |
| `萌新工具箱 0.0.6 便携版.exe` | 4,917,338 | `AD3F3B9DD958BF01B0E24E16D23857CA89497F5AE6522786C35D04643615BF46` |
| `萌新工具箱 0.0.6 安装版.exe` | 4,941,688 | `984C6EE360EAD81A3BA72626ABC9ABD3E393A5EF4AF86B7BCD05B1D6C719C7B1` |
| `萌新工具箱 0.0.6 微软商店版.exe` | 211,360,089 | `5609E08D0A195C104152C465F216013E64E4C513CBBF044E042BA48834A02F1B` |

产物目录：`src-tauri/target/release/0.0.6/`。

## 发布阻塞项

- [ ] 使用正式 Authenticode 证书签署便携版、安装版和微软商店版；当前三份
  产物的签名状态均为 `NotSigned`。
- [ ] 当前微软商店版走未打包 EXE 提交路线。提交前需用受信任 CA 的代码签名
  证书签署安装器及其中所有 PE 文件，将不可变的版本化安装器放到 HTTPS
  下载地址，并在 Partner Center 配置 `/S` 静默安装参数。
- [ ] 补充仓库的开源许可证文件，并将适用的许可条款填入商店资料；当前仓库
  未找到 `LICENSE` 或 `COPYING` 文件，许可证种类需要产品方决定。
- [ ] 准备 Partner Center 商店资料：至少一个语言的说明、1 张截图、商店图标、
  年龄分级、市场范围和认证备注，然后提交认证。
- [x] 关闭当前正在运行的 debug 实例后，启动新的缓存式便携版，确认主窗口
  正常创建并使用 `%LOCALAPPDATA%\mxtools\portable-cache\0.0.6` 中的 EXE；
  二次启动复用缓存，未重复解压。
- [ ] 按 `docs/superpowers/manual-smoke-bugfix-sweep.md` 完成 9 项 Windows
  真机人工冒烟；本轮按维护者要求跳过界面冒烟，后续由实际使用反馈问题。
- [ ] 在实际 Apex/Steam、多显示器及混合 DPI 环境验证 APEX Q 截图、OCR
  下载/升级、引擎兜底和悬浮窗定位。
- [ ] 人工验收完成后再创建提交、`v0.0.6` 标签、推送和发布条目。

自动化工具无法捕获当前无边框 Tauri 窗口（`0x80004002`）；本轮不以自动化
界面操作替代人工验收，也未自动修改真实 Steam、输入法、RDP、防火墙或端口
转发状态。当前机器仅有一块 `2560x1440` 显示器，未运行 Steam/PUBG，
因此多显示器、混合 DPI、真实游戏配置、OCR 下载/升级和游戏联动仍未覆盖。
三份应用产物的 Authenticode 状态仍为 `NotSigned`；仅内置 WebView2 离线
安装器为微软有效签名（203,778,256 字节，SHA-256
`04B9F08D839C8C06F34A85ACEA0D9F1568D3D8AA309A77619AAA46BB29ADE0F8`）。
