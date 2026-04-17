# 更新日志

本文档记录萌新工具箱的版本更新内容.

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/).

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
