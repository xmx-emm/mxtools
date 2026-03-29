这里是萌新工具箱

## Apex启动项部分参考
[Source](https://developer.valvesoftware.com/wiki/Command_line_options) / [EA Help](https://help.ea.com/cn/help/apex-legends/apex-legends/how-to-show-fps/)

# Build

```
#自行构建

npm install

npm run "build window"

```
[WebView2运行时](https://developer.microsoft.com/zh-cn/microsoft-edge/webview2/?form=MA13LH#download)

# Tauri + Vue + TypeScript +  [Vueftifyjs](https://vuetifyjs.com/)

[Toastification](https://vue-toastification.maronato.dev/) + [Pinia](https://pinia.vuejs.ac.cn/core-concepts/) + [Pinia Plugin Persistedstate](https://prazdevs.github.io/pinia-plugin-persistedstate/zh/guide/) + [i18n](https://vue-i18n.intlify.dev/)

This template should help get you started developing with Vue 3 and TypeScript in Vite. The template uses Vue 3
`<script setup>` SFCs, check out
the [script setup docs](https://v3.vuejs.org/api/sfc-script-setup.html#sfc-script-setup) to learn more.

## Recommended IDE Setup

- [RustRover](https://www.jetbrains.com/rust/) + [Vue - Official](https://marketplace.visualstudio.com/items?itemName=Vue.volar) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

- [Imgloc 图床](https://imgloc.com/)
- [Picsum Photos](https://picsum.photos)

```
ts
parseInt Number

变量名小写 aaa_bb
```

```
rust

获取操作用 Option<T>

执行操作用 Result<T>
```

```angular2html
--v-theme-on-surface / --v-theme-primary 是 Vuetify 在运行时注入的 CSS 变量，IDE 在单文件里找不到定义就会报“无法解析自定义属性”。
你有 3 种处理方式（推荐前两种）：
方式 1（推荐，按规则忽略）
在 IDE 里把该检查对 Vuetify 变量放行：
Settings -> Editor -> Inspections -> CSS -> Unresolved custom property
给忽略模式加：--v-theme-*（或直接降低该检查级别）。
```
```angular2html
版本信息
src-tauri/Cargo.toml
src-tauri/tauri.conf.json
package.json
```