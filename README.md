# 萌新工具箱(mxtools)

基于 **Tauri 2** 与 **Vue 3 + TypeScript + Vuetify** 的 Windows 桌面工具集,提供游戏(如 Apex 启动项)、系统与网络(如端口转发、RDP 相关)等辅助能力.具体能力以后端 `invoke` 命令与前端页面为准.

- 项目结构说明：[docs/PROJECT_STRUCTURE.md](docs/PROJECT_STRUCTURE.md)
- 更新日志：[CHANGELOG.md](CHANGELOG.md)

## 环境准备(Windows)

- [Node.js](https://nodejs.org/)(建议 LTS 22.19.0)
- [Rust](https://www.rust-lang.org/tools/install)(stable)及 Windows 下 MSVC 构建环境
- [WebView2 运行时](https://developer.microsoft.com/zh-cn/microsoft-edge/webview2/?form=MA13LH#download)(若系统未自带)
- 本仓库通过 `package.json` 的 devDependency 使用 `@tauri-apps/cli`,一般无需全局安装 Tauri CLI

### 本地依赖 `windows_tool`

后端依赖路径 crate `windows_tool`(见 `src-tauri/Cargo.toml`).该路径指向 `**mxtools` 仓库外侧** 的 `rust/windows_tool` 目录；若缺失会导致 `cargo` / `tauri build` 失败.布局与调整方式见 [docs/PROJECT_STRUCTURE.md](docs/PROJECT_STRUCTURE.md) 中「本地路径依赖」一节.

### 运行权限

`src-tauri/manifest.xml` 中配置了 **以管理员身份运行**.涉及注册表、系统用户、RDP、端口转发等操作时通常需要提升权限；请仅在信任的来源下构建与运行本程序.

## 快速开始

安装依赖：

```bash
npm install
```

仅前端开发(Vite,端口 `1420`)：

```bash
npm run dev
```

Tauri 开发(会按 `tauri.conf.json` 自动拉起前端 dev server)：

```bash
npm run "tauri dev"
```

打包 Windows 安装包/可执行文件：

```bash
npm run "build window"
```

PowerShell 下也可写作：`npm run build\ window`(转义空格).

## 技术栈

- [Tauri](https://tauri.app/) · [Vue 3](https://vuejs.org/) · [Vite](https://vite.dev/) · [TypeScript](https://www.typescriptlang.org/)
- [Vuetify](https://vuetifyjs.com/)
- [Pinia](https://pinia.vuejs.org/) + [@tauri-store/pinia](https://github.com/tauri-apps/tauri-store)
- [vue-toastification](https://vue-toastification.maronato.dev/) · [vue-i18n](https://vue-i18n.intlify.dev/)

## 版本号(关于页)

关于页通过 `src/env.ts` 读取 `VITE_APP_VERSION`.在项目根目录 `.env` 中配置,例如：

```
VITE_APP_VERSION=0.0.3
```

同时建议与 `package.json`、`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json` 中的版本保持一致.

## Apex 启动项参考

- [Valve Developer Wiki - Command line options](https://developer.valvesoftware.com/wiki/Command_line_options)
- [EA Help - Apex Legends 如何显示 FPS](https://help.ea.com/cn/help/apex-legends/apex-legends/how-to-show-fps/)

## 推荐 IDE / 插件

- [RustRover](https://www.jetbrains.com/rust/) 或 VS Code + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
- [Vue - Official (Volar)](https://marketplace.visualstudio.com/items?itemName=Vue.volar)
- [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode)

## 代码风格备忘

**TypeScript**

- 解析类操作用 `parseInt` / `Number` 等按场景选择
- 变量命名倾向小写加下划线：`aaa_bb`

**Rust**

- 取值类：`Option<T>`
- 可能失败的操作：`Result<T, E>`

## 开发备忘：Vuetify 主题 CSS 变量

`--v-theme-on-surface`、`--v-theme-primary` 等由 Vuetify 在运行时注入,IDE 在单文件组件中可能报「无法解析自定义属性」.

处理方式(推荐前两种)：

1. 在 IDE 中对 Vuetify 变量放行：Settings → Editor → Inspections → CSS → **Unresolved custom property**,忽略模式增加 `--v-theme-`*(或降低该检查级别).
2. 按需关闭/降级该检查.

## 其它链接(资源占位等)

- [Imgloc 图床](https://imgloc.com/)
- [Picsum Photos](https://picsum.photos)

## 版本信息所在文件

- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`
- `package.json`
- `.env`
