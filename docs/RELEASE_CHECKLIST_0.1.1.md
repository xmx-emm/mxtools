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
- [ ] 重新生成 `0.1.1` 安装版和便携版后运行 `npm run release:size:check`。

## 在线更新验证

- [x] 使用上一版已签名产物验证安装版更新清单、签名校验和篡改拒绝（本地回环 HTTP，不执行安装）。
- [x] 使用上一版已签名产物验证便携版更新清单、签名校验和篡改拒绝（本地回环 HTTP，不执行替换）。
- [x] 运行隔离便携版 fixture，验证退出握手、替换、重启和再次启动。
- [ ] 在一次性 GitHub Windows runner 上从已发布旧版安装器执行真实 NSIS 升级、启动和保持运行检查。
- [ ] 在同一 runner 上对新 `0.1.1` 产物执行发布目录验签。

## 产物与人工验收

- [ ] 运行 `npm.cmd run "build window release"`，记录安装版、便携版（以及可选商店版）的字节数与 SHA-256。
- [ ] 将最终产物校验值回填到本文件和 `docs/releases/0.1.1.md`。
- [ ] 完成 Windows 100%/125% 缩放、无边框窗口和独立工具窗口冒烟。
- [ ] 在受控 Steam/EA 环境验证 Apex 配置、语音下载、更新安装与回滚。
- [ ] 确认发布说明准确披露 Authenticode 状态、校验值和仍未覆盖的人工验证。

## 当前阻塞

- 本地没有 `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`，无法在此环境生成新的签名发布产物。
- 当前 `src-tauri/target/release/0.1.0` 产物早于 `0.1.1` 版本改动，不能作为 `0.1.1` 发布附件。
