# Apex 配置一致性修复

## 行为修复

- 默认参数与键位修正；两个技能侧键属于游戏默认，不再标成个人偏好。
- 左方括号/分号按游戏键名写入，界面显示实际符号，未编辑行保留原文。
- 准星默认使用空字符串，与设置编辑及快照校验一致。
- DVS 使用分步整数截断，关闭时保留帧时间；补齐 1 FPS 的完整数值范围。
- 鼠标灵敏度下限为0.1，fadeDistScale下限为1。
- 删除受管 threshold 参数、旧超采样/深度羽化字段和画面迁移标志控件；
  旧启动串中的 threshold 留在自定义输入中，不静默删除用户内容。
- 视频重置改为等待游戏按硬件生成；字幕默认交给游戏语言初始化。

## 不一致注释与说明清单（已修正）

| 原说明 | 修正后的说明 | 位置 |
| --- | --- | --- |
| 侧键是个人配置/工具追加默认 | MOUSE4/MOUSE5是游戏技能第二槽位默认 | apex_defaults/settings.cfg、apex_defaults.rs、PROJECT_CONTEXT.md |
| 默认值由13份个人历史稳定性推导，游戏会自动修正错误值 | 使用核对后的默认值；账户及语言相关值由游戏初始化 | apex_defaults/profile.cfg |
| 双括号是损坏数据，后续写入统一修成单括号 | 双括号是合法配置键名；未编辑绑定不重写 | apex_settings.rs、APEX_BINDING_REFERENCE.md |
| 重置直接写三份默认文件，通用中档代表游戏默认 | 通用设置立即恢复，画面按硬件重新生成 | apex_history.rs、apex_defaults.rs、中英文重置提示、PROJECT_CONTEXT.md |
| DVS关闭固定写38000/39200，比例近似公式可等同游戏 | 关闭保留帧时间；开启按整数步骤计算 | apex_dvs.ts、apex_video_config.ts |
| 宽高比min可低于1，threshold=8控制容差 | min有效范围1–2；移除threshold及其提示 | apex_quick_preset.ts、启动项控件与中英文提示 |
| 信号透明度必须使用六位小数 | 1.0与1.000000等数值形式等价 | apex_game_settings.ts |
| 特效三档就是当前游戏菜单写入档位 | 明确为工具联动预设，不冒充菜单行为 | apex_video_config.ts |
| 114个原始显示token随产品附带 | 产品仅保留使用中的录键映射，研究材料独立存放 | apex_binding_inputs.ts、PROJECT_CONTEXT.md |

以上位置指本仓库产品文件。原始逆向材料保留在独立研究目录，不随产品发布。
