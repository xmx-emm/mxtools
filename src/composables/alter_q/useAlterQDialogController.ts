import {computed, nextTick, onMounted, onUnmounted, ref, watch} from 'vue';
import {useI18n} from 'vue-i18n';
import {open} from '@tauri-apps/plugin-dialog';
import {openUrl} from '@tauri-apps/plugin-opener';
import {listen, type UnlistenFn} from '@tauri-apps/api/event';
import {getCurrentWindow} from '@tauri-apps/api/window';
import {useToast} from 'vue-toastification';
import {useSettingsStore} from '@/stores/settings.ts';
import {
  alterQComputeTheta,
  alterQListSteamScreenshotDirs,
  alterQOcrDelete,
  alterQOcrDownload,
  alterQOcrStatus,
  alterQOpenOcrSettings,
  alterQTestOcr,
} from '@/ipc/commands.ts';
import type {
  AlterQCaptureResult,
  AlterQOcrEngine,
  AlterQOverlayGeometry,
  AlterQOverlayInteractionMode,
  AlterQOverlayPlacement,
  AlterQRoi,
  AlterQThetaResult,
  AlterQWindowTarget,
} from '@/types/alter_q.ts';
import {
  ALTER_Q_OVERLAY_INTERACTION_EVENT,
  ALTER_Q_OVERLAY_GEOMETRY_EVENT,
  ALTER_Q_PREFS_CHANGED_EVENT,
  ALTER_Q_WINDOW_NAVIGATE_EVENT,
  ALTER_Q_WINDOW_TARGET_STORAGE_KEY,
  DEFAULT_OVERLAY_OPACITY,
  DEFAULT_PING_ROI,
  DEFAULT_SHOWPOS_ROI,
  MAX_OVERLAY_OPACITY,
  MIN_OVERLAY_OPACITY,
  loadAlterQPrefs,
} from '@/types/alter_q.ts';
import {
  applyAlterQOverlayGeometry,
  applyAlterQPrefs,
  normalizeAlterQFolder,
  refreshAlterQOverlayAppearance,
  resetAndApplyAlterQOverlayGeometry,
  runAlterQCapture,
  setAlterQResultHandler,
  setAlterQOverlayInteractionMode,
  showAlterQResultOverlay,
} from '@/utils/alter_q.ts';
import {useAlterQPreferencesController} from './useAlterQPreferencesController.ts';
import {useAlterQOcrController} from './useAlterQOcrController.ts';
import {useAlterQScreenshotSource} from './useAlterQScreenshotSource.ts';

export function useAlterQDialogController() {
  const AUTHOR_VIDEO = 'https://www.bilibili.com/video/BV1svEsz3E1y';
  const AUTHOR_GITHUB = 'https://github.com/NYTN02/APEX_thetacalculation';
  const AUTHOR_HOME = 'https://github.com/NYTN02';
  
  const {t} = useI18n();
  const toast = useToast();
  const currentWindowLabel = getCurrentWindow().label;
  const settingsStore = useSettingsStore();
  
  const {
    prefs,
    clone: cloneAlterQPrefs,
    changedKeys: changedAlterQPrefsKeys,
    setBaseline: setPersistedPrefsBaseline,
    patchBaseline: patchPersistedPrefsBaseline,
    adopt: adoptPersistedAlterQPrefs,
  } = useAlterQPreferencesController();
  const wizardStep = ref(prefs.setupDone ? -1 : prefs.wizardStep);
  const {
    ocrOk,
    ocrChecking,
    ocrCheckFailed,
    ocrStatus,
    ocrDownloading,
    ocrDownloadPercent,
    ocrDownloadFile,
    ocrDownloadMirror,
    setDownloadProgress,
    resetDownloadProgress,
  } = useAlterQOcrController(prefs.setupDone || (!prefs.setupDone && prefs.wizardStep === 1));
  const busy = ref(false);
  const captureBusy = ref(false);
  const lastResult = ref<AlterQCaptureResult | null>(null);
  const manualR = ref<number | null>(null);
  const manualAlpha = ref<number | null>(null);
  const theta = ref<AlterQThetaResult | null>(null);
  const thetaInput = ref<{r: number; alpha: number} | null>(null);
  type MainTab = AlterQWindowTarget;
  const mainTab = ref<MainTab>('workspace');
  const pendingMainTab = ref<MainTab | null>(null);
  const pageScroll = ref<HTMLElement | null>(null);
  const deleteConfirmOpen = ref(false);
  const deletingOcr = ref(false);
  const captureError = ref(false);
  const {steamDirs, selectedSteamUserId, folderMode, folderKey} =
    useAlterQScreenshotSource(prefs);
  const calibrateOpen = ref(false);
  const overlayPlaceOpen = ref(false);
  
  let unlistenDownload: UnlistenFn | null = null;
  let unlistenOverlayInteraction: UnlistenFn | null = null;
  let unlistenOverlayGeometry: UnlistenFn | null = null;
  let unlistenNavigate: UnlistenFn | null = null;
  let unlistenPrefs: UnlistenFn | null = null;
  let persistSequence = 0;
  let persistQueue: Promise<void> = Promise.resolve();
  let syncingExternalPrefs = false;
  let captureGeneration = 0;
  let scheduledPrefsPersistTimer: ReturnType<typeof setTimeout> | null = null;
  
  const mainTabs = computed(() => [
    {
      id: 'workspace' as const,
      title: t('apex.alterQ.tabWorkspace'),
      description: t('apex.alterQ.tabWorkspaceHint'),
      icon: 'mdi-angle-acute',
    },
    {
      id: 'ocr' as const,
      title: t('apex.alterQ.tabOcr'),
      description: t('apex.alterQ.tabOcrHint'),
      icon: 'mdi-text-recognition',
    },
    {
      id: 'settings' as const,
      title: t('apex.alterQ.tabSettings'),
      description: t('apex.alterQ.tabSettingsHint'),
      icon: 'mdi-tune-variant',
    },
    {
      id: 'background' as const,
      title: t('apex.alterQ.tabBackground'),
      description: t('apex.alterQ.tabBackgroundHint'),
      icon: 'mdi-tray-full',
    },
    {
      id: 'overlay' as const,
      title: t('apex.alterQ.tabOverlay'),
      description: t('apex.alterQ.tabOverlayHint'),
      icon: 'mdi-picture-in-picture-bottom-right',
    },
  ]);
  
  const activeMainTab = computed(() =>
    mainTabs.value.find((tab) => tab.id === mainTab.value) ?? mainTabs.value[0]!,
  );
  const hotkeyConfigReady = computed(() => (
    prefs.enabled
    && prefs.setupDone
    && prefs.hotkey.trim().length > 0
    && prefs.screenshotFolder.trim().length > 0
  ));
  const hotkeyOperational = computed(() => (
    hotkeyConfigReady.value
    && !ocrChecking.value
    && ocrOk.value === true
  ));
  const hotkeyStatusHint = computed(() => {
    if (!prefs.enabled) return t('apex.alterQ.navPausedHint');
    if (!hotkeyConfigReady.value) return t('apex.alterQ.navNeedsSetup');
    if (ocrChecking.value) return t('apex.alterQ.ocrChecking');
    if (ocrCheckFailed.value) return t('apex.alterQ.ocrCheckFailed');
    if (ocrOk.value !== true) return t('apex.alterQ.ocrUnavailable');
    return hotkeyOperational.value
      ? t('apex.alterQ.navReadyHint', {hotkey: prefs.hotkey})
      : t('apex.alterQ.navPausedHint');
  });
  
  function selectMainTab(tab: MainTab) {
    mainTab.value = tab;
    void nextTick(() => {
      pageScroll.value?.scrollTo({top: 0, behavior: 'auto'});
    });
  }
  
  function requestMainTab(tab: MainTab) {
    if (wizardStep.value >= 0) {
      pendingMainTab.value = tab;
      return;
    }
    selectMainTab(tab);
  }
  
  function parseMainTab(value: unknown): MainTab | null {
    return value === 'workspace'
      || value === 'ocr'
      || value === 'settings'
      || value === 'background'
      || value === 'overlay'
      ? value
      : null;
  }
  
  function consumeStoredMainTab() {
    try {
      const target = parseMainTab(localStorage.getItem(ALTER_Q_WINDOW_TARGET_STORAGE_KEY));
      if (target) requestMainTab(target);
      localStorage.removeItem(ALTER_Q_WINDOW_TARGET_STORAGE_KEY);
    } catch {
      /* The live event remains available when storage is disabled. */
    }
  }
  
  function onWindowStorage(event: StorageEvent) {
    if (event.key === ALTER_Q_WINDOW_TARGET_STORAGE_KEY) {
      const target = parseMainTab(event.newValue);
      if (target) requestMainTab(target);
      return;
    }
  }
  
  function onMainTabKeydown(event: KeyboardEvent, current: MainTab) {
    const ids = mainTabs.value.map((tab) => tab.id);
    const index = ids.indexOf(current);
    if (index < 0) return;
    let nextIndex: number | null = null;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      nextIndex = (index + 1) % ids.length;
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      nextIndex = (index - 1 + ids.length) % ids.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = ids.length - 1;
    }
    if (nextIndex == null) return;
    event.preventDefault();
    const next = ids[nextIndex]!;
    selectMainTab(next);
    void nextTick(() => document.getElementById(`alter-q-tab-${next}`)?.focus());
  }
  
  const wizardSteps = computed(() =>
    Array.from({length: 7}, (_, index) => ({
      index,
      title: t(`apex.alterQ.steps.${index}.short`),
    })),
  );
  
  const overlayPreviewStyle = computed(() => ({
    background: `rgba(28, 28, 32, ${prefs.overlayOpacity})`,
  }));
  
  const overlayPreviewMeta = computed(() => {
    const distance = manualR.value ?? theta.value?.r ?? lastResult.value?.distanceM ?? null;
    const angle = manualAlpha.value ?? theta.value?.alpha ?? lastResult.value?.alpha ?? null;
    const distanceText = distance == null ? '— m' : `${distance.toFixed(1)} m`;
    const angleText = angle == null ? '—°' : `${angle.toFixed(2)}°`;
    return `${distanceText} · ${angleText}`;
  });
  const manualInputsValid = computed(() => {
    const distance = Number(manualR.value);
    const alpha = Number(manualAlpha.value);
    return Number.isFinite(distance) && distance > 0 && Number.isFinite(alpha);
  });
  
  const canNext = computed(() => {
    switch (wizardStep.value) {
      case 0:
        return true;
      case 1:
        return ocrOk.value === true;
      case 2:
        return prefs.showposConfirmed;
      case 3:
        return !!prefs.screenshotFolder.trim();
      case 4:
        return !!prefs.hotkey;
      case 5:
        return prefs.usageConfirmed;
      case 6:
        return true;
      default:
        return false;
    }
  });
  
  function persistPrefs(replaceOverlayGeometry: boolean): Promise<boolean> {
    // 主界面时 wizardStep 为 -1，落盘仍保存 0（用 setupDone 区分），避免 Math.max 把状态搞乱
    const sequence = ++persistSequence;
    const next = cloneAlterQPrefs({
      ...prefs,
      setupDone: prefs.setupDone || wizardStep.value < 0,
      wizardStep: wizardStep.value >= 0 ? wizardStep.value : 0,
    });
    const changedKeys = changedAlterQPrefsKeys(next);
    const task = persistQueue.then(async () => {
      try {
        await applyAlterQPrefs(next, {replaceOverlayGeometry, changedKeys});
        setPersistedPrefsBaseline(next);
        // A slower earlier save must not overwrite controls that the user has
        // already changed again while IPC/hotkey registration was pending.
        if (sequence === persistSequence) Object.assign(prefs, next);
        return true;
      } catch (e) {
        const rollback = loadAlterQPrefs();
        setPersistedPrefsBaseline(rollback);
        if (sequence === persistSequence) {
          Object.assign(prefs, rollback);
          const message = String(e);
          toast.error(message.includes('HOTKEY') || message.includes('shortcut')
            ? t('settings.shortcutRegisterFailed')
            : message);
        }
        return false;
      }
    });
    persistQueue = task.then(() => undefined, () => undefined);
    return task;
  }
  
  async function persist() {
    return persistPrefs(false);
  }
  
  function schedulePrefsPersist() {
    if (syncingExternalPrefs) return;
    if (scheduledPrefsPersistTimer != null) clearTimeout(scheduledPrefsPersistTimer);
    scheduledPrefsPersistTimer = setTimeout(() => {
      scheduledPrefsPersistTimer = null;
      void persist();
    }, 250);
  }
  
  function flushScheduledPrefsPersist() {
    if (scheduledPrefsPersistTimer == null) return;
    clearTimeout(scheduledPrefsPersistTimer);
    scheduledPrefsPersistTimer = null;
    void persist();
  }
  
  /** 结束引导，进入主界面（完成 / 跳过共用） */
  async function enterMainUi(opts?: {skipped?: boolean}) {
    const previousSetupDone = prefs.setupDone;
    const previousWizardStep = prefs.wizardStep;
    const previousWizardView = wizardStep.value;
    const previousTab = mainTab.value;
    prefs.setupDone = true;
    prefs.wizardStep = 0;
    wizardStep.value = -1;
    const target = pendingMainTab.value ?? 'workspace';
    selectMainTab(target);
    if (!(await persist())) {
      Object.assign(prefs, loadAlterQPrefs());
      prefs.setupDone = previousSetupDone;
      prefs.wizardStep = previousWizardStep;
      wizardStep.value = previousWizardView;
      selectMainTab(previousTab);
      return;
    }
    pendingMainTab.value = null;
    void checkOcr();
    void loadSteamDirs();
    if (opts?.skipped) {
      toast.info(t('apex.alterQ.setupSkipped'));
    } else {
      toast.success(t('apex.alterQ.setupDone'));
    }
  }
  
  const steamSelectItems = computed(() =>
    steamDirs.value.map((d) => ({
      title: `${d.userName} (${d.userId})${d.exists ? '' : ` · ${t('apex.alterQ.folderMissing')}`}`,
      value: d.userId,
    })),
  );
  
  async function resetOverlayPosition() {
    await resetAndApplyAlterQOverlayGeometry();
    const next = loadAlterQPrefs();
    prefs.overlayX = next.overlayX;
    prefs.overlayY = next.overlayY;
    prefs.overlayW = next.overlayW;
    prefs.overlayH = next.overlayH;
    prefs.overlayPlacement = next.overlayPlacement;
    toast.success(t('apex.alterQ.overlayResetDone'));
  }
  
  async function onOverlayPlaceConfirm(payload: {
    overlayX: number;
    overlayY: number;
    overlayW: number;
    overlayH: number;
    placement: AlterQOverlayPlacement;
  }) {
    prefs.overlayX = payload.overlayX;
    prefs.overlayY = payload.overlayY;
    prefs.overlayW = payload.overlayW;
    prefs.overlayH = payload.overlayH;
    prefs.overlayPlacement = payload.placement;
    if (!(await persistPrefs(true))) return;
    await applyAlterQOverlayGeometry();
    toast.success(t('apex.alterQ.overlayPlaceSaved'));
  }
  
  async function onOverlayOpacityChange() {
    prefs.overlayOpacity = Math.min(
      MAX_OVERLAY_OPACITY,
      Math.max(MIN_OVERLAY_OPACITY, Number(prefs.overlayOpacity) || DEFAULT_OVERLAY_OPACITY),
    );
    if (!(await persist())) return;
    await refreshAlterQOverlayAppearance();
  }
  
  async function onOverlayLockChange(value: boolean | null) {
    const nextLocked = value !== false;
    prefs.overlayLocked = nextLocked;
    if (!(await persist())) return;
    try {
      await setAlterQOverlayInteractionMode(nextLocked ? 'display' : 'adjusting');
    } catch (e) {
      toast.error(String(e));
    }
  }
  
  async function checkOcr() {
    ocrChecking.value = true;
    ocrCheckFailed.value = false;
    try {
      const st = await alterQOcrStatus();
      ocrStatus.value = st;
      ocrOk.value = prefs.ocrEngine === 'auto'
        ? st.rapidReady || st.winReady
        : prefs.ocrEngine === 'rapid'
          ? st.rapidReady
          : st.winReady;
    } catch {
      ocrOk.value = false;
      ocrStatus.value = null;
      ocrCheckFailed.value = true;
    } finally {
      ocrChecking.value = false;
    }
  }
  
  async function onOcrEngineChange(engine: AlterQOcrEngine) {
    prefs.ocrEngine = engine;
    if (!(await persist())) return;
    await checkOcr();
  }
  
  async function downloadOcr() {
    ocrDownloading.value = true;
    resetDownloadProgress();
    try {
      await alterQOcrDownload();
      toast.success(t('apex.alterQ.ocrDownloadDone'));
      await checkOcr();
    } catch (e) {
      toast.error(String(e));
    } finally {
      ocrDownloading.value = false;
    }
  }
  
  function deleteOcrPack() {
    deleteConfirmOpen.value = true;
  }
  
  async function confirmDeleteOcr() {
    if (deletingOcr.value) return;
    deletingOcr.value = true;
    try {
      await alterQOcrDelete();
      toast.success(t('apex.alterQ.ocrDeleteDone'));
      deleteConfirmOpen.value = false;
      await checkOcr();
    } catch (e) {
      toast.error(String(e));
    } finally {
      deletingOcr.value = false;
    }
  }
  
  async function openOcrSettings() {
    try {
      await alterQOpenOcrSettings();
    } catch (e) {
      toast.error(String(e));
    }
  }
  
  async function loadSteamDirs(options: {reconcileMode?: boolean; selectDefault?: boolean} = {}) {
    const reconcileMode = options.reconcileMode !== false;
    try {
      steamDirs.value = await alterQListSteamScreenshotDirs();
      const currentFolder = prefs.screenshotFolder.trim();
      const matched = currentFolder
        ? steamDirs.value.find((d) => folderKey(d.path) === folderKey(currentFolder))
        : undefined;
      if (matched) {
        selectedSteamUserId.value = matched.userId;
        if (reconcileMode) folderMode.value = 'steam';
        return;
      }
      if (selectedSteamUserId.value && !steamDirs.value.some((d) => d.userId === selectedSteamUserId.value)) {
        selectedSteamUserId.value = null;
      }
      if (!selectedSteamUserId.value && steamDirs.value.length) {
        selectedSteamUserId.value = steamDirs.value[0]!.userId;
      }
      if (!currentFolder && steamDirs.value[0] && options.selectDefault) {
        folderMode.value = 'steam';
        await applySteamUser(selectedSteamUserId.value);
      } else if (reconcileMode) {
        folderMode.value = 'manual';
      }
    } catch (e) {
      console.warn('list steam screenshot dirs failed', e);
      steamDirs.value = [];
      if (reconcileMode) folderMode.value = 'manual';
    }
  }
  
  async function onFolderModeChange(mode: 'steam' | 'manual' | null) {
    if (mode === 'manual') {
      folderMode.value = 'manual';
      return;
    }
    if (mode !== 'steam') return;
    folderMode.value = 'steam';
    if (!steamDirs.value.length) await loadSteamDirs({reconcileMode: false});
    if (folderMode.value !== 'steam') return;
    const userId = selectedSteamUserId.value ?? steamDirs.value[0]?.userId ?? null;
    if (userId) {
      await applySteamUser(userId);
    } else {
      folderMode.value = 'manual';
    }
  }
  
  async function applySteamUser(userId: string | null) {
    if (!userId) return;
    selectedSteamUserId.value = userId;
    const hit = steamDirs.value.find((d) => d.userId === userId);
    if (!hit) return;
    prefs.screenshotFolder = await normalizeAlterQFolder(hit.path);
    folderMode.value = 'steam';
    await persist();
  }
  
  async function onFolderPathBlur() {
    if (!prefs.screenshotFolder.trim()) {
      folderMode.value = 'manual';
      await persist();
      return;
    }
    prefs.screenshotFolder = await normalizeAlterQFolder(prefs.screenshotFolder);
    await persist();
  }
  
  async function pickFolder() {
    const selected = await open({directory: true, multiple: false});
    if (typeof selected === 'string' && selected) {
      prefs.screenshotFolder = await normalizeAlterQFolder(selected);
      folderMode.value = 'manual';
      await persist();
    }
  }
  
  async function nextStep() {
    if (!canNext.value) return;
    if (wizardStep.value < 6) {
      wizardStep.value += 1;
      prefs.wizardStep = wizardStep.value;
      if (wizardStep.value === 6 && !prefs.setupDone) prefs.enabled = true;
      await persist();
      if (wizardStep.value === 1) await checkOcr();
      if (wizardStep.value === 3) await loadSteamDirs({selectDefault: !prefs.setupDone});
    } else {
      await enterMainUi();
    }
  }
  
  async function prevStep() {
    if (wizardStep.value > 0) {
      wizardStep.value -= 1;
      prefs.wizardStep = wizardStep.value;
      await persist();
    }
  }
  
  async function restartWizard() {
    // This is a non-destructive guide view. Merely opening it must not
    // unregister a working global hotkey.
    wizardStep.value = 0;
  }
  
  function formatAlterQError(error: string): string {
    if (error.includes('OCR_UNAVAILABLE')) return t('apex.alterQ.ocrUnavailable');
    if (error === 'NO_FOLDER') return t('apex.alterQ.needFolder');
    if (error === 'SCREENSHOT_STALE') return t('apex.alterQ.screenshotStale');
    if (error === 'PARSE_FAILED_PING' || error.includes('ping distance')) {
      return t('apex.alterQ.parseFailedPing');
    }
    if (error === 'PARSE_FAILED_ANG' || error.includes('ang pitch')) {
      return t('apex.alterQ.parseFailedAng');
    }
    if (error === 'PARSE_FAILED_BOTH' || error.includes('distance or ang')) {
      return t('apex.alterQ.parseFailedBoth');
    }
    return error;
  }
  
  function formatOcrReadingMeta(engine: string, confidence: number | null): string {
    const engineLabel = engine === 'rapid'
      ? 'PP-OCRv5'
      : engine === 'win'
        ? 'Windows OCR'
        : engine || '—';
    if (confidence == null) {
      return t('apex.alterQ.ocrResultEngineOnly', {engine: engineLabel});
    }
    return t('apex.alterQ.ocrResultMeta', {
      engine: engineLabel,
      confidence: Math.round(confidence * 100),
    });
  }
  
  function applyCaptureResult(
    r: AlterQCaptureResult,
    options: {showOverlay?: boolean; generation?: number} = {},
  ) {
    if (options.generation != null) {
      if (options.generation !== captureGeneration) return false;
    } else {
      // A result arriving from the global shortcut is a newer operation than
      // any local manual OCR request still waiting on IPC.
      captureGeneration += 1;
      busy.value = false;
      captureBusy.value = false;
    }
    captureError.value = false;
    lastResult.value = r;
    // A partial recognition is one sample, not permission to reuse the missing
    // field from an older screenshot or a previous manual calculation.
    manualR.value = r.distanceM;
    manualAlpha.value = r.alpha;
    theta.value = r.theta;
    thetaInput.value = r.theta && r.distanceM != null && r.alpha != null
      ? {r: r.distanceM, alpha: r.alpha}
      : null;
    if (r.error || !r.theta) {
      selectMainTab('ocr');
    }
    if (r.theta && options.showOverlay !== false) {
      void showAlterQResultOverlay(r.theta, {
        r: r.distanceM ?? r.theta.r,
        alpha: r.alpha ?? r.theta.alpha,
      });
    }
    if (r.error) {
      toast.error(formatAlterQError(r.error));
    } else if (r.theta) {
      toast.success(t('apex.alterQ.captureOk'));
    }
    return true;
  }
  
  async function captureNow() {
    if (busy.value) return;
    const generation = ++captureGeneration;
    busy.value = true;
    captureBusy.value = true;
    captureError.value = false;
    try {
      const r = await runAlterQCapture({...prefs});
      applyCaptureResult(r, {generation});
    } catch (e) {
      if (generation !== captureGeneration) return;
      captureError.value = true;
      selectMainTab('ocr');
      toast.error(String(e));
    } finally {
      if (generation === captureGeneration) {
        captureBusy.value = false;
        busy.value = false;
      }
    }
  }
  
  async function captureFromPath(path: string) {
    if (busy.value) return;
    const generation = ++captureGeneration;
    busy.value = true;
    captureBusy.value = true;
    captureError.value = false;
    try {
      const parsed = await alterQTestOcr({
        path,
        showposRoi: prefs.showposRoi,
        pingRoi: prefs.pingRoi,
        engine: prefs.ocrEngine ?? 'auto',
      });
      let error: string | null = null;
      let thetaResult: AlterQThetaResult | null = null;
      if (parsed.distanceM != null && parsed.alpha != null) {
        thetaResult = await alterQComputeTheta({r: parsed.distanceM, alpha: parsed.alpha});
      } else if (parsed.distanceM == null && parsed.alpha == null) {
        error = 'PARSE_FAILED_BOTH';
      } else if (parsed.distanceM == null) {
        error = 'PARSE_FAILED_PING';
      } else {
        error = 'PARSE_FAILED_ANG';
      }
      applyCaptureResult({
        screenshotPath: path,
        alpha: parsed.alpha,
        angYaw: parsed.angYaw,
        angRoll: parsed.angRoll,
        distanceM: parsed.distanceM,
        showposText: parsed.showposText,
        pingText: parsed.pingText,
        showposPreview: parsed.showposPreview,
        pingPreview: parsed.pingPreview,
        showposEngine: parsed.showposEngine,
        pingEngine: parsed.pingEngine,
        showposConfidence: parsed.showposConfidence,
        pingConfidence: parsed.pingConfidence,
        theta: thetaResult,
        error,
      }, {generation});
    } catch (e) {
      if (generation !== captureGeneration) return;
      captureError.value = true;
      selectMainTab('ocr');
      toast.error(String(e));
    } finally {
      if (generation === captureGeneration) {
        captureBusy.value = false;
        busy.value = false;
      }
    }
  }
  
  async function pickScreenshotAndOcr() {
    if (busy.value) return;
    const generationAtOpen = captureGeneration;
    try {
      const selected = await open({
        multiple: false,
        defaultPath: prefs.screenshotFolder || undefined,
        filters: [{name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'bmp', 'webp']}],
      });
      if (typeof selected === 'string' && selected) {
        await captureFromPath(selected);
      }
    } catch (e) {
      if (generationAtOpen !== captureGeneration) return;
      captureError.value = true;
      selectMainTab('ocr');
      toast.error(String(e));
    }
  }
  
  async function recompute() {
    const distance = Number(manualR.value);
    const alpha = Number(manualAlpha.value);
    if (!Number.isFinite(distance) || distance <= 0 || !Number.isFinite(alpha)) {
      toast.warning(t('apex.alterQ.overlayNeedParams'));
      return;
    }
    if (busy.value) return;
    const generation = ++captureGeneration;
    busy.value = true;
    try {
      const result = await alterQComputeTheta({r: distance, alpha});
      if (
        generation !== captureGeneration
        || Number(manualR.value) !== distance
        || Number(manualAlpha.value) !== alpha
      ) return;
      theta.value = result;
      thetaInput.value = {r: distance, alpha};
      if (result) {
        void showAlterQResultOverlay(result, {
          r: distance,
          alpha,
        });
      }
    } catch (e) {
      if (generation !== captureGeneration) return;
      toast.error(String(e));
    } finally {
      if (generation === captureGeneration) busy.value = false;
    }
  }
  
  function resetRois() {
    prefs.showposRoi = {...DEFAULT_SHOWPOS_ROI};
    prefs.pingRoi = {...DEFAULT_PING_ROI};
    void persist();
  }
  
  async function onCalibrateConfirm(payload: {showposRoi: AlterQRoi; pingRoi: AlterQRoi}) {
    prefs.showposRoi = {...payload.showposRoi};
    prefs.pingRoi = {...payload.pingRoi};
    if (!(await persist())) return;
    toast.success(t('apex.alterQ.calibrateSaved'));
  }
  
  async function onEnabledChange(value: boolean | null) {
    if (value == null || value === prefs.enabled) return;
    prefs.enabled = value;
    await persist();
  }
  
  watch(
    [manualR, manualAlpha],
    ([distance, alpha]) => {
      const source = thetaInput.value;
      if (!source || Number(distance) !== source.r || Number(alpha) !== source.alpha) {
        theta.value = null;
        thetaInput.value = null;
      }
    },
  );
  
  watch(
    () => prefs.hotkey,
    () => {
      if (syncingExternalPrefs) return;
      void persist();
    },
  );
  
  onMounted(async () => {
    // The main WebView owns the global shortcut and displays the overlay. A
    // secondary workbench only consumes the result so it cannot create a second
    // overlay window when the cross-WebView event arrives.
    setAlterQResultHandler((result) => applyCaptureResult(result, {showOverlay: false}));
    unlistenNavigate = await listen<{target?: unknown}>(ALTER_Q_WINDOW_NAVIGATE_EVENT, (e) => {
      const target = parseMainTab(e.payload?.target);
      if (target) requestMainTab(target);
    });
    unlistenPrefs = await listen<{source?: unknown}>(ALTER_Q_PREFS_CHANGED_EVENT, (e) => {
      if (e.payload?.source === currentWindowLabel) return;
      syncingExternalPrefs = true;
      const latest = loadAlterQPrefs();
      adoptPersistedAlterQPrefs(latest);
      void nextTick(() => {
        syncingExternalPrefs = false;
      });
    });
    window.addEventListener('storage', onWindowStorage);
    consumeStoredMainTab();
    unlistenDownload = await listen<{
      fileName: string;
      percent: number;
      mirrorLabel: string;
    }>('alter-q-ocr-download-progress', (e) => {
      setDownloadProgress(e.payload);
    });
    unlistenOverlayInteraction = await listen<{mode?: unknown}>(
      ALTER_Q_OVERLAY_INTERACTION_EVENT,
      (e) => {
        const mode = e.payload?.mode;
        if (mode === 'display' || mode === 'adjusting') {
          prefs.overlayLocked = (mode as AlterQOverlayInteractionMode) === 'display';
          patchPersistedPrefsBaseline({overlayLocked: prefs.overlayLocked});
        }
      },
    );
    unlistenOverlayGeometry = await listen<AlterQOverlayGeometry>(
      ALTER_Q_OVERLAY_GEOMETRY_EVENT,
      (e) => {
        if (e.payload) {
          Object.assign(prefs, e.payload);
          patchPersistedPrefsBaseline(e.payload);
        }
      },
    );
    if (prefs.screenshotFolder) {
      prefs.screenshotFolder = await normalizeAlterQFolder(prefs.screenshotFolder);
    }
    if (wizardStep.value === 1 || (!prefs.setupDone && prefs.wizardStep === 1) || prefs.setupDone) {
      await checkOcr();
    }
    if (wizardStep.value === 3 || prefs.setupDone) {
      await loadSteamDirs({selectDefault: wizardStep.value === 3 && !prefs.setupDone});
    }
  });
  
  onUnmounted(() => {
    flushScheduledPrefsPersist();
    setAlterQResultHandler(null);
    window.removeEventListener('storage', onWindowStorage);
    unlistenNavigate?.();
    unlistenNavigate = null;
    unlistenPrefs?.();
    unlistenPrefs = null;
    if (unlistenDownload) {
      unlistenDownload();
      unlistenDownload = null;
    }
    unlistenOverlayInteraction?.();
    unlistenOverlayInteraction = null;
    unlistenOverlayGeometry?.();
    unlistenOverlayGeometry = null;
  });

  return {
    AUTHOR_GITHUB,
    AUTHOR_HOME,
    AUTHOR_VIDEO,
    MAX_OVERLAY_OPACITY,
    MIN_OVERLAY_OPACITY,
    activeMainTab,
    applySteamUser,
    busy,
    calibrateOpen,
    canNext,
    captureBusy,
    captureError,
    captureNow,
    checkOcr,
    confirmDeleteOcr,
    deleteConfirmOpen,
    deleteOcrPack,
    deletingOcr,
    downloadOcr,
    enterMainUi,
    flushScheduledPrefsPersist,
    folderMode,
    formatAlterQError,
    formatOcrReadingMeta,
    hotkeyOperational,
    hotkeyStatusHint,
    lastResult,
    loadSteamDirs,
    mainTab,
    mainTabs,
    manualAlpha,
    manualInputsValid,
    manualR,
    nextStep,
    ocrCheckFailed,
    ocrChecking,
    ocrDownloadFile,
    ocrDownloadMirror,
    ocrDownloadPercent,
    ocrDownloading,
    ocrStatus,
    onCalibrateConfirm,
    onEnabledChange,
    onFolderModeChange,
    onFolderPathBlur,
    onMainTabKeydown,
    onOcrEngineChange,
    onOverlayLockChange,
    onOverlayOpacityChange,
    onOverlayPlaceConfirm,
    open,
    openOcrSettings,
    openUrl,
    overlayPlaceOpen,
    overlayPreviewMeta,
    overlayPreviewStyle,
    pageScroll,
    persist,
    pickFolder,
    pickScreenshotAndOcr,
    prefs,
    prevStep,
    recompute,
    ref,
    resetOverlayPosition,
    resetRois,
    restartWizard,
    schedulePrefsPersist,
    selectMainTab,
    selectedSteamUserId,
    settingsStore,
    steamSelectItems,
    t,
    theta,
    wizardStep,
    wizardSteps,
  };
}

export type AlterQDialogController = ReturnType<typeof useAlterQDialogController>;
