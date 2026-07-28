export const pubgMessages = {
  pubg: {
    startPubg: '启动 PUBG',
    invalidSteamUserId: '无效的 Steam 用户 id: {id}',
    errors: {
      localAppDataMissing: '未设置 LOCALAPPDATA',
      homeMissing: '未设置 HOME',
      createLogsDirFailed: '创建日志目录失败',
      createDirFailed: '创建目录失败',
      shellExecuteFailed: '打开文件夹失败',
      emptyPath: '路径为空',
    },
  },
  pubgTips: {
    skipIntro: {
      title: '跳过开场动画',
      line1: '本项在本工具中通过重命名 Movies 目录实现，不依赖单一启动参数。',
      line2: '作用：减少开场动画等待时间，缩短进入主菜单前的加载路径。',
      line3: '风险：游戏更新/文件校验后目录可能被恢复，需重新检查状态。',
    },
    highPriority: {
      title: '-high',
      line1: '作用：尝试让游戏进程以更高调度优先级运行，减少被后台程序抢占 CPU 时间。',
      line2: '影响：在后台任务较多时，可能带来更平稳的帧时间；也可能基本无感。',
      line3: '风险：可能导致其它程序响应变慢。属于社区经验项，建议结合你自己的系统实测。',
    },
    useAllCores: {
      title: '-USEALLAVAILABLECORES',
      line1: '作用：请求引擎尽量使用全部可用 CPU 核心。',
      line2: '影响：在旧平台或线程调度不理想场景，可能有帮助；新版本/新硬件上提升不稳定。',
      line3: '风险：不是所有版本都明显生效，属于「可能有效」的兼容参数，建议开关对比测试。',
    },
    malloc: {
      title: '-malloc=system',
      line1: '作用：尝试使用系统内存分配策略，替代游戏默认分配行为。',
      line2: '影响：部分玩家反馈可降低卡顿或内存异常，但并非所有机器都能复现。',
      line3: '风险：收益高度依赖版本与系统环境，若出现异常帧波动可关闭该项回退。',
    },
    maxMem: {
      title: '-maxMem=X',
      line1: '作用：设置可用内存上限（单位 MB），用于限制或引导游戏内存占用。',
      line2: '影响：合适数值可能减少极端内存占用，过低会导致频繁换页与卡顿。',
      line3: '建议：通常保留系统与后台余量，不要把总内存几乎全部分配给游戏。',
    },
    koreanRating: {
      title: '-koreanrating',
      line1: '作用：启用韩国评级相关表现（常见反馈为血迹/尸体表现变化）。',
      line2: '影响：社区中常被用于可视性偏好设置，部分玩家认为有轻微性能收益。',
      line3: '风险：视觉表现会改变；具体效果受版本影响，可能与网络攻略描述不完全一致。',
    },
    mouseInput: {
      title: '鼠标输入优化(组合参数)',
      line1: '参数：-m_mousespeed 0、-m_mouseaccel1 0、-m_mouseaccel2 0。',
      line2: '作用：关闭加速曲线并固定鼠标速度，追求更线性的瞄准手感。',
      line3: '风险：会改变原有肌肉记忆；若依赖系统加速或习惯旧手感，可能觉得更「飘」或更「钝」。',
    },
    graphicsApi: {
      title: '图形 API(DX)',
      line1: '作用：切换图形后端（DX10/DX11/DX12），在兼容性与性能之间做取舍。',
      line2: '影响：低版本 API 往往更稳但画质/特性可能受限；高版本 API 可能更好利用率，也可能更挑驱动。',
      line3: '建议：出现闪退、黑屏、卡顿峰值时，可切换 API 做 A/B 对比。',
    },
    nomanSky: {
      title: '-nomansky',
      line1: '作用：尝试简化天空相关渲染负担。',
      line2: '影响：在部分老硬件或旧版本中可能减少 GPU 压力。',
      line3: '风险：该类参数在社区资料中存在「可能失效」争议，若无改善可直接关闭。',
    },
    refresh: {
      title: '-refresh X',
      line1: '作用：指定刷新率参数，通常填你的显示器实际刷新率（如 60/144/240）。',
      line2: '影响：设置正确时可避免异常刷新率导致的体验问题。',
      line3: '风险：填错值可能导致显示模式异常或无收益，建议与系统显示设置保持一致。',
    },
    window: {
      title: '窗口模式',
      line1: '作用：在全屏、窗口、无边框之间切换启动模式。',
      line2: '影响：全屏通常延迟更低；无边框切桌面更快；窗口模式便于多任务。',
      line3: '建议：直播/录制/频繁切屏可优先无边框；纯竞技可优先全屏并实测帧时间。',
    },
    resolution: {
      title: '-res W H',
      line1: '作用：强制指定启动分辨率（宽×高）。',
      line2: '影响：降低分辨率可明显减轻 GPU 负担；提高分辨率可提升清晰度但更吃性能。',
      line3: '风险：与系统缩放、多显示器、窗口模式组合时，可能出现拉伸或边框异常。',
    },
    verboseLog: {
      title: '-log',
      line1: '作用：输出更详细日志，便于排查闪退、报错或启动异常。',
      line2: '影响：调试阶段很有用，能提供更完整上下文。',
      line3: '风险：日志文件增长更快，长期常开会增加磁盘写入与占用。',
    },
    noTextureStreaming: {
      title: '-notexturestreaming',
      line1: '作用：尽量禁用纹理流送，倾向一次性加载更多纹理资源。',
      line2: '影响：可减少「贴图后加载」现象，但会提高显存/内存压力。',
      line3: '风险：显存不足时可能引发卡顿或爆显存，低显存设备需谨慎开启。',
    },
    matAntialias: {
      title: '+mat_antialias 0',
      line1: '作用：关闭或降低抗锯齿相关开销，优先换取帧数。',
      line2: '影响：边缘会更锯齿、画面更「硬」，但在部分场景可减轻 GPU 负担。',
      line3: '风险：视觉质量下降明显；且不同版本对该参数的支持度可能不一致。',
    },
    viewDistance: {
      title: '+r.ViewDistanceScale=X',
      line1: '作用：调整远景渲染比例，范围越低通常越省性能。',
      line2: '影响：较低值可能提升帧率与帧稳定性，但远处细节会变差。',
      line3: '建议：从 1.0 逐步下调到 0.8/0.7 进行对比，避免一次降得过低。',
    },
    depthOfField: {
      title: '+r.DepthOfFieldQuality=0',
      line1: '作用：关闭景深效果，减少后处理开销与画面模糊。',
      line2: '影响：画面更锐利，低中端设备可能获得小幅性能提升。',
      line3: '风险：视觉风格会变化，电影感降低；收益仍以实机测试为准。',
    },
  },
  pubgLaunchOptions: {
    categories: {
      display: '图形与显示',
      system: '系统与进程',
      startup: '启动与调试',
      render: '渲染与画质',
    },
    ui: {
      rightClickTip: '右键查看说明',
      maxMemLabel: '最大内存',
      refreshLabel: '刷新率',
      widthLabel: '宽',
      heightLabel: '高',
      viewDistanceLabel: '视距比例',
      openLogsFolder: '打开日志目录',
      skipIntroDisabled: '当前已禁用开场动画',
      skipIntroEnabled: '当前未禁用开场动画',
      disableIntroTip: '禁用开场动画(重命名 Movies -> Movies_disabled)',
      restoreIntroTip: '恢复开场动画(重命名 Movies_disabled -> Movies)',
    },
    highPriority: {
      name: '高优先级',
      description: '强制游戏以高处理优先级启动',
    },
    useAllCores: {
      name: '使用所有核心',
      description: '强制游戏使用所有核心',
    },
    malloc: {
      name: '使用系统内存分配',
      description: '改用系统内存分配器(而非游戏自带),减少内存泄漏与卡顿',
    },
    maxMem: {
      name: '最大内存',
      description: '设置最大内存',
    },
    koreanRating: {
      name: '韩国评级',
      description: '韩国评级',
    },
    mouseInput: {
      name: '鼠标输入优化',
      description: '关闭鼠标加速并固定鼠标速度',
      speed: '鼠标速度',
      accel1: '鼠标加速1',
      accel2: '鼠标加速2',
    },
    graphicsApi: {
      name: '图形 API (DirectX)',
      description: 'DX10：SM4 / 降低画质；DX11：限制特性级 11.0；DX12：`-d3d12`',
      dx9: 'DX9',
      dx10: 'DX10',
      dx11: 'DX11',
      dx12: 'DX12',
    },
    nomanSky: {
      name: '简化天空渲染,减少 GPU 负载',
      description: '显卡弱、天空区域掉帧',
    },
    refresh: {
      name: 'Fps',
      description: '强制游戏使用指定刷新率',
    },
    window: {
      name: '窗口',
      description: '设置启动窗口方式',
      fullscreen: '全屏模式',
      windowed: '窗口模式',
      borderless: '无边框模式',
    },
    resolution: {
      name: '分辨率',
      description: '强制分辨率',
    },
    skipIntro: {
      name: '跳过开场动画',
      description: '节省~5s加载时间',
    },
    verboseLog: {
      name: '生成详细日志文件(TslGame/Saved/Logs)',
      description: '排查闪退、崩溃、报错',
    },
    noTextureStreaming: {
      name: '禁用纹理流送(预加载全部纹理)',
      description: '解决纹理加载慢、远处模糊的问题',
    },
    matAntialias: {
      name: '关闭抗锯齿(提升 FPS)',
      description: '极致性能、低配,那么代价呢',
    },
    viewDistanceScale: {
      name: '降低视距渲染比例(0.5–1.0)',
      description: '可以解决视距过高导致的掉帧问题',
    },
    depthOfField: {
      name: '关闭景深效果',
      description: '提升流畅度、减少模糊',
    },
  }
};
