# 0.0.6 发布核对记录

日期：2026-07-28

## 已完成

- [x] `package.json`、`.env`、`src-tauri/Cargo.toml` 和
  `src-tauri/tauri.conf.json` 版本统一为 `0.0.6`。
- [x] `package-lock.json` 与 `src-tauri/Cargo.lock` 已更新，并解除 Git 忽略。
- [x] `npm.cmd run lint` 通过。
- [x] 前端 11 个测试文件、54 项测试通过。
- [x] `cargo fmt --check` 通过。
- [x] `cargo clippy --all-targets -- -D warnings` 通过。
- [x] Rust 63 项测试通过、0 项失败、1 项管理员 SMB 集成测试忽略。
- [x] `npm.cmd run "build window release"` 成功。
- [x] 0.0.6 便携版能够启动并创建主窗口。

## 发布产物

| 产物 | 字节数 | SHA-256 |
| --- | ---: | --- |
| `萌新工具箱 0.0.6 便携版.exe` | 9,579,008 | `FE070DAC7AE9FE7080AEEF5BF4E034F9B9E67BEAFB9C6CA2496152E2B592EB9B` |
| `萌新工具箱 0.0.6 安装版.exe` | 4,578,317 | `A205B7249D7926AFFD1D2176D154D540EA226550ECC5028672C029D5B575ABED` |

产物目录：`src-tauri/target/release/0.0.6/`。

## 发布阻塞项

- [ ] 使用正式 Authenticode 证书签署便携版和安装版；当前签名状态为
  `NotSigned`。
- [ ] 按 `docs/superpowers/manual-smoke-bugfix-sweep.md` 完成 9 项 Windows
  真机人工冒烟。
- [ ] 在实际 Apex/Steam、多显示器及混合 DPI 环境验证 Alter Q 截图、OCR
  下载/升级、引擎兜底和悬浮窗定位。
- [ ] 人工验收完成后再创建提交、`v0.0.6` 标签、推送和发布条目。

自动化工具无法捕获当前无边框 Tauri 窗口（`0x80004002`），因此未通过盲点操作
代替人工 UI 验收，也未自动修改真实 Steam、输入法、RDP、防火墙或端口转发状态。
