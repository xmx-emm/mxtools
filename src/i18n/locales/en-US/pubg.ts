export const pubgMessages = {
  pubg: {
    startPubg: 'Start PUBG',
    invalidSteamUserId: 'Invalid Steam user id: {id}',
    errors: {
      localAppDataMissing: 'LOCALAPPDATA is not set',
      homeMissing: 'HOME is not set',
      createLogsDirFailed: 'Failed to create logs directory',
      createDirFailed: 'Failed to create directory',
      shellExecuteFailed: 'Failed to open folder',
      emptyPath: 'Path is empty',
    },
  },
  pubgTips: {
    skipIntro: {
      title: 'Skip intro movies',
      line1: 'This tool renames the Movies folder; it does not rely on a single launch argument.',
      line2: 'Effect: shortens intro wait time before the main menu.',
      line3: 'Risk: game updates or file verification may restore the folder; re-check the state afterward.',
    },
    highPriority: {
      title: '-high',
      line1: 'Effect: tries to run the game at a higher scheduling priority so background apps steal less CPU.',
      line2: 'Impact: may smooth frame times when the PC is busy; sometimes little difference.',
      line3: 'Risk: other apps may feel slower. Community tip—verify on your own system.',
    },
    useAllCores: {
      title: '-USEALLAVAILABLECORES',
      line1: 'Effect: asks the engine to use all available CPU cores.',
      line2: 'Impact: may help on older platforms or poor thread scheduling; gains on newer hardware are inconsistent.',
      line3: 'Risk: not clearly effective on every build—A/B test on/off.',
    },
    malloc: {
      title: '-malloc=system',
      line1: 'Effect: tries the system allocator instead of the game default.',
      line2: 'Impact: some players report fewer stutters or memory oddities; not universal.',
      line3: 'Risk: highly version/environment dependent—turn off if frame pacing gets worse.',
    },
    maxMem: {
      title: '-maxMem=X',
      line1: 'Effect: sets a memory ceiling (MB) to guide game memory use.',
      line2: 'Impact: a sensible value may curb extreme usage; too low causes paging and stutter.',
      line3: 'Tip: leave headroom for the OS and background apps.',
    },
    koreanRating: {
      title: '-koreanrating',
      line1: 'Effect: enables Korea-rating visuals (often changes blood/corpse presentation).',
      line2: 'Impact: used for visibility preferences; some claim a small performance gain.',
      line3: 'Risk: visuals change; behavior can differ by patch versus online guides.',
    },
    mouseInput: {
      title: 'Mouse input tuning (combined)',
      line1: 'Flags: -m_mousespeed 0, -m_mouseaccel1 0, -m_mouseaccel2 0.',
      line2: 'Effect: disables accel curves and locks mouse speed for more linear aim.',
      line3: 'Risk: changes muscle memory; if you rely on OS accel, feel may get floaty or dull.',
    },
    graphicsApi: {
      title: 'Graphics API (DX)',
      line1: 'Effect: switches DX10/DX11/DX12—trade compatibility vs performance.',
      line2: 'Impact: older APIs tend to be stabler with fewer features; newer APIs may use the GPU better but need good drivers.',
      line3: 'Tip: if you see crashes, black screens, or hitch spikes, A/B the API.',
    },
    nomanSky: {
      title: '-nomansky',
      line1: 'Effect: tries to simplify sky-related rendering cost.',
      line2: 'Impact: may reduce GPU load on older hardware or older builds.',
      line3: 'Risk: community reports say it may do nothing—disable if no gain.',
    },
    refresh: {
      title: '-refresh X',
      line1: 'Effect: sets refresh rate—usually your monitor rate (60/144/240).',
      line2: 'Impact: a correct value avoids odd refresh-related issues.',
      line3: 'Risk: wrong values can break display modes or do nothing; match OS display settings.',
    },
    window: {
      title: 'Window mode',
      line1: 'Effect: starts in fullscreen, windowed, or borderless.',
      line2: 'Impact: fullscreen often lowest latency; borderless is faster to Alt-Tab; windowed is best for multitasking.',
      line3: 'Tip: stream/record → prefer borderless; competitive → prefer fullscreen and measure frame time.',
    },
    resolution: {
      title: '-res W H',
      line1: 'Effect: forces startup resolution (width × height).',
      line2: 'Impact: lower res cuts GPU load; higher res sharpens but costs more.',
      line3: 'Risk: DPI scaling, multi-monitor, or window modes may stretch or mis-frame.',
    },
    verboseLog: {
      title: '-log',
      line1: 'Effect: writes more verbose logs for crashes and startup failures.',
      line2: 'Impact: very useful while debugging.',
      line3: 'Risk: logs grow faster; leaving it on increases disk use.',
    },
    noTextureStreaming: {
      title: '-notexturestreaming',
      line1: 'Effect: prefers loading more textures up front instead of streaming.',
      line2: 'Impact: less “textures pop in later”, higher VRAM/RAM pressure.',
      line3: 'Risk: low-VRAM GPUs may hitch or OOM—use carefully.',
    },
    matAntialias: {
      title: '+mat_antialias 0',
      line1: 'Effect: reduces anti-aliasing cost for more FPS.',
      line2: 'Impact: sharper/jagged edges; can ease GPU load in some scenes.',
      line3: 'Risk: clear visual downgrade; support varies by build.',
    },
    viewDistance: {
      title: '+r.ViewDistanceScale=X',
      line1: 'Effect: scales far-distance rendering—lower usually saves performance.',
      line2: 'Impact: may raise FPS/stability; distant detail gets worse.',
      line3: 'Tip: step down from 1.0 to 0.8/0.7 instead of dropping too far at once.',
    },
    depthOfField: {
      title: '+r.DepthOfFieldQuality=0',
      line1: 'Effect: disables depth of field to cut post-process cost and blur.',
      line2: 'Impact: sharper image; small gains possible on mid/low GPUs.',
      line3: 'Risk: less cinematic look; measure on your hardware.',
    },
  },
  pubgLaunchOptions: {
    categories: {
      display: 'Graphics & display',
      system: 'System & process',
      startup: 'Startup & debug',
      render: 'Rendering & quality',
    },
    ui: {
      rightClickTip: 'Right-click for details',
      maxMemLabel: 'Max memory',
      refreshLabel: 'Refresh rate',
      widthLabel: 'W',
      heightLabel: 'H',
      viewDistanceLabel: 'View distance',
      openLogsFolder: 'Open logs folder',
      skipIntroDisabled: 'Intro movies are currently disabled',
      skipIntroEnabled: 'Intro movies are currently enabled',
      disableIntroTip: 'Disable intro (rename Movies -> Movies_disabled)',
      restoreIntroTip: 'Restore intro (rename Movies_disabled -> Movies)',
    },
    highPriority: {
      name: 'High priority',
      description: 'Launch the game with high process priority',
    },
    useAllCores: {
      name: 'Use all cores',
      description: 'Force the game to use all available CPU cores',
    },
    malloc: {
      name: 'System memory allocator',
      description: 'Use the system allocator instead of the game one to reduce leaks and hitching',
    },
    maxMem: {
      name: 'Max memory',
      description: 'Set the maximum memory limit',
    },
    koreanRating: {
      name: 'Korean rating',
      description: 'Korean rating mode',
    },
    mouseInput: {
      name: 'Mouse input optimization',
      description: 'Disable mouse acceleration and pin mouse speed',
      speed: 'Mouse speed',
      accel1: 'Mouse accel 1',
      accel2: 'Mouse accel 2',
    },
    graphicsApi: {
      name: 'Graphics API (DirectX)',
      description: 'DX10: SM4 / lower quality; DX11: feature level 11.0; DX12: `-d3d12`',
      dx9: 'DX9',
      dx10: 'DX10',
      dx11: 'DX11',
      dx12: 'DX12',
    },
    nomanSky: {
      name: 'Simplify sky rendering (lower GPU load)',
      description: 'Helps weak GPUs or sky-area frame drops',
    },
    refresh: {
      name: 'FPS',
      description: 'Force a specific refresh rate',
    },
    window: {
      name: 'Window',
      description: 'How the game starts (display mode)',
      fullscreen: 'Fullscreen',
      windowed: 'Windowed',
      borderless: 'Borderless',
    },
    resolution: {
      name: 'Resolution',
      description: 'Forced resolution',
    },
    skipIntro: {
      name: 'Skip intro cinematics',
      description: 'Saves ~5 seconds of loading time',
    },
    verboseLog: {
      name: 'Verbose log (TslGame/Saved/Logs)',
      description: 'Useful for crashes and error diagnosis',
    },
    noTextureStreaming: {
      name: 'Disable texture streaming (preload all)',
      description: 'Helps slow texture loading / distant blur',
    },
    matAntialias: {
      name: 'Disable antialiasing (higher FPS)',
      description: 'Max performance / low-end machines (quality trade-off)',
    },
    viewDistanceScale: {
      name: 'Lower view-distance scale (0.5–1.0)',
      description: 'Can reduce frame drops from high view distance',
    },
    depthOfField: {
      name: 'Disable depth of field',
      description: 'Smoother feel and less blur',
    },
  }
};
