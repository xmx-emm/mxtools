# Critical / Important / Minor 缺陷修复实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans，按任务逐项实现。步骤用 checkbox（`- [x]`）跟踪。

**Goal:** 按 `docs/superpowers/specs/2026-07-13-bugfix-critical-important-minor-design.md` 修复两仓库全部 Critical / Important / 高价值 Minor 缺陷。

**Architecture:** 先修 `windows_tool`（UDP / TIP / ExitCode / Preload），再修 `mxtools`（PUBG 门闩、Apply 代际锁、对话框、i18n、UI）。每项尽量先补失败测试再改实现。

**Tech Stack:** Rust（windows_tool）、Vue 3 + Pinia + Vitest（mxtools）、Tauri IPC

**Spec:** `docs/superpowers/specs/2026-07-13-bugfix-critical-important-minor-design.md`

---

## 文件地图

### windows_tool（`E:\rust\windows_tool`）

| 文件 | 职责 |
|------|------|
| `src/input_method/wubi/user_udp.rs` | UDP 编解码、txt 导入导出、系统 txt 拒绝伪成功 |
| `src/input_method/wubi/system_lex.rs` | 系统词库导入 / magic / 备份 |
| `src/input_method/lifecycle.rs` | 添加/删除输入法、TIP index、语言过滤 |
| `src/input_method/order.rs` | 重排、Preload 同步 |
| `src/input_method/registry_util.rs` | layout id 规范化辅助 |
| `src/input_method/catalog.rs` | capabilities / 可添加列表 |
| `src/input_method/settings.rs` | 设置 URI / 打开行为 |
| `src/utils/command.rs` | 提权 ExitCode |
| `src/port_forwarding/command.rs` | portproxy 成功判定、列表 Result |
| `src/utils/encoding_util.rs` | UTF-16 对齐安全 |
| `src/utils/process.rs` | 进程探测解码 |
| `src/registry/context_menu.rs` | 稳定 id |

### mxtools（`E:\tauri\mxtools`）

| 文件 | 职责 |
|------|------|
| `src/stores/game/pubg/actions_launch.ts` | 加载成功门闩 |
| `src/composables/useCloseLauncherThenApply.ts` | Apply 代际锁 |
| `src/composables/useProcessPollUntilExit.ts` | 同代际模式 |
| `src/components/game/pubg/PubgApply.vue` | apply 单飞锁 |
| `src/components/windows/inputMethod/WubiLexiconPanel.vue` | save 对话框、可见再挂载 |
| `src/i18n/zh-CN.ts` / `en-US.ts` | errors 词条 |
| `src/toast.ts` | `key: detail` 翻译 |
| `src/views/SettingsView.vue` / `global-shortcuts.ts` | 快捷键开关诚实化 |
| `src/pages/windows/InputMethodPage.vue` 等 | 共享 saving |
| `src/components/windows/rdp/RdpUserManagement.vue` | 连点防护 |
| `src-tauri/src/rdp.rs` / `input_method.rs` | 临时文件、废弃命令 |
| `docs/PROJECT_STRUCTURE.md` | 路径文档 |

---

### Task 1: C1 UDP round-trip（windows_tool）

**Files:**
- Modify: `E:\rust\windows_tool\src\input_method\wubi\user_udp.rs`

- [x] **Step 1: 写失败测试（round-trip + 坏 magic）**

在 `user_udp.rs` 的 `#[cfg(test)] mod tests` 增加：

```rust
#[test]
fn udp_round_trip_one_entry() {
    let entries = vec![UdpEntry {
        code: "aaaa".into(),
        word: "测试".into(),
        order: 1,
    }];
    let data = generate_udp(&entries);
    let parsed = parse_udp(&data).expect("parse");
    assert_eq!(parsed, entries);
}

#[test]
fn udp_round_trip_three_entries() {
    let entries = vec![
        UdpEntry { code: "aaaa".into(), word: "一".into(), order: 1 },
        UdpEntry { code: "bbbb".into(), word: "二".into(), order: 2 },
        UdpEntry { code: "cccc".into(), word: "三".into(), order: 3 },
    ];
    let parsed = parse_udp(&generate_udp(&entries)).unwrap();
    assert_eq!(parsed, entries);
}

#[test]
fn udp_bad_magic_errs() {
    let mut data = generate_udp(&[UdpEntry {
        code: "a".into(), word: "b".into(), order: 1,
    }]);
    data[0] = b'x';
    assert!(parse_udp(&data).is_err());
}
```

- [x] **Step 2: 跑测试确认失败**

Run: `cd E:\rust\windows_tool && cargo test udp_round_trip -- --nocapture`  
Expected: FAIL（parse 得到空或条目不对）

- [x] **Step 3: 对齐 generate/parse**

约定头布局（与 generate 已写的 `0x10=40` 一致）：

- `COUNT_OFF = 0x1C`
- `OFFSET_TABLE = 0x28`（即十进制 40）
- `data_base = 0x28 + 4 * count`
- 写满 **N** 个相对 offset：`offsets[0]=0`，`offsets[i]=前 i 条体积之和`
- 条目头与 parse 一致：`order`@+0x06，`code_len`@+0x08，payload@+0x10
- 畸形 `try_into` 改为返回 `Err`，禁止 panic
- 去掉错误的 `28` 字节填充 + 额外 `0u32` 把表推到 `0x40` 的写法
- `parse` 从 `0x1C` 读 count，从 `0x28` 读 offset 表

- [x] **Step 4: 测试通过**

Run: `cargo test --manifest-path E:\rust\windows_tool\Cargo.toml udp_ -- --nocapture`  
Expected: PASS

- [x] **Step 5: Commit（windows_tool）**

```bash
cd E:\rust\windows_tool
git add src/input_method/wubi/user_udp.rs
git commit -m "fix(ime): align Wubi UDP generate/parse for round-trip"
```

---

### Task 2: C2 系统词库 txt 禁止伪成功

**Files:**
- Modify: `E:\rust\windows_tool\src\input_method\wubi\user_udp.rs`（`txt_to_lex_bytes_for_system`）

- [x] **Step 1: 失败测试**

```rust
#[test]
fn system_txt_never_returns_existing_ok() {
    // 即使 entries 非空，未实现转换时必须 Err，不能 Ok(任意字节)
    // 用临时 txt；不依赖真实系统路径存在时的 Ok(existing) 分支
}
```

实现断言：对任意非空 txt，`txt_to_lex_bytes_for_system` 在未实现转换时 **恒为** `Err`，且错误串包含 `txtToSystemLexUnsupported` 或 `emptyTxt`。删除 `Ok(existing)` 分支。

- [x] **Step 2–4:** 改实现 → `cargo test` → commit  
  `fix(ime): fail loudly on unsupported system lexicon txt import`

---

### Task 3: C3 TIP 添加 index / 语言 / 转义

**Files:**
- Modify: `E:\rust\windows_tool\src\input_method\lifecycle.rs`

- [x] 未知 TIP：对目标 lang 计算 `max(index)+1`，禁止写死 `0`
- [x] `add_input_method_tip`：只加入匹配语言（tip 前缀 `0804`→简中相关，`0409`→en）；tip 做 `''` 转义
- [x] 手动或单元能覆盖的部分加测；commit  
  `fix(ime): safe TIP add index, language filter, and escaping`

---

### Task 4: C4 提权 ExitCode + portproxy 状态

**Files:**
- Modify: `E:\rust\windows_tool\src\utils\command.rs`
- Modify: `E:\rust\windows_tool\src\port_forwarding\command.rs`

- [x] `run_commands(use_admin)` 对齐 `registry/backups.rs`：`-PassThru` + `exit $p.ExitCode`
- [x] `run_portproxy`：`!status.success()` → `Err`（带 stdout/stderr）
- [x] 列表查询失败勿变空 Vec（改为 `Err` 或保留 Result 语义，见 I8）
- [x] commit: `fix(cmd): propagate elevated ExitCode and portproxy failures`

---

### Task 5: C5 PUBG 加载成功门闩

**Files:**
- Modify: `E:\tauri\mxtools\src\stores\game\pubg\actions_launch.ts`
- Test: 若可抽纯函数则加；否则对照 Apex 改返回值

- [x] `start_load_pubg_launch_options_data` 返回 `Promise<boolean>`
- [x] `load_launch_data` / `reload_launch_page`：仅 `ok === true` 时设置 `original_launch_options` 与 `launch_loaded_for_user_id`
- [x] 失败时 toast（与项目 toast 风格一致）
- [x] commit: `fix(pubg): only mark launch options loaded on successful IPC`

---

### Task 6: C6 Apply 代际锁 + PubgApply

**Files:**
- Modify: `E:\tauri\mxtools\src\composables\useCloseLauncherThenApply.ts`
- Modify: `E:\tauri\mxtools\src\composables\useProcessPollUntilExit.ts`
- Modify: `E:\tauri\mxtools\src\components\game\pubg\PubgApply.vue`

- [x] composable 内 `generation` / `applyEpoch`：stop、强制关闭、新一轮 start 时递增
- [x] poll 回调与 `run_apply` 开头校验 epoch；过期直接 return
- [x] `is_apply_running` 已存在则确保强制关闭路径不会并行二次 apply
- [x] PubgApply：本地/store `is_setting_launch_option` 防双击
- [x] commit: `fix(apply): generation lock to prevent double apply after launcher close`

---

### Task 7: Important I1–I10（windows_tool）

按 ID 顺序改同一提交或拆提交：

- [x] **I1** `order.rs` / `registry_util.rs`：Preload 用布局 ID（`00000409`），增加单元测试 `0804:00000409` → `00000409`
- [x] **I2** `write_ctf_order` 与 `collect` 范围一致
- [x] **I3** `catalog.rs`：`capabilities_for(&c.id, &c.name)`（先算 capabilities 再 move name）
- [x] **I4** `remove_input_method`：`reorder_input_methods(...)?`
- [x] **I5** 系统 lex magic；源不存在跳过备份
- [x] **I6** settings 改名或真正打开
- [x] **I7** context_menu 稳定 id（sha256 截断 hex）
- [x] **I8** portproxy 列表 `Result` 化并改调用方
- [x] **I9** `encoding_util` 按字节拼 `u16`
- [x] **I10** process 复用 `decode_process_output`
- [x] commits 按模块拆分，中文或英文 feat/fix 前缀均可，与仓库风格一致

---

### Task 8: Important I11–I15（mxtools）

- [x] **I11** `WubiLexiconPanel.vue`：`exportUserPhrases` 用 `save`
- [x] **I12** 扫描 Rust 全部 `inputMethod.errors.*`，写入 zh-CN/en-US；`toast.ts` 支持 `key: detail`
- [x] **I13** 设置页全局快捷键：改文案或隐藏开关（保持应用内快捷键）
- [x] **I14** 输入法 Add/QuickBar 共用父级 `saving`
- [x] **I15** RDP `toggleRdpUser`：loading 中 early return
- [x] commits

---

### Task 9: Minor M1–M7

- [x] **M1** `docs/PROJECT_STRUCTURE.md`：`window/` → `windows/`
- [x] **M2** `rdp.rs`：spawn 后删除临时 `.rdp`（或延迟短时删除）
- [x] **M3** 废弃未用输入法命令：从 `lib.rs` 移除或标 `#[deprecated]` 且前端不调用
- [x] **M4** `ShortcutInput.vue` 注释对齐
- [x] **M5** 五笔面板 `v-if="visible"`
- [x] **M6** 关键路径减少吞错（删除后 reorder 已在 I4）
- [x] **M7** 防火墙 locale：若无小修则文档注释说明风险即可
- [x] commits

---

### Task 10: 总验证

**windows_tool:**

```bash
cd E:\rust\windows_tool
cargo test
```

**mxtools:**

```bash
cd E:\tauri\mxtools
npm test
# 或项目既有 vitest 脚本
```

手动冒烟清单见 spec。全部通过后进入 finishing-a-development-branch。

---

## Spec 覆盖自检

| Spec ID | Task |
|---------|------|
| C1–C4 | Task 1–4 |
| C5–C6 | Task 5–6 |
| I1–I15 | Task 7–8 |
| M1–M7 | Task 9 |
| 测试 / 冒烟 | Task 10 |

非目标（整库 Error 迁移、全站 commands.ts）不在计划内。
