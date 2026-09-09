# Apex 画面配置参考

画面文件位于 `%USERPROFILE%/Saved Games/Respawn/Apex/local/videoconfig.txt`。
根节点为 `VideoConfig`，键和值使用引号。读取器兼容 CRLF 和尾部 NUL。

当前工具要求 `setting.configversion` 是至少为 10 的正 int32，才允许画面编辑和只读锁定。
这是字段兼容性检查，不代表文件完整。缺失或旧格式不会被静默补版本。

完整重置先在内存生成配置，再保存历史、清空所选账户启动项、写入并回读三份文件。
画面生成使用安装版本、显卡、显存、系统内存和显示模式；字幕使用实际游戏语言。
硬件或语言信息不可用时在写入前报错。生成器位于
`src-tauri/src/game/apex_defaults/`，完整画面样例见
`tests/fixtures/apex/videoconfig-v10.txt`，样例中的测试偏好不是通用默认值。

普通预设仅修改选中的字段，保留未编辑值。失败时恢复原文件与属性；无法确认恢复时
保留历史。另一条“由游戏重新生成画面配置”路径仅移除画面文件，需用户启动并退出游戏。

Steam 和 EA 共用当前 Windows 用户的画面文件，账户启动项和语言发现分别处理。
`npm run test:apex-video-native` 覆盖两平台逐项、全选、重新读取和再次重置；
文件流程通过不等于游戏内验收通过。
