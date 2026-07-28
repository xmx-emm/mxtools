# 手动冒烟清单（bugfix sweep）

在合并 / 发版前按下列项点一遍（Windows 真机）。**本次选：全部（1–9）。**

代码侧预检（2026-07-28）：`npm run lint`、54 项前端测试、
`cargo fmt --check`、严格 Clippy 和 63 项 Rust 测试均已通过；另有 1 项需要管理员权限的
SMB 集成测试保持忽略。下列「代码预检」仅说明实现已到位，**仍需真机点过才算通过**。

0.0.6 便携版已确认能够启动并创建主窗口，但自动化工具无法捕获当前无边框 Tauri
窗口（`0x80004002`），因此没有用盲点方式代替人工验收，也没有自动修改真实 Steam、
输入法、RDP、防火墙或端口转发状态。

---

## PUBG

### 1. 加载失败不打已加载标记

- [ ] **步骤**
  1. 打开 PUBG 启动项页；若无 Steam 账户，或临时断后端/`get_pubg_launch_option` 失败。
  2. 观察 toast 与页面状态。
- [ ] **预期**：toast「加载启动参数失败」（`toast.loadLaunchOptionError`）；**不**写入 `launch_loaded_for_user_id` / 不把失败结果当原启动项。
- **代码预检**：`start_load_pubg_launch_options_data` 失败 `return false`；仅 `ok` 时才 stamp loaded。

### 2. 切账户后选项一致

- [ ] **步骤**：在 A 账户加载选项 → 切到 B → 触发重新加载（进页 / 刷新）。
- [ ] **预期**：选项、内存等与 B 账户 Steam 启动项一致，不是 A 的缓存。
- **代码预检**：`launch_loaded_for_user_id` 与当前 `user_id` 不一致会重新 `load_launch_data`。

### 3. Apply 不双跑

- [ ] **步骤**：Steam 运行中点 Apply → 等待关闭对话框出现 → 再点强制关闭或等自行退出；快速连点 Apply。
- [ ] **预期**：成功 toast **一次**；`set_pubg_launch_option` 只成功一次。
- **代码预检**：`applyGeneration` / `shouldRunApply`；`PubgApply` 有 `is_setting_launch_option`；vitest `applyGeneration.test.ts` 已覆盖代际守卫。

---

## 输入法 / 五笔

### 4. 导出用户短语另存为

- [ ] **步骤**：输入法 → 五笔词库 →「导出用户短语」→ 选路径（可新建文件名）。
- [ ] **预期**：`save` 对话框（非 open）；可保存为 `.txt`；成功有提示。
- **代码预检**：`WubiLexiconPanel.exportUserPhrases` 使用 `save({ filters: txt })`。

### 5. 后端错误 i18n

- [ ] **步骤**：用 txt 导入「系统码表」（不支持的路径）或其它会返回 `inputMethod.errors.*` 的操作。
- [ ] **预期**：toast 为中文/英文文案，**不是**字面量 `inputMethod.errors.xxx`。
- **代码预检**：系统 txt → `txtToSystemLexUnsupported`；`toast.ts` 翻译 key / `key: detail`；Rust 单测 `system_txt_never_returns_ok_with_entries`。

### 6. 未知 TIP / 美式键盘语言归属

- [ ] **步骤**：添加美式键盘；如有条件再加未知 TIP。用 Win+Space / 语言设置看落在哪一语言下。
- [ ] **预期**：落到匹配语言（zh/en 等）；不在无关语言下重复出两个美式键盘。
- **代码预检**：`add_us_keyboard` 按 LanguageTag 选 tip 前缀；`tip_language_filter` 未知前缀用精确标签非一律 `zh*`；相关 lifecycle/catalog 单测已绿。

---

## 设置 / RDP

### 7. 快捷键页无全局开关

- [ ] **步骤**：设置 → 快捷键。
- [ ] **预期**：无「启用全局快捷键」开关；仅应用内快捷键 +「仅应用内」说明。
- **代码预检**：`SettingsView` 无全局开关；文案 `shortcutAppOnlyHint`；store 已去掉 `globalShortcutsEnabled` 字段。

### 8. RDP 防火墙（非英系统更好）

- [ ] **步骤**：以管理员开/关远程桌面；看是否生效；故意制造防火墙失败时看日志。
- [ ] **预期**：尽量用资源组 `@FirewallAPI.dll,-28752`；防火墙失败时 RDP 注册表仍改，日志有 ERROR。
- **代码预检**：`rdp.rs` 使用该 Group；需管理员真机确认。

---

## 端口转发

### 9. 查询失败要报错

- [ ] **步骤**：端口转发页刷新；若可模拟 `get_port_forwarding` 失败（无权限/后端 Err）。
- [ ] **预期**：toast 报错；**不要**把失败当成「当前无规则」的空列表（失败时不覆盖成空成功态）。
- **代码预检**：`port_forwarding.update()` catch + toast + `throw`；后端已 `Result`。

---

## 勾选汇总

| # | 项 | 真机通过 |
|---|----|----------|
| 1 | PUBG 加载失败门闩 | [ ] |
| 2 | PUBG 切账户 | [ ] |
| 3 | PUBG Apply 单飞 | [ ] |
| 4 | 五笔导出 save | [ ] |
| 5 | IME 错误 i18n | [ ] |
| 6 | TIP / 美式键盘语言 | [ ] |
| 7 | 设置快捷键文案 | [ ] |
| 8 | RDP 防火墙 | [ ] |
| 9 | 端口转发查询失败 | [ ] |

全部勾完后再发版。
