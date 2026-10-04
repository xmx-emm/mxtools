# 0.1.1 发布检查清单

日期：2026-10-04

## 发布输入

- [x] `package.json`、`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json` 和锁文件均为 `0.1.1`。
- [x] CI 与发布流程固定 `windows_tool` 提交 `63be28c24cc093a8d160d902cb983331dc9c9e2e`。
- [x] 发布输入检查通过，`windows_tool` 工作树干净。

## 自动化门禁

- [x] `npm run lint`
- [x] `npm test`
- [x] `npm run build` 与 `npm run bundle:check`
- [x] `cargo fmt --check`
- [x] `cargo clippy --all-targets --locked -- -D warnings`
- [x] `cargo test --locked`
- [x] `npm run test:apex-video-native`（47/47）
- [x] `git diff --check`
- [x] GitHub Windows Runner 重新生成 `0.1.1` 安装版和便携版并通过 `release:size:check`。

## 在线更新验证

- [x] 使用上一版已签名产物验证安装版更新清单、签名校验和篡改拒绝（本地回环 HTTP，不执行安装）。
- [x] 使用上一版已签名产物验证便携版更新清单、签名校验和篡改拒绝（本地回环 HTTP，不执行替换）。
- [x] 运行隔离便携版 fixture，验证退出握手、替换、重启和再次启动。
- [x] 在一次性 GitHub Windows Runner 上从已发布旧版安装器执行真实 NSIS 升级、启动和保持运行检查。
- [x] 在同一 Runner 上对新 `0.1.1` 产物执行发布目录验签。

## 产物与人工验收

- [x] 运行 `npm.cmd run "build window release"`，记录安装版和便携版的字节数与 SHA-256。
- [x] 将最终产物校验值回填到本文件和 `docs/releases/0.1.1.md`。
- [x] GitHub Release 已公开发布，便携版先于安装版上传，签名文件和 `latest.json` 随后上传。
- [x] Gitee 镜像同步完成；首次上传因网络超时失败后已从断点成功重跑。
- [ ] 完成 Windows 100%/125% 缩放、无边框窗口和独立工具窗口冒烟。
- [ ] 在受控 Steam/EA 环境验证 Apex 配置、语音下载、更新安装与回滚。
- [x] 确认发布说明准确披露 Authenticode 状态、校验值和仍未覆盖的人工验证。

## 当前阻塞

- GitHub/Gitee 正式发布和签名产物验收已完成；本地仍不保存生产签名密钥，也不复用 Runner 产物进行本地重建。
- Windows 100%/125% 缩放、无边框窗口，以及受控 Steam/EA 环境的人工验收仍不属于本次自动发布门禁。
