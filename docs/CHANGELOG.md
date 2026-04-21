# 更新日志

本文档记录萌新工具箱的版本更新内容.

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/).

---

## [0.0.3] 2026-4-21

### 新增

- **PUBG 启动项**：新增 PUBG 启动选项配置能力,支持在工具箱中统一管理相关启动参数
- **模块仪表盘**：新增模块化 Dashboard 页面,替换原测试视图并作为主功能入口

### 变更

- **路由结构**：移除欢迎页面并优化路由跳转逻辑,缩短进入功能页路径
- **Apex 页面**: 
  - 添加对EA帐户的支持,可读取及应用EA客户端的配置项
  - 添加配置项搜索过滤及常用分类,更方便的查找
- **Apex 配置**：新增配置项如下
  - 渲染多线程模式：（`+mat_queue_mode 2`）
  - Alt+Tab 时窗口最小化：（`+mat_minimize_on_alt_tab 1`）
  - 钳制鼠标：（`+clip_mouse_to_letterbox 0`）
  - 透明准星颜色：（`+reticle_color "2147483648 2147483648 2147483648"`）
  - 强制禁用垂直同步：（`-forcenovsync`）
  - 禁用手柄：（`-nojoy`）
  - 强制音频输出：（`+miles_channels 2/4/6/8`）
  - 禁用布娃娃：（`+cl_ragdoll_collide 0`）
  - 图形 API (DirectX)：（`-anticheat_settings=SettingsDX11.json` / `-anticheat_settings=SettingsDX12.json`）
  - 限制顶点着色器数量：（`-limitvsconst`）
  - 强制预加载：（`+cl_forcepreload 1` / `-preload`）

### 重构

- **代码组织**：重构 Dashboard 与路由相关实现,提升模块可维护性与后续扩展性

---

## [0.0.2] 2026-3-10

### 新增

- **关于页**：添加腾讯频道、GitHub、项目地址等链接,链接统一放在 `src/data/url.ts`
- **Apex 启动项**：新增 NEW 角标标识新特性(比例、强制分辨率、大厅 FPS、优化鼠标),点击或勾选后隐藏并持久化记录
- **设置页**：添加「清除持久化数据」按钮,可重置主题、语言、Steam 用户、上次页面等设置
- **Apex 启动项**：支持比例(Aspect)、强制分辨率(ForcedResolution)、大厅 FPS(LobbyFps)、优化鼠标(InputMouse)等新参数
- **多窗口同步**：使用 `@tauri-store/pinia` 替代 `pinia-plugin-persistedstate`,实现 settings、style、steam 等 store 的跨窗口同步

### 变更

- **关于页**：优化主题适配,增大弹出窗口尺寸(750×600)
- **路由**：仅在主窗口恢复上次页面,避免子窗口(如关于页)误跳转
- **Store**：统一 store 命名,修正 `portForwarding`、`windowsUser`、`rdp` 等 store id
- **版权信息**：更新为 © 2025-2026
- **关于页**：版本号改为从 `@/env` 动态获取
- **页面布局**：移除资源管理器和设置页的宽内容包裹类
- **Apex 配置**：更新启动项配置,新增相关参数

### 修复

- **路由**：修复非主窗口启动时错误恢复上次路由的问题

### 重构

- **Store**：将 user store 重命名为 windows user store,并更新相关引用
- **Apex**：移除调试用 console 日志

### 文档

- 更新版本信息文档

---

[0.0.2]: https://github.com/xmx-emm/mxtools/compare/98804e6198f4c36a8475bde3b10a2829ffc3d532...HEAD
[0.0.3]: https://github.com/xmx-emm/mxtools/compare/v0.0.2...HEAD
