# 0.0.8 发布检查清单

日期：2026-09-22

## 发布输入

- [x] `package.json`、`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json` 均为 `0.0.8`。
- [x] CI 与发布流程固定 `windows_tool` 提交 `63be28c24cc093a8d160d902cb983331dc9c9e2e`。
- [ ] 本地 `windows_tool` 工作树恢复干净并通过 `npm run release:inputs:check`。当前有维护者未提交修改，发布脚本会按预期拒绝继续。

## 自动化门禁

- 当前生产 bundle 报告：启动加最大语言包 `535.72 KiB raw / 184.15 KiB gzip`，总 JavaScript `1834.06 / 617.86 KiB`，总 CSS `651.66 / 114.51 KiB`；严格预算分别为 `550/190`、`1875/635`、`665/116 KiB`。
- [x] `npm run lint`
- [x] `npm test`
- [x] `npm run build` 与 `npm run bundle:check`
- [x] `cargo fmt --check`
- [x] `cargo clippy --all-targets --locked -- -D warnings`
- [x] `cargo test --locked`
- [x] `npm run test:apex-video-native`（44/44）
- [x] `git diff --check`

## 安全与合规

- [x] 发布构建不包含 DevTools；开发入口通过显式 Cargo feature 启用。
- [x] opener 权限限于源码实际引用的 HTTPS 域名和精确自定义协议。
- [x] 在线授权 URL 在 Rust 边界校验同源；发布 API 固定 HTTPS，调试覆盖限回环地址。
- [x] 客户端账号资料、令牌和本地存储行为记录于 `ONLINE_ACCOUNT_DATA_HANDLING.md`。
- [ ] 在线服务运营方提供可访问的隐私、保留期限和账号/数据删除政策。
- [ ] 对外 EXE/NSIS 取得可信 Authenticode 发布者签名；更新器签名不等同于 Authenticode。

## 产物与人工验收

- [ ] 在发布输入门禁通过后运行 `npm run "build window release"`，记录三份产物的字节数与 SHA-256。
- [ ] 完成 Windows 100%/125% 缩放、无边框窗口和所有独立工具窗口冒烟。
- [ ] 在受控 Steam/EA 环境验证 Apex 配置、语音下载、更新安装与回滚。
- [ ] 在受控硬件上验证 Razer SET/GET/恢复；不得在未经授权的用户设备上执行。
- [ ] 确认发布说明准确披露 Authenticode 状态、校验值和仍未覆盖的人工验证。
