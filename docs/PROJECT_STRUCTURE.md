# 项目结构说明

本文档描述 **萌新工具箱(mxtools)** 仓库的目录职责,以及前端(Vue)与 Tauri(Rust)后端的对应关系.

## 顶层目录概览

```
mxtools/
├── docs/                    # 项目文档(本文件)
├── public/                    # Vite 静态资源(构建时原样复制)
├── src/                       # 前端：Vue 3 + TypeScript + Vuetify
├── src-tauri/                 # 后端：Tauri 2 + Rust
├── index.html                 # Vite 入口 HTML
├── vite.config.ts             # Vite 配置(端口 1420、别名 @ / ASSETS 等)
├── package.json               # 前端脚本与 npm 依赖
├── tsconfig.json              # TypeScript 配置
├── eslint.config.ts           # ESLint 配置
├── CHANGELOG.md               # 更新日志
└── README.md                  # 使用与开发说明
```

构建产物：

- 前端生产构建输出目录：`dist/`(由 `vite build` 生成)
- Tauri 在打包时读取：`src-tauri/tauri.conf.json` 中的 `build.frontendDist`(相对 `src-tauri/` 为 `../dist`)

## 前端 `src/`

| 路径 | 说明 |
|------|------|
| `main.ts` | 应用入口：Pinia + `@tauri-store/pinia`、Vuetify、路由、i18n、主题与快捷键等 |
| `App.vue` | 根组件 |
| `router.ts` | 路由与「工具」导航结构(`/game`、`/windows`、`/server` 等子路由) |
| `pages/` | 各功能模块页面(如游戏、Windows、服务器相关) |
| `views/` | 布局级视图(首页壳、仪表盘、设置、关于、欢迎页、404 等) |
| `components/` | 可复用 UI 与业务子组件(按领域分子目录,如 `game/`、`window/`、`settings/`) |
| `stores/` | Pinia store；与 Tauri 多窗口同步相关的 store 通过 `@tauri-store/pinia` 持久化/同步 |
| `i18n/` | 国际化：`i18n.ts` 与 `zh-CN.ts`、`en-US.ts` 文案 |
| `utils/` | 通用工具(路由、日志、快捷键、游戏相关辅助等) |
| `data/` | 静态配置与外链常量(如 `url.ts`、`apex_launch_options_config.ts`) |
| `assets/` | 样式、图片等静态资源 |
| `env.ts` | 前端展示版本号等(读取 `import.meta.env`,如 `VITE_APP_VERSION`) |

**路由入口**：新增页面时通常在 `router.ts` 注册,并在 `pages/` 或 `views/` 中实现组件.

## 后端 `src-tauri/`

| 路径 | 说明 |
|------|------|
| `src/main.rs` | 二进制入口 |
| `src/lib.rs` | Tauri 应用构建与 **`invoke_handler` 命令注册**(前后端 IPC 的权威列表) |
| `src/*.rs` | 按领域拆分的模块(见下表) |
| `src/game/` | Steam / Apex 等游戏相关逻辑 |
| `tauri.conf.json` | Tauri 应用元数据、窗口、`build` 前置命令、`frontendDist` 等 |
| `capabilities/` | Tauri 2 权限与能力配置 |
| `Cargo.toml` | Rust 依赖与 crate 配置 |
| `build.rs` | Tauri 构建脚本 |
| `manifest.xml` | Windows 程序清单(如请求管理员权限) |

### `lib.rs` 中的模块与职责(与 `invoke_handler` 对应)

以下按 `src-tauri/src/lib.rs` 中的模块划分,便于从前端 `invoke` 名反查 Rust 实现位置：

| 模块文件 | 主要职责(概括) |
|----------|------------------|
| `logger.rs` | 日志路径、前端日志写入、反馈用日志读取 |
| `port_forwarding.rs` | 端口转发的增删改查与批量操作 |
| `system.rs` | 系统信息 |
| `registry.rs` | 常用文件夹显示/隐藏、Windows 更新相关注册表项等 |
| `input_method.rs` | 输入法列表与顺序、启用状态 |
| `elevated.rs` | 是否已提升权限、请求以管理员重启 |
| `backups.rs` | 资源管理器注册表等备份相关、端口转发配置导入导出路径 |
| `game/mod.rs`、`game/apex.rs` | Steam 用户与进程、Apex 启动项与语音包路径等 |
| `user.rs` | Windows 本地用户增删改密码与重命名 |
| `rdp.rs` | 远程桌面开关、端口、用户、连接保存与导出等 |

前端通过 `@tauri-apps/api/core` 的 `invoke` 调用上述命令；具体命令名字符串以 Rust 侧 `#[tauri::command]` 函数名为准.

## 本地路径依赖 `windows_tool`

[`src-tauri/Cargo.toml`](../src-tauri/Cargo.toml) 中包含：

```toml
windows_tool = { path = "../../../rust/windows_tool" }
```

该路径相对于 **`src-tauri/` 目录** 向上三级,即期望在 **与 `mxtools` 同级的 `rust/windows_tool`** 中存在该 crate(典型布局：`.../tauri/mxtools` 与 `.../tauri/rust/windows_tool`).

若克隆本仓库后 **未放置** `windows_tool`,`cargo build` / `tauri build` 会因找不到依赖而失败.请按你本机实际布局补齐该目录,或自行调整 `path`(需同时保证相对路径在团队内一致).

## 相关配置文件速查

- 应用显示名称与窗口标题：`src-tauri/tauri.conf.json` → `app.windows[].title`
- 开发时 Vite 端口：`vite.config.ts` 与 `tauri.conf.json` 的 `devUrl` 需一致(当前为 `1420`)
- 版本号：Rust `src-tauri/Cargo.toml`、Tauri `tauri.conf.json`、`package.json`；前端关于页还依赖根目录 `.env` 中的 `VITE_APP_VERSION`(见 `README.md`)
