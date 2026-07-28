# 设计：Critical / Important / Minor 缺陷修复扫荡

**日期：** 2026-07-13  
**仓库：** `E:\rust\windows_tool`、`E:\tauri\mxtools`  
**范围：** 修复 2026-07-13 代码审查中列出的全部 Critical、Important，以及高价值 Minor 问题。  
**做法：** 按依赖分批（底层 crate → 应用）。不做整库 `Result<String>` → `Error` 迁移；不做全站 `invoke` → `commands.ts` 迁移。

---

## 目标

1. 修正输入法 / 五笔词库 / 提权命令 / 端口转发中「失败却当成功」或静默写错的问题。
2. 防止 PUBG 用错账户启动项、以及 Apply 双跑竞态。
3. 补齐 Important 正确性与体验缺口（Preload、capabilities、另存为、i18n、快捷键文案诚实、saving 竞态等）。
4. 清理高价值 Minor（文档路径、临时 `.rdp`、废弃命令、注释漂移等）。

## 非目标

- 把所有 IME API 统一改到 `windows_tool::Error`。
- 把前端每个 `invoke` 都迁进 `src/ipc/commands.ts`。
- 完整实现 txt → 系统 `imscwubi` 转换（除非已有可行的最小正确路径）；否则明确报错。

---

## 分批顺序

### Batch 1 — `windows_tool` Critical

| ID | 修复内容 | 文件 |
|----|----------|------|
| C1 | 对齐 UDP `generate`/`parse` 头与 offset；补 round-trip 测试；畸形输入返回 `Err`，禁止 panic | `input_method/wubi/user_udp.rs` |
| C2 | 系统词库 txt 导入：禁止把已有文件当成功返回；在转换未实现前明确 `Err` | `user_udp.rs`、`system_lex.rs` |
| C3 | 未知 TIP 添加：使用 `max(index)+1`；tip 引号转义；只加到匹配语言 | `lifecycle.rs` |
| C4 | 提权 `run_commands` 回传 ExitCode；`run_portproxy` 检查 `status.success()` | `utils/command.rs`、`port_forwarding/command.rs` |

### Batch 2 — `mxtools` Critical

| ID | 修复内容 | 文件 |
|----|----------|------|
| C5 | PUBG 加载成功门闩：仅成功时写入 `original_*` / `launch_loaded_for_*` | `stores/game/pubg/actions_launch.ts` |
| C6 | 关闭启动器 composable 增加代际 token；PubgApply 增加 apply 锁 | `useCloseLauncherThenApply.ts`、`useProcessPollUntilExit.ts`、`PubgApply.vue` |

### Batch 3 — Important（先 `windows_tool` 后 `mxtools`）

| ID | 修复内容 |
|----|----------|
| I1 | Preload 同步：只写真实布局 ID（如 `00000409`），禁止把 `0804:00000409` 截成 `0804:000` |
| I2 | 重排：收集与写入的 Assembly 范围一致（清理同一集合） |
| I3 | `get_available_input_methods`：把真实 `name` 传给 `capabilities_for` |
| I4 | `remove_input_method`：向上传播 reorder 错误 |
| I5 | 系统 lex：校验 magic；源文件不存在则跳过备份 |
| I6 | 诚实处理 `open_input_method_settings`（改名或真正打开） |
| I7 | 上下文菜单 id：稳定哈希（sha256 截断 / 规范化路径），不用 `DefaultHasher` |
| I8 | 端口转发列表：返回 `Result`，查询失败不得伪装成空列表 |
| I9 | `utf16le_to_string`：对齐安全的解码 |
| I10 | `is_process_running`：复用统一输出解码 |
| I11 | 五笔导出：改用 `save` 对话框 |
| I12 | 补全 `inputMethod.errors.*` 到 zh-CN / en-US；toast 支持解析 `key: detail` |
| I13 | 全局快捷键开关：在真正有全局动作前隐藏或改文案 |
| I14 | 输入法变更操作共享 `saving` |
| I15 | RDP 用户 chip：该用户 loading 中忽略连点 |

### Batch 4 — Minor（高价值）

| ID | 修复内容 |
|----|----------|
| M1 | 文档：`PROJECT_STRUCTURE.md` 中 `window/` → `windows/` |
| M2 | 连接后清理临时 `.rdp` |
| M3 | 移除或明确废弃未使用的输入法命令 |
| M4 | `ShortcutInput` 注释与「必须有修饰键」校验对齐 |
| M5 | 五笔面板仅在可见时挂载（`v-if` / watch） |
| M6 | 在成本低的关键注册表路径减少静默 `let _ =` / `unwrap_or_default` |
| M7 | 防火墙/语言环境：仅在有小而安全的修法时改；否则只在文档注明 |

---

## 设计细节

### C1 — UDP round-trip

- 头字段偏移用命名常量，生成与解析共用。
- `parse(generate(entries))` 应还原条目（编码 / 词 / order）。
- offset 表：N 条对应 N 个 offset（或明确文档化的哨兵）；条目基址 = `0x40 + count*4`。
- count 字段偏移在 generate 与 parse 间必须一致。
- 畸形切片返回带 i18n key 的 `Err`，禁止 `unwrap` panic。

### C2 — 系统词库 txt

- 若不支持 txt→系统 lex：一律 `Err("inputMethod.errors.txtToSystemLexUnsupported")`。
- 解析用户 txt 后，禁止 `Ok(existing)`。

### C3 — TIP 添加

- 已知目录路径已算 `next_index`；未知 TIP 路径对目标 `lang_id` 同样计算。
- 语言过滤：按 tip 前缀映射（`0804` → zh*，`0409` → en-US），类似美式键盘助手；不要加到所有语言。
- PowerShell tip 字符串做单引号转义。

### C4 — 退出码

- 提权路径：`Start-Process -PassThru -Wait` 后 `exit $p.ExitCode`（对齐注册表备份写法）。
- `run_portproxy`：若 `!output.status.success()`，返回 stderr/stdout 错误信息。

### C5 / C6 — PUBG + Apply

- `start_load_pubg_launch_options_data` 返回 `boolean`（或抛错）；调用方仅在成功时打已加载标记。
- 失败：toast/warn；不更新 `launch_loaded_for_user_id`。
- Composable：start/stop/强制关闭时递增 generation；忽略过期 poll；`run_apply` 单飞。
- `PubgApply`：invoke 前使用 `is_setting_launch_option`（或 store 等价标志）。

### I1 — Preload

- Layout 条目通过 `parse_hkl` / `keyboard_layout` / `:` 后缀得到布局 ID，不要对整段 tip 做 `normalize_layout_id` 截断。
- Preload 完全跳过非布局 tip（已有部分逻辑；修掉截断路径）。

### I12 — i18n

- 把 `windows_tool` 里用到的每个 `inputMethod.errors.*` 补进两套语言包。
- Toast：若消息匹配 `^(inputMethod\.errors\.\w+)(?::\s*(.*))?$`，翻译头部并附上 detail。

### I13 — 快捷键

- 保留应用内语言切换快捷键；修改 UI 文案 / 禁用暗示「系统全局快捷键」的开关，**或**在真正有全局动作前移除该开关。
- 不要注册假的全局快捷键。

---

## 测试

| 区域 | 测试 |
|------|------|
| UDP | 单元：round-trip N=0,1,3；错误 magic；截断缓冲 |
| 系统 txt | 单元：txt 路径返回 Err，永不 Ok(existing) |
| normalize / preload 辅助 | 单元：`0804:00000409` → `00000409` |
| PUBG 加载门闩 | 若有 store 测试则写；否则手动清单 |
| Apply 代际 | 可行则对 composable 做假定时器单测 |
| 端口转发 / 提权 | 优先单测 status 处理；提权路径可 `#[cfg(not(test))]` |

手动冒烟（mxtools）：

1. PUBG：加载失败 → 不打已加载标记；切账户 → 重新加载。
2. 关启动器过程中 Apply → 只一次 toast / 一次写入。
3. 五笔导出 → 另存为可新建文件。
4. 输入法错误显示中/英文，不是原始 key。
5. 设置里快捷键开关不再宣称无效的全局能力。

---

## 下一步

用户确认本中文 spec 后，再写 `docs/superpowers/plans/2026-07-13-bugfix-sweep.md` 实现计划，并按 Batch 1 → 4 执行，每批结束后做验证。
