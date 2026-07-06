# 更新日志

本文档记录萌新工具箱的版本更新内容.

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/).

---
## [0.0.5] 2026-7-6

### 新增

- **Apex 视频配置**：新增视频设置页面，可读取并应用游戏内 `videoconfig.cfg` 配置（窗口模式、分辨率、垂直同步、抗锯齿、伽马、动态分辨率、模型/纹理/阴影/贴花/CSM、SSAO、体积光、布娃娃等）
- **Apex 页面切换**：Apex 页面支持「启动项」与「视频配置」两种视图切换
- **Apex 快速预设**：新增快速预设对话框，可一键应用比例、分辨率、锁帧、启动项及视频配置组合
- **Apex 宽高比预设**：新增 1:1、2:1、5:4 等更多比例预设
- **设置页**：新增调试模式开关，控制详细日志输出

### 变更

- **Apex 模块**：重构游戏功能目录结构（`launch` / `video_config` / `preset` 分区），统一比例、分辨率、锁帧等通用预设组件
- **Apex 快速预设**：支持视频配置独立开关，启动项与视频项双列展示；优化预设对话框布局
- **Apex 视频配置**：优化 SSAO 质量与布娃娃相关选项；改进伽马预览与 DVS 锁帧滑块交互
- **导航栏**：优化侧边导航布局与面板宽度拖拽调整

### 修复

- 修复 Apex 启动项解析时无限帧率（`+fps_max unlimited`）识别问题
- 修正黑边容忍阈值（`mat_letterbox_aspect_threshold`）配置

---

## [0.0.4]

### 新增

- **支持PUBG配置**：可设置PUBG启动项

---

## [0.0.3] 2026-4-21

### 新增

- **模块仪表盘**：新增模块化 Dashboard 页面,替换原测试视图并作为主功能入口

### 变更

- **路由结构**：移除欢迎页面并优化路由跳转逻辑,缩短进入功能页路径
- **Apex 页面**: 
  - 添加对EA帐户的支持,可读取及应用EA客户端的配置项
  - 添加配置项搜索过滤及常用分类,更方便的查找
- **Apex 配置**：新增配置项如下
  - 渲染多线程模式：(`+mat_queue_mode 2`)
  - Alt+Tab 时窗口最小化：(`+mat_minimize_on_alt_tab 1`)
  - 透明准星颜色：(`+reticle_color "2147483648 2147483648 2147483648"`)
  - 强制禁用垂直同步：(`-forcenovsync`)
  - 禁用手柄：(`-nojoy`)
  - 强制音频输出：(`+miles_channels 2/4/6/8`)
  - 禁用布娃娃：(`+cl_ragdoll_collide 0`)
  - 图形 API (DirectX)：(`-anticheat_settings=SettingsDX11.json` / `-anticheat_settings=SettingsDX12.json`)
  - 限制顶点着色器数量：(`-limitvsconst`)
  - 强制预加载：(`+cl_forcepreload 1` / `-preload`)

### 重构

- **代码组织**：重构 Dashboard 与路由相关实现,提升模块可维护性与后续扩展性

---

## [0.0.2] 2026-3-10

### 新增

- **关于页**：添加腾讯频道、GitHub、项目地址等链接,链接统一放在 `src/data/url_other.ts`
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
[0.0.3]: https://github.com/xmx-emm/mxtools/compare/v0.0.2...v0.0.3
[0.0.4]: https://github.com/xmx-emm/mxtools/compare/v0.0.3...v0.0.4
[0.0.5]: https://github.com/xmx-emm/mxtools/compare/v0.0.4...v0.0.5
