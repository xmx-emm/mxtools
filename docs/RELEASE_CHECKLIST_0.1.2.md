# 0.1.2 发布检查清单

日期：2026-10-06

## 发布输入

- [x] `package.json`、`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json` 和锁文件均为 `0.1.2`。
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
- [ ] GitHub Windows Runner 重新生成 `0.1.2` 安装版和便携版并通过 `release:size:check`

## 在线更新验证

- [ ] 使用上一版已签名产物验证安装版更新清单、签名校验和篡改拒绝。
- [ ] 使用上一版已签名产物验证便携版更新清单、签名校验和篡改拒绝。
- [ ] 运行隔离便携版 fixture，验证退出握手、替换、重启和再次启动。
- [ ] 在一次性 GitHub Windows Runner 上从已发布旧版安装器执行真实 NSIS 升级、启动和保持运行检查。
- [ ] 对新 `0.1.2` 产物执行发布目录验签。

## 产物与人工验收

- [ ] 运行 `npm.cmd run "build window release"`，记录安装版和便携版的字节数与 SHA-256。
- [ ] 将最终产物校验值回填到本文件和 `docs/releases/0.1.2.md`。
- [ ] GitHub Release 已公开发布，便携版先于安装版上传，签名文件和 `latest.json` 随后上传。
- [ ] Gitee 镜像同步完成并验证国内更新清单。
- [ ] 完成 Windows 100%/125% 缩放、无边框窗口和独立工具窗口冒烟。
- [ ] 在受控 Steam/EA 环境验证 Apex 配置、语音下载、更新安装与回滚。
- [x] 发布说明准确披露 J58 静态适配证据范围和 Authenticode 状态。

## 当前阻塞

- 正式签名构建、在线更新、GitHub/Gitee 发布和人工桌面/Steam/EA 验收待发布工作流完成后回填。
- 本地不保存生产签名密钥，也不复用 Runner 产物进行本地重建。
