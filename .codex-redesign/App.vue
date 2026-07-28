<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  ArrowRight,
  Check,
  Copy,
  Download,
  ExternalLink,
  FolderCog,
  Gamepad2,
  Gauge,
  Globe2,
  LayoutGrid,
  Menu,
  MonitorCog,
  Network,
  PackageCheck,
  RefreshCw,
  Search,
  ServerCog,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  UploadCloud,
  Users,
  Wifi,
  X,
  Zap,
} from '@lucide/vue';

type Category = '全部' | '游戏' | 'Windows' | '网络';

interface Summary {
  version: string;
  downloads: number;
  presetCount: number;
  contributors: number;
  updatedAt: string;
}

interface Preset {
  id: string;
  title: string;
  description: string;
  category: Exclude<Category, '全部'>;
  author: string;
  downloads: number;
  updatedAt: string;
  tags: string[];
  accent: string;
}

interface Release {
  version: string;
  date: string;
  title: string;
  notes: string[];
  current?: boolean;
}

const fallbackSummary: Summary = {
  version: '0.0.5',
  downloads: 0,
  presetCount: 4,
  contributors: 9,
  updatedAt: '2026-07-22',
};

const fallbackPresets: Preset[] = [
  {
    id: 'apex-competitive',
    title: 'Apex 竞技低干扰',
    description: '降低视觉干扰，保留清晰目标轮廓，适合高刷新率显示器。',
    category: '游戏',
    author: 'mxtools-team',
    downloads: 0,
    updatedAt: '2 天前',
    tags: ['Apex', 'FPS', '竞技'],
    accent: 'mint',
  },
  {
    id: 'windows-clean',
    title: 'Windows 清爽工作流',
    description: '恢复常用文件夹入口，整理右键菜单与输入法顺序。',
    category: 'Windows',
    author: 'nono',
    downloads: 0,
    updatedAt: '5 天前',
    tags: ['Explorer', 'IME', '桌面'],
    accent: 'lime',
  },
  {
    id: 'lan-forward',
    title: '局域网端口转发',
    description: '一键导入常用的开发机与游戏联机转发规则。',
    category: '网络',
    author: 'root0w0',
    downloads: 0,
    updatedAt: '1 周前',
    tags: ['端口', 'LAN', '开发'],
    accent: 'coral',
  },
  {
    id: 'pubg-low-latency',
    title: 'PUBG 低延迟启动',
    description: '把常用启动参数收进一个预设，减少每次启动前的重复输入。',
    category: '游戏',
    author: 'kuro',
    downloads: 0,
    updatedAt: '2 周前',
    tags: ['PUBG', '启动项'],
    accent: 'blue',
  },
];

const fallbackReleases: Release[] = [
  {
    version: '0.0.5',
    date: '2026-07-22',
    title: '局域网文件夹共享',
    notes: ['新增 SMB 连接诊断', '预设导入导出稳定性优化'],
    current: true,
  },
  {
    version: '0.0.4',
    date: '2026-07-14',
    title: '游戏工具整合',
    notes: ['新增 Apex 图形预设', '支持保存最近使用模块'],
  },
  {
    version: '0.0.3',
    date: '2026-06-28',
    title: '基础工具箱',
    notes: ['端口转发管理', '远程桌面状态检查'],
  },
];

const heroFeatures = [
  {
    id: 'apex',
    label: 'Apex 配置',
    short: '画面 / 启动项 / 语音包',
    description: '把启动项、画面配置、游戏设置和配置快照收进一个清晰工作区。',
    metric: '启动项 · 画面 · 游戏设置',
    tone: 'mint',
    icon: Gamepad2,
  },
  {
    id: 'windows',
    label: 'Windows 优化',
    short: '系统 / 软件工作流',
    description: '游戏体检、资源管理器、输入法与软件设置集中处理，改动前先看状态。',
    metric: '扫描 · 评分 · 可选修复',
    tone: 'lime',
    icon: MonitorCog,
  },
  {
    id: 'tools',
    label: '实用工具',
    short: '共享 / 远程 / 网络',
    description: 'SMB 共享诊断、远程桌面和端口转发，留在同一个本机工作台。',
    metric: 'SMB · RDP · PortProxy',
    tone: 'coral',
    icon: Zap,
  },
  {
    id: 'presets',
    label: '社区预设',
    short: '分享 / 导入',
    description: '保存配置快照，导入自己或社区整理过的 Apex 方案，再继续微调。',
    metric: '快照导入 · 导出 · 分享',
    tone: 'blue',
    icon: Users,
  },
];

const capabilityCards = [
  {
    number: '01',
    title: 'Apex 配置与优化',
    subtitle: '核心功能',
    description: '从画面细节到启动参数，把散落在配置文件和平台里的设置收进一个清晰界面。',
    icon: Gamepad2,
    tone: 'mint',
    featured: true,
    points: ['启动项与账户', '画面配置 / VSync', '游戏设置与快照', '语音包与快速预设'],
  },
  {
    number: '02',
    title: 'Windows 优化',
    subtitle: '软件与系统工作流',
    description: '高频的 Windows 调整集中到一个工作台，不再反复翻找设置入口。',
    icon: MonitorCog,
    tone: 'lime',
    featured: false,
    points: ['游戏环境体检', '资源管理器', '输入法与软件设置'],
  },
  {
    number: '03',
    title: '实用工具',
    subtitle: '需要时就在手边',
    description: '局域网、远程访问与文件管理工具，适合日常使用和本机运维。',
    icon: ServerCog,
    tone: 'coral',
    featured: false,
    points: ['SMB 共享诊断', '远程桌面管理', 'PortProxy 规则'],
  },
  {
    number: '04',
    title: '社区预设',
    subtitle: '复用验证过的方案',
    description: '搜索、导入并分享 Apex 与系统预设，让调试结果不再只留在一台电脑。',
    icon: LayoutGrid,
    tone: 'blue',
    featured: false,
    points: ['配置快照导入', '分类与标签', '版本与作者信息'],
  },
];

const navItems = [
  { id: 'features', label: 'Apex 功能' },
  { id: 'presets', label: '预设库' },
  { id: 'updates', label: '更新' },
];

const summary = ref<Summary>({ ...fallbackSummary });
const presets = ref<Preset[]>([...fallbackPresets]);
const releases = ref<Release[]>([...fallbackReleases]);
const activeHeroIndex = ref(0);
const activeCategory = ref<Category>('全部');
const searchQuery = ref('');
const mobileNavOpen = ref(false);
const selectedPreset = ref<Preset | null>(null);
const submitOpen = ref(false);
const toast = ref('');
const updateState = ref<'idle' | 'checking' | 'latest' | 'available'>('idle');
const updateMessage = ref('稳定通道已连接');
const copied = ref(false);
const newPreset = ref({ title: '', description: '', category: '游戏' as Exclude<Category, '全部'>, author: '' });

const activeHero = computed(() => heroFeatures[activeHeroIndex.value]);
const filteredPresets = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  return presets.value.filter((preset) => {
    const categoryMatch = activeCategory.value === '全部' || preset.category === activeCategory.value;
    const queryMatch = !query || [preset.title, preset.description, preset.author, ...preset.tags]
      .join(' ')
      .toLowerCase()
      .includes(query);
    return categoryMatch && queryMatch;
  });
});

let featureTimer: number | undefined;
let revealObserver: IntersectionObserver | undefined;

function formatNumber(value: number) {
  return new Intl.NumberFormat('zh-CN').format(value);
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, options);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

async function loadData() {
  try {
    const [remoteSummary, remotePresets, remoteReleases] = await Promise.all([
      request<Summary>('/api/summary'),
      request<Preset[]>('/api/presets'),
      request<Release[]>('/api/releases'),
    ]);
    summary.value = remoteSummary;
    presets.value = remotePresets;
    releases.value = remoteReleases;
  } catch {
    // Static fallback keeps the page useful on a CDN or local file server.
  }
}

function startFeatureRotation() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  window.clearInterval(featureTimer);
  featureTimer = window.setInterval(() => {
    activeHeroIndex.value = (activeHeroIndex.value + 1) % heroFeatures.length;
  }, 5200);
}

function selectHeroFeature(index: number) {
  activeHeroIndex.value = index;
  startFeatureRotation();
}

function scrollTo(id: string) {
  mobileNavOpen.value = false;
  const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  document.getElementById(id)?.scrollIntoView({ behavior, block: 'start' });
}

function showToast(message: string) {
  toast.value = message;
  window.setTimeout(() => {
    if (toast.value === message) toast.value = '';
  }, 3200);
}

function openPreset(preset: Preset) {
  selectedPreset.value = preset;
  copied.value = false;
}

async function downloadPreset(preset: Preset) {
  let recorded = false;
  try {
    const result = await request<{ downloads: number }>(`/api/presets/${preset.id}/download`, { method: 'POST' });
    preset.downloads = result.downloads;
    recorded = true;
  } catch {
    preset.downloads += 1;
  }
  showToast(recorded ? `「${preset.title}」下载已记录，可在 MXTools 中导入预设地址` : `「${preset.title}」已在本地预览中准备，可在 MXTools 中导入预设地址`);
}

async function copyPresetId(preset: Preset) {
  await navigator.clipboard?.writeText(`mxtools://preset/${preset.id}`);
  copied.value = true;
  showToast('预设地址已复制');
}

async function checkUpdate() {
  updateState.value = 'checking';
  updateMessage.value = '正在连接更新通道...';
  try {
    const result = await request<{ latest: string; current: string; hasUpdate: boolean }>('/api/update?version=' + summary.value.version);
    updateState.value = result.hasUpdate ? 'available' : 'latest';
    updateMessage.value = result.hasUpdate ? `发现新版本 ${result.latest}` : '当前已是最新版本';
  } catch {
    updateState.value = 'latest';
    updateMessage.value = '离线预览模式，当前版本可用';
  }
}

async function downloadApp() {
  try {
    const result = await request<{ url?: string }>('/api/download/mxtools');
    if (result.url) window.open(result.url, '_blank', 'noopener');
    else showToast('安装包尚未发布，发布后会自动出现在这里');
  } catch {
    showToast('安装包尚未发布，发布后会自动出现在这里');
  }
}

async function submitPreset() {
  if (!newPreset.value.title.trim() || !newPreset.value.description.trim()) {
    showToast('请先填写预设名称和说明');
    return;
  }
  const preset: Preset = {
    id: `local-${Date.now()}`,
    title: newPreset.value.title.trim(),
    description: newPreset.value.description.trim(),
    category: newPreset.value.category,
    author: newPreset.value.author.trim() || '匿名用户',
    downloads: 0,
    updatedAt: '刚刚',
    tags: ['待审核'],
    accent: 'mint',
  };
  try {
    await request('/api/presets', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(preset),
    });
  } catch {
    // Keep the submission visible in local preview mode.
  }
  presets.value.unshift(preset);
  submitOpen.value = false;
  newPreset.value = { title: '', description: '', category: '游戏', author: '' };
  showToast('预设已提交，审核通过后会进入公共库');
}

function closeLayerOnEscape(event: KeyboardEvent) {
  if (event.key !== 'Escape') return;
  if (selectedPreset.value) selectedPreset.value = null;
  else if (submitOpen.value) submitOpen.value = false;
}

onMounted(() => {
  loadData();
  startFeatureRotation();
  window.addEventListener('keydown', closeLayerOnEscape);
  requestAnimationFrame(() => {
    revealObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) entry.target.classList.add('is-visible');
      }
    }, { threshold: 0.12 });
    document.querySelectorAll('.reveal').forEach((element) => revealObserver?.observe(element));
  });
});

onBeforeUnmount(() => {
  window.clearInterval(featureTimer);
  revealObserver?.disconnect();
  window.removeEventListener('keydown', closeLayerOnEscape);
  document.body.style.overflow = '';
});

watch([selectedPreset, submitOpen], ([preset, submit]) => {
  document.body.style.overflow = preset || submit ? 'hidden' : '';
});
</script>

<template>
  <div class="site-shell">
    <header class="glass-nav">
      <a class="brand" href="#top" aria-label="返回首页" @click.prevent="scrollTo('top')">
        <span class="brand-symbol"><i></i><i></i><i></i></span>
        <span><strong>萌新工具箱</strong><small>MXTools</small></span>
      </a>
      <nav class="desktop-nav" aria-label="主导航">
        <button v-for="item in navItems" :key="item.id" type="button" @click="scrollTo(item.id)">{{ item.label }}</button>
      </nav>
      <div class="nav-actions">
        <span class="release-pill"><i></i> v{{ summary.version }}</span>
        <button class="primary-button nav-download" type="button" @click="downloadApp"><Download :size="16" /> 下载 Windows 版</button>
        <button class="icon-button mobile-toggle" type="button" aria-label="打开导航" title="打开导航" @click="mobileNavOpen = !mobileNavOpen"><X v-if="mobileNavOpen" :size="20" /><Menu v-else :size="20" /></button>
      </div>
      <Transition name="menu-drop">
        <nav v-if="mobileNavOpen" class="mobile-nav" aria-label="手机导航">
          <button v-for="item in navItems" :key="item.id" type="button" @click="scrollTo(item.id)">{{ item.label }}<ArrowRight :size="16" /></button>
        </nav>
      </Transition>
    </header>

    <main>
      <section id="top" class="hero-section">
        <div class="scene-lines" aria-hidden="true"><i v-for="line in 8" :key="line"></i></div>
        <div class="hero-intro reveal is-visible">
          <span class="hero-status"><i></i> 专注 Apex 配置 · 兼顾 Windows 实用工具</span>
          <h1>萌新工具箱 <small>MXTools</small></h1>
          <p class="hero-heading">Apex 配置与优化，从复杂参数到一键预设。</p>
          <p class="hero-copy">画面、启动项、语音包和竞技预设集中管理，另外还有一组真正用得上的 Windows 工具。</p>
          <div class="hero-actions">
            <button class="primary-button hero-download" type="button" @click="downloadApp"><Download :size="18" /> 免费下载 <span>Windows 桌面版</span></button>
            <button class="secondary-button" type="button" @click="scrollTo('features')">查看 Apex 功能 <ArrowRight :size="17" /></button>
          </div>
        </div>

        <div class="feature-switcher glass-surface reveal is-visible" role="tablist" aria-label="核心功能切换">
          <button
            v-for="(feature, index) in heroFeatures"
            :key="feature.id"
            :class="['feature-tab', feature.tone, { active: activeHeroIndex === index }]"
            type="button"
            role="tab"
            :aria-selected="activeHeroIndex === index"
            @click="selectHeroFeature(index)"
          >
            <span class="feature-tab-icon"><component :is="feature.icon" :size="18" /></span>
            <span><strong>{{ feature.label }}</strong><small>{{ feature.short }}</small></span>
            <i class="tab-progress"></i>
          </button>
        </div>

        <div class="product-stage reveal is-visible">
          <div class="stage-accent" :class="activeHero.tone"></div>
          <div class="app-window glass-surface">
            <div class="app-titlebar">
              <div class="traffic-lights"><i></i><i></i><i></i></div>
              <span class="app-title">萌新工具箱</span>
              <span class="app-state"><i></i> 本地模式</span>
            </div>
            <div class="app-layout">
              <aside class="app-sidebar">
                <div class="app-logo"><span class="brand-symbol compact"><i></i><i></i><i></i></span><strong>MX</strong></div>
                <button :class="{ active: activeHero.id === 'apex' }" type="button" title="Apex 配置" @click="selectHeroFeature(0)"><Gamepad2 :size="18" /><span>Apex</span></button>
                <button :class="{ active: activeHero.id === 'windows' }" type="button" title="Windows 优化" @click="selectHeroFeature(1)"><MonitorCog :size="18" /><span>优化</span></button>
                <button :class="{ active: activeHero.id === 'tools' }" type="button" title="实用工具" @click="selectHeroFeature(2)"><Zap :size="18" /><span>工具</span></button>
                <button :class="{ active: activeHero.id === 'presets' }" type="button" title="社区预设" @click="selectHeroFeature(3)"><LayoutGrid :size="18" /><span>预设</span></button>
                <button class="sidebar-bottom" type="button" title="设置"><Settings2 :size="18" /><span>设置</span></button>
              </aside>

              <Transition name="screen-swap" mode="out-in">
                <section :key="activeHero.id" :class="['app-screen', `screen-${activeHero.id}`]">
                  <div class="screen-heading">
                    <div><span>{{ activeHero.short }}</span><h2>{{ activeHero.label }}</h2><p>{{ activeHero.description }}</p></div>
                    <span class="app-action"><Zap :size="15" /> 预览操作</span>
                  </div>

                  <template v-if="activeHero.id === 'apex'">
                    <div class="game-screen-grid">
                      <div class="game-score-pane">
                        <div class="score-ring"><strong>A+</strong><small>示例预设</small></div>
                        <div><span class="screen-label">当前 Apex 预设</span><h3>竞技低干扰</h3><p>减少阴影与视觉噪点，保持人物轮廓清晰。</p><div class="screen-chips"><span>144 Hz</span><span>低延迟</span><span>清晰视野</span></div></div>
                      </div>
                      <div class="settings-list">
                        <div class="setting-row"><span><SlidersHorizontal :size="15" /> 纹理质量</span><div class="setting-slider"><i style="width: 68%"></i></div><b>中</b></div>
                        <div class="setting-row"><span><Gauge :size="15" /> 阴影 / VSync</span><div class="setting-slider"><i style="width: 18%"></i></div><b>低延迟</b></div>
                        <div class="setting-row"><span><Sparkles :size="15" /> 体积光</span><div class="mini-toggle off"><i></i></div><b>关闭</b></div>
                        <div class="setting-row"><span><Zap :size="15" /> 启动项</span><code>-novid +fps_max 0</code><b>可复制</b></div>
                        <div class="setting-row"><span><PackageCheck :size="15" /> 配置快照</span><code>导入 / 导出 JSON</code><b>可回滚</b></div>
                      </div>
                    </div>
                  </template>

                  <template v-else-if="activeHero.id === 'windows'">
                    <div class="system-overview">
                      <div class="system-health"><div><ShieldCheck :size="25" /><span><strong>可选优化</strong><small>读取状态后再决定是否应用</small></span></div><b>PREVIEW</b></div>
                      <div class="system-list">
                        <div><span class="system-icon lime"><FolderCog :size="17" /></span><span><strong>资源管理器</strong><small>常用文件夹与右键菜单</small></span><b>已优化</b></div>
                        <div><span class="system-icon blue"><Globe2 :size="17" /></span><span><strong>输入法顺序</strong><small>3 个输入法已同步</small></span><b>正常</b></div>
                        <div><span class="system-icon mint"><MonitorCog :size="17" /></span><span><strong>窗口与启动行为</strong><small>开机启动与快捷键</small></span><b>已配置</b></div>
                        <div><span class="system-icon coral"><Settings2 :size="17" /></span><span><strong>软件常用设置</strong><small>统一整理高频选项</small></span><b>可用</b></div>
                      </div>
                    </div>
                  </template>

                  <template v-else-if="activeHero.id === 'tools'">
                    <div class="system-overview tools-overview">
                      <div class="system-health"><div><Zap :size="25" /><span><strong>常用工具模块</strong><small>需要时直接打开</small></span></div><b>LOCAL</b></div>
                      <div class="system-list">
                        <div><span class="system-icon coral"><Wifi :size="17" /></span><span><strong>文件夹共享</strong><small>SMB 状态与连接诊断</small></span><b>安全</b></div>
                        <div><span class="system-icon mint"><MonitorCog :size="17" /></span><span><strong>远程桌面</strong><small>开关、端口与快速连接</small></span><b>可用</b></div>
                        <div><span class="system-icon blue"><Network :size="17" /></span><span><strong>端口转发</strong><small>规则管理与导入导出</small></span><b>3 条</b></div>
                        <div><span class="system-icon lime"><FolderCog :size="17" /></span><span><strong>文件管理</strong><small>右键菜单与常用目录</small></span><b>已配置</b></div>
                      </div>
                    </div>
                  </template>

                  <template v-else>
                    <div class="preset-overview">
                      <div class="preset-overview-top"><div><Users :size="20" /><span><strong>Apex 社区精选</strong><small>{{ summary.presetCount }} 个预设可以导入</small></span></div><Search :size="17" /></div>
                      <div class="mini-preset-grid">
                        <div><i class="mini-preset-art mint"><Gamepad2 :size="19" /></i><strong>Apex 竞技低干扰</strong><small>mxtools-team · 2 天前</small><span>查看快照 <ArrowRight :size="13" /></span></div>
                        <div><i class="mini-preset-art lime"><Gauge :size="19" /></i><strong>Apex 老显卡流畅</strong><small>nono · 5 天前</small><span>查看快照 <ArrowRight :size="13" /></span></div>
                        <div><i class="mini-preset-art coral"><Sparkles :size="19" /></i><strong>Apex 清晰画面</strong><small>root0w0 · 1 周前</small><span>查看快照 <ArrowRight :size="13" /></span></div>
                      </div>
                    </div>
                  </template>
                </section>
              </Transition>
            </div>
          </div>

          <div :class="['floating-glass', 'feature-float', activeHero.tone]">
            <component :is="activeHero.icon" :size="20" /><span><small>当前模块</small><strong>{{ activeHero.metric }}</strong></span><Check :size="16" />
          </div>
          <div class="floating-glass sync-float"><span class="sync-icon"><RefreshCw :size="16" /></span><span><small>本地操作</small><strong>可回滚预览</strong></span></div>
        </div>
      </section>

      <section class="stat-ribbon">
        <div><span>核心能力</span><strong>Apex 配置</strong></div>
        <div><span>累计下载</span><strong>{{ summary.downloads ? formatNumber(summary.downloads) : '统计接入中' }}</strong></div>
        <div><span>共享预设</span><strong>{{ summary.presetCount }} 个</strong></div>
        <div><span>最新版本</span><strong><i></i> v{{ summary.version }}</strong></div>
      </section>

      <section id="features" class="light-section">
        <div class="section-inner">
          <header class="section-heading reveal">
            <div><span class="section-kicker">Apex 与更多功能</span><h2>先把 Apex 配好，再顺手解决其它麻烦。</h2></div>
            <p>Apex 是萌新工具箱的核心。其它优化和实用工具围绕日常高频问题展开，不堆无用功能。</p>
          </header>
          <div class="capability-grid">
            <article v-for="card in capabilityCards" :key="card.number" :class="['capability-card', card.tone, { featured: card.featured }, 'reveal']">
              <div class="capability-top"><span class="capability-icon"><component :is="card.icon" :size="25" /></span><span class="capability-number">{{ card.number }}</span></div>
              <small>{{ card.subtitle }}</small><h3>{{ card.title }}</h3><p>{{ card.description }}</p>
              <ul><li v-for="point in card.points" :key="point"><Check :size="14" />{{ point }}</li></ul>
              <button type="button" @click="scrollTo(card.number === '04' ? 'presets' : 'top')">查看功能 <ArrowRight :size="15" /></button>
            </article>
          </div>
        </div>
      </section>

      <section id="presets" class="preset-section section-inner">
        <header class="section-heading dark-heading reveal">
          <div><span class="section-kicker">社区预设</span><h2>别人的 Apex 调试结果，你可以直接用。</h2></div>
          <div class="heading-actions"><p>搜索、查看、导入，也可以把自己的 Apex 或系统方案分享给其他人。</p><button class="outline-button" type="button" @click="submitOpen = true"><UploadCloud :size="16" /> 分享预设</button></div>
        </header>
        <div class="preset-toolbar glass-surface reveal">
          <label class="search-box"><Search :size="18" /><input v-model="searchQuery" type="search" placeholder="搜索预设、标签或作者" aria-label="搜索预设" /></label>
          <div class="filter-tabs">
            <button v-for="category in (['全部', '游戏', 'Windows', '网络'] as Category[])" :key="category" :class="{ active: activeCategory === category }" type="button" @click="activeCategory = category">{{ category }}</button>
          </div>
          <span>{{ filteredPresets.length }} 个结果</span>
        </div>
        <div class="preset-grid">
          <article v-for="preset in filteredPresets" :key="preset.id" :class="['preset-card', preset.accent, 'reveal']" role="button" tabindex="0" @click="openPreset(preset)" @keydown.enter="openPreset(preset)" @keydown.space.prevent="openPreset(preset)">
            <div class="preset-art"><component :is="preset.category === '游戏' ? Gamepad2 : preset.category === 'Windows' ? MonitorCog : Network" :size="27" /><span>{{ preset.category }}</span></div>
            <div class="preset-card-copy"><div><span>{{ preset.updatedAt }}</span><span><Download :size="13" /> {{ formatNumber(preset.downloads) }}</span></div><h3>{{ preset.title }}</h3><p>{{ preset.description }}</p></div>
            <footer><span class="author-avatar">{{ preset.author.slice(0, 1).toUpperCase() }}</span><span>{{ preset.author }}</span><ArrowRight :size="17" /></footer>
          </article>
          <button v-if="!filteredPresets.length" class="empty-state" type="button" @click="searchQuery = ''; activeCategory = '全部'">没有匹配结果，清除筛选 <X :size="15" /></button>
        </div>
      </section>

      <section id="updates" class="update-section">
        <div class="section-inner update-layout">
          <div class="update-copy reveal"><span class="section-kicker">在线更新</span><h2>Apex 版本在变，配置工具也会跟上。</h2><p>客户端可以直接检查稳定通道。版本、发布日期与主要变化都保持透明。</p><button class="primary-button" type="button" :disabled="updateState === 'checking'" @click="checkUpdate"><RefreshCw :size="16" :class="{ spinning: updateState === 'checking' }" /> {{ updateState === 'checking' ? '正在检查' : '检查更新' }}</button></div>
          <div class="update-glass glass-surface reveal">
            <div class="update-status"><span :class="['update-indicator', updateState]"><i></i></span><div><small>稳定更新通道</small><strong>{{ updateMessage }}</strong></div><b>v{{ summary.version }}</b></div>
            <div class="release-list">
              <article v-for="release in releases" :key="release.version"><div class="release-meta"><span :class="{ current: release.current }"></span><strong>v{{ release.version }}</strong><small>{{ release.date }}</small></div><div><h3>{{ release.title }}<b v-if="release.current">当前版本</b></h3><p>{{ release.notes.join(' · ') }}</p></div><ExternalLink :size="15" /></article>
            </div>
          </div>
        </div>
      </section>

      <section class="final-cta section-inner reveal">
        <div><span class="hero-status"><i></i> Apex 配置 · Windows 实用工具 · 本地优先</span><h2>把 Apex 配置，变成几次点击。</h2><p>从一个真正顺手的工具箱开始。</p></div>
        <button class="primary-button cta-button" type="button" @click="downloadApp"><Download :size="18" /> 下载 MXTools <ArrowRight :size="16" /></button>
      </section>
    </main>

    <footer class="site-footer section-inner"><div class="footer-brand"><span class="brand-symbol compact"><i></i><i></i><i></i></span><span><strong>萌新工具箱</strong><small>MXTools</small></span></div><div><a href="#features" @click.prevent="scrollTo('features')">Apex 功能</a><a href="#presets" @click.prevent="scrollTo('presets')">预设库</a><a href="http://gitlab.0w0.online/emm/mxtools" target="_blank" rel="noreferrer">源代码 <ExternalLink :size="13" /></a></div><small>© 2026 0w0</small></footer>

    <div v-if="selectedPreset" class="modal-backdrop" @click.self="selectedPreset = null">
      <article :class="['preset-modal', selectedPreset.accent]" role="dialog" aria-modal="true" aria-labelledby="preset-modal-title">
        <button class="icon-button modal-close" type="button" title="关闭预设详情" aria-label="关闭预设详情" @click="selectedPreset = null"><X :size="18" /></button>
        <div class="modal-art"><component :is="selectedPreset.category === '游戏' ? Gamepad2 : selectedPreset.category === 'Windows' ? MonitorCog : Network" :size="32" /><span>{{ selectedPreset.category }}</span></div>
        <h2 id="preset-modal-title">{{ selectedPreset.title }}</h2><p>{{ selectedPreset.description }}</p>
        <div class="modal-stats"><div><span>作者</span><strong>{{ selectedPreset.author }}</strong></div><div><span>下载</span><strong>{{ formatNumber(selectedPreset.downloads) }}</strong></div><div><span>更新</span><strong>{{ selectedPreset.updatedAt }}</strong></div></div>
        <div class="modal-tags"><span v-for="tag in selectedPreset.tags" :key="tag">#{{ tag }}</span></div>
        <div class="modal-actions"><button class="primary-button" type="button" @click="downloadPreset(selectedPreset)"><Download :size="16" /> 下载并导入</button><button class="secondary-button" type="button" @click="copyPresetId(selectedPreset)"><Check v-if="copied" :size="16" /><Copy v-else :size="16" /> {{ copied ? '已复制' : '复制地址' }}</button></div>
      </article>
    </div>

    <div v-if="submitOpen" class="modal-backdrop" @click.self="submitOpen = false">
      <article class="submit-modal" role="dialog" aria-modal="true" aria-labelledby="submit-modal-title">
        <button class="icon-button modal-close" type="button" title="关闭投稿" aria-label="关闭投稿" @click="submitOpen = false"><X :size="18" /></button>
        <span class="section-kicker">分享预设</span><h2 id="submit-modal-title">让好配置被更多人用到。</h2><p>提交后会进入审核队列，通过后出现在公共预设库。</p>
        <form @submit.prevent="submitPreset"><label>预设名称<input v-model="newPreset.title" required placeholder="例如：Apex 低干扰" /></label><label>一句话说明<textarea v-model="newPreset.description" required rows="3" placeholder="它解决什么问题？"></textarea></label><div class="form-row"><label>分类<select v-model="newPreset.category"><option>游戏</option><option>Windows</option><option>网络</option></select></label><label>署名<input v-model="newPreset.author" placeholder="可选" /></label></div><div class="modal-actions"><button class="primary-button" type="submit"><UploadCloud :size="16" /> 提交预设</button><button class="secondary-button" type="button" @click="submitOpen = false">取消</button></div></form>
      </article>
    </div>

    <Transition name="toast"><div v-if="toast" class="toast-message"><Check :size="16" /> {{ toast }}</div></Transition>
  </div>
</template>
