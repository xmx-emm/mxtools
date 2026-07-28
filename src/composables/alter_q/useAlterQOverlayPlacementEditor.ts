import {computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch} from 'vue';
import {useI18n} from 'vue-i18n';
import {open} from '@tauri-apps/plugin-dialog';
import {useToast} from 'vue-toastification';
import {
  alterQLatestScreenshot,
  alterQListRecentScreenshots,
  alterQScreenshotPreview,
} from '@/ipc/commands.ts';
import {availableMonitors, currentMonitor, type Monitor} from '@tauri-apps/api/window';
import type {AlterQOverlayPlacement, AlterQRoi} from '@/types/alter_q.ts';
import {
  defaultAlterQOverlayPlacement,
  DEFAULT_OVERLAY_HEIGHT,
  DEFAULT_OVERLAY_WIDTH,
  MIN_OVERLAY_HEIGHT,
  MIN_OVERLAY_WIDTH,
  loadAlterQPrefs,
} from '@/types/alter_q.ts';
import {normalizeAlterQFolder, selectAlterQOverlayMonitor} from '@/utils/alter_q.ts';
import {useAlterQScreenshotPicker} from './useAlterQScreenshotPicker.ts';
import {
  clampAlterQRoi,
  transformAlterQRoi,
  zoomPanForAnchor,
  type AlterQRoiHandle,
} from '@/utils/alter_q_roi.ts';

export type AlterQOverlayPlacementEditorProps = {
  modelValue: boolean;
  folder: string;
  overlayX: number | null;
  overlayY: number | null;
  overlayW: number;
  overlayH: number;
  /** v2 relative placement; legacy geometry remains accepted for old callers. */
  placement?: AlterQOverlayPlacement | null;
};
export type AlterQOverlayPlacementEditorEmits = {
  'update:modelValue': [value: boolean];
  confirm: [payload: {
    overlayX: number;
    overlayY: number;
    overlayW: number;
    overlayH: number;
    placement: AlterQOverlayPlacement;
  }];
};
type Emit = <K extends keyof AlterQOverlayPlacementEditorEmits>(event: K, ...args: AlterQOverlayPlacementEditorEmits[K]) => void;

export function useAlterQOverlayPlacementEditor(props: Readonly<AlterQOverlayPlacementEditorProps>, emit: Emit) {
  type Handle = AlterQRoiHandle;
  
  const DEFAULT_ZOOM = 1;
  const MIN_ZOOM = 1;
  const MAX_ZOOM = 4;
  const THUMB_MAX_EDGE = 200;
  const RECT_MIN_W = 0.04;
  const RECT_MIN_H = 0.04;
  const MAX_OVERLAY_WIDTH = 640;
  const MAX_OVERLAY_HEIGHT = 480;
  
  const {t} = useI18n();
  const toast = useToast();
  
  const openDialog = computed({
    get: () => props.modelValue,
    set: (v: boolean) => emit('update:modelValue', v),
  });
  
  const draft = reactive<AlterQRoi>({x: 0.7, y: 0.75, w: 0.12, h: 0.1});
  const screenW = ref(1920);
  const screenH = ref(1080);
  const previewWidth = ref(0);
  const previewHeight = ref(0);
  const monitors = ref<Monitor[]>([]);
  const selectedMonitorIndex = ref(0);
  const imagePath = ref('');
  const previewSrc = ref('');
  const recentPaths = ref<string[]>([]);
  const recentThumbs = ref<{path: string; title: string; src: string}[]>([]);
  const loading = ref(false);
  const monitorLoading = ref(false);
  const stageRef = ref<HTMLElement | null>(null);
  const imgRef = ref<HTMLImageElement | null>(null);
  const imgBox = reactive({left: 0, top: 0, width: 0, height: 0});
  const zoom = ref(DEFAULT_ZOOM);
  const panX = ref(0);
  const panY = ref(0);
  const zoomPercent = computed(() => Math.round(zoom.value * 100));
  const previewAspectMismatch = computed(() => {
    const sourceRatio = previewWidth.value / previewHeight.value;
    const targetRatio = screenW.value / screenH.value;
    if (!Number.isFinite(sourceRatio) || !Number.isFinite(targetRatio) || sourceRatio <= 0 || targetRatio <= 0) {
      return false;
    }
    return Math.abs(Math.log(sourceRatio / targetRatio)) > 0.035;
  });
  const aspectMismatchText = computed(() => t('apex.alterQ.overlayAspectMismatch', {
    source: `${previewWidth.value} x ${previewHeight.value}`,
    target: `${screenW.value} x ${screenH.value}`,
  }));
  const selectedMonitor = computed(() => monitors.value[selectedMonitorIndex.value] ?? null);
  const monitorItems = computed(() => monitors.value.map((monitor, index) => ({
    title: `${index + 1}. ${monitor.name || t('apex.alterQ.overlayMonitorFallback', {index: index + 1})} - ${Math.round(monitor.size.width)} x ${Math.round(monitor.size.height)} @ ${Math.round(monitor.position.x)}, ${Math.round(monitor.position.y)}`,
    value: index,
    subtitle: `${Math.round(monitor.size.width)} x ${Math.round(monitor.size.height)} · ${Math.round(monitor.position.x)}, ${Math.round(monitor.position.y)} · ${monitor.scaleFactor.toFixed(2)}x`,
  })));
  const selectedMonitorText = computed(() => {
    const monitor = selectedMonitor.value;
    if (!monitor) return `${screenW.value} x ${screenH.value}`;
    return `${monitor.name || t('apex.alterQ.overlayMonitor')} · ${Math.round(monitor.size.width)} x ${Math.round(monitor.size.height)}`;
  });
  const selectedMonitorDisplayText = computed(() =>
    monitorItems.value[selectedMonitorIndex.value]?.title ?? selectedMonitorText.value,
  );
  
  const screenshotPicker = useAlterQScreenshotPicker();
  let monitorGen = 0;
  let dialogGen = 0;
  let monitorRefreshTimer: ReturnType<typeof setInterval> | null = null;
  let silentMonitorRefreshInFlight = false;
  
  function monitorIdentity(monitor: Monitor | null) {
    if (!monitor) return '';
    return [
      monitor.name ?? '',
      monitor.position.x,
      monitor.position.y,
      monitor.size.width,
      monitor.size.height,
      monitor.scaleFactor,
    ].join(':');
  }
  
  function findSameMonitor(candidates: Monitor[], target: Monitor | null) {
    if (!target) return null;
    const exactIdentity = monitorIdentity(target);
    const exact = candidates.find((monitor) => monitorIdentity(monitor) === exactIdentity);
    if (exact) return exact;
    const samePosition = candidates.find((monitor) => (
      monitor.position.x === target.position.x
      && monitor.position.y === target.position.y
    ));
    if (samePosition) return samePosition;
    if (!target.name) return null;
    const sameName = candidates.filter((monitor) => monitor.name === target.name);
    return sameName.length === 1 ? sameName[0]! : null;
  }
  
  let drag: {
    handle: Handle;
    startX: number;
    startY: number;
    origin: AlterQRoi;
  } | null = null;
  
  let panDrag: {
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null = null;
  
  function clampRoi(r: AlterQRoi, sw = screenW.value, sh = screenH.value): AlterQRoi {
    const scale = selectedMonitor.value?.scaleFactor || 1;
    const maxW = Math.min(1, MAX_OVERLAY_WIDTH * scale / Math.max(1, sw));
    const maxH = Math.min(1, MAX_OVERLAY_HEIGHT * scale / Math.max(1, sh));
    const minW = Math.min(maxW, Math.max(RECT_MIN_W, MIN_OVERLAY_WIDTH * scale / Math.max(1, sw)));
    const minH = Math.min(maxH, Math.max(RECT_MIN_H, MIN_OVERLAY_HEIGHT * scale / Math.max(1, sh)));
    return clampAlterQRoi(r, {minW, minH, maxW, maxH});
  }
  
  function assignRoi(next: AlterQRoi) {
    const c = clampRoi(next);
    draft.x = c.x;
    draft.y = c.y;
    draft.w = c.w;
    draft.h = c.h;
  }
  
  function geometryToRoi(
    x: number | null,
    y: number | null,
    w: number,
    h: number,
    sw: number,
    sh: number,
  ): AlterQRoi {
    const ww = Math.max(MIN_OVERLAY_WIDTH, w || DEFAULT_OVERLAY_WIDTH);
    const hh = Math.max(MIN_OVERLAY_HEIGHT, h || DEFAULT_OVERLAY_HEIGHT);
    const monitor = selectedMonitor.value;
    const scale = monitor?.scaleFactor || 1;
    const origin = monitor?.position.toLogical(scale) ?? {x: 0, y: 0};
    const physicalW = ww * scale;
    const physicalH = hh * scale;
    // Legacy values were persisted as logical virtual-desktop coordinates. Convert
    // them to the selected monitor's local physical space before normalizing.
    const sx = x != null
      ? (x - origin.x) * scale
      : Math.max(0, sw - physicalW - 40 * scale);
    const sy = y != null
      ? (y - origin.y) * scale
      : Math.max(0, sh - physicalH - 80 * scale);
    return clampRoi({
      x: sx / sw,
      y: sy / sh,
      w: physicalW / sw,
      h: physicalH / sh,
    }, sw, sh);
  }
  
  function roiToGeometry(r: AlterQRoi, sw: number, sh: number) {
    const monitor = selectedMonitor.value;
    const scale = monitor?.scaleFactor || 1;
    const origin = monitor?.position.toLogical(scale) ?? {x: 0, y: 0};
    const minPhysicalW = MIN_OVERLAY_WIDTH * scale;
    const minPhysicalH = MIN_OVERLAY_HEIGHT * scale;
    const overlayW = Math.min(sw, Math.max(minPhysicalW, Math.round(r.w * sw)));
    const overlayH = Math.min(sh, Math.max(minPhysicalH, Math.round(r.h * sh)));
    const localX = Math.round(Math.min(sw - overlayW, Math.max(0, r.x * sw)));
    const localY = Math.round(Math.min(sh - overlayH, Math.max(0, r.y * sh)));
    const overlayX = Math.round(origin.x + localX / scale);
    const overlayY = Math.round(origin.y + localY / scale);
    const placement: AlterQOverlayPlacement = {
      version: 2,
      monitorName: monitor?.name ?? null,
      monitorWidth: sw,
      monitorHeight: sh,
      rect: clampRoi({
        x: localX / sw,
        y: localY / sh,
        w: overlayW / sw,
        h: overlayH / sh,
      }, sw, sh),
    };
    return {
      overlayX,
      overlayY,
      overlayW: Math.max(MIN_OVERLAY_WIDTH, Math.round(overlayW / scale)),
      overlayH: Math.max(MIN_OVERLAY_HEIGHT, Math.round(overlayH / scale)),
      placement,
    };
  }
  
  function syncFromProps() {
    if (props.placement?.version === 2 && props.placement.rect) {
      assignRoi(props.placement.rect);
      return;
    }
    assignRoi(geometryToRoi(
      props.overlayX,
      props.overlayY,
      props.overlayW,
      props.overlayH,
      screenW.value,
      screenH.value,
    ));
  }
  
  function computeFitScale(): number {
    const stage = stageRef.value;
    const img = imgRef.value;
    if (!stage || !img || !img.naturalWidth || screenW.value <= 0 || screenH.value <= 0) return 1;
    // Placement is stored relative to the target monitor, so use that monitor's
    // aspect ratio even when the reference screenshot came from another screen.
    return Math.min(stage.clientWidth / screenW.value, stage.clientHeight / screenH.value);
  }
  
  function clampPan() {
    const stage = stageRef.value;
    if (!stage || imgBox.width <= 0) return;
    const sw = stage.clientWidth;
    const sh = stage.clientHeight;
    if (imgBox.width <= sw) {
      panX.value = (sw - imgBox.width) / 2;
    } else {
      panX.value = Math.min(0, Math.max(sw - imgBox.width, panX.value));
    }
    if (imgBox.height <= sh) {
      panY.value = (sh - imgBox.height) / 2;
    } else {
      panY.value = Math.min(0, Math.max(sh - imgBox.height, panY.value));
    }
  }
  
  function applyPanToBox() {
    clampPan();
    imgBox.left = panX.value;
    imgBox.top = panY.value;
  }
  
  function updateImgBox(keepPan = false) {
    const stage = stageRef.value;
    const img = imgRef.value;
    if (!stage || !img || !img.naturalWidth) return;
    const fit = computeFitScale();
    const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom.value));
    zoom.value = z;
    imgBox.width = screenW.value * fit * z;
    imgBox.height = screenH.value * fit * z;
    if (!keepPan) {
      panX.value = (stage.clientWidth - imgBox.width) / 2;
      panY.value = (stage.clientHeight - imgBox.height) / 2;
    }
    applyPanToBox();
  }
  
  function setZoom(next: number, clientX?: number, clientY?: number) {
    const stage = stageRef.value;
    if (!stage) {
      zoom.value = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
      updateImgBox(true);
      return;
    }
    const rect = stage.getBoundingClientRect();
    const cx = clientX != null ? clientX - rect.left : stage.clientWidth / 2;
    const cy = clientY != null ? clientY - rect.top : stage.clientHeight / 2;
    const oldBox = {...imgBox};
    zoom.value = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
    updateImgBox(true);
    const pan = zoomPanForAnchor(
      {x: cx, y: cy},
      oldBox,
      {width: imgBox.width, height: imgBox.height},
    );
    panX.value = pan.x;
    panY.value = pan.y;
    applyPanToBox();
  }
  
  function bumpZoom(delta: number) {
    setZoom(zoom.value + delta);
  }
  
  function focusOnRect() {
    const stage = stageRef.value;
    if (!stage || imgBox.width <= 0) return;
    const cx = imgBox.left + (draft.x + draft.w / 2) * imgBox.width;
    const cy = imgBox.top + (draft.y + draft.h / 2) * imgBox.height;
    panX.value += stage.clientWidth / 2 - cx;
    panY.value += stage.clientHeight / 2 - cy;
    applyPanToBox();
  }
  
  function applySelectedMonitorSize() {
    const monitor = selectedMonitor.value;
    if (monitor && monitor.size.width > 0 && monitor.size.height > 0) {
      screenW.value = monitor.size.width;
      screenH.value = monitor.size.height;
      return;
    }
    const img = imgRef.value;
    if (img?.naturalWidth) {
      screenW.value = img.naturalWidth;
      screenH.value = img.naturalHeight;
    }
  }
  
  function placementPrefs() {
    return {
      ...loadAlterQPrefs(),
      overlayX: props.overlayX,
      overlayY: props.overlayY,
      overlayW: props.overlayW,
      overlayH: props.overlayH,
      overlayPlacement: props.placement ?? null,
    };
  }
  
  async function loadDisplaySize(options: {silent?: boolean; preserveSelection?: boolean} = {}) {
    const gen = ++monitorGen;
    const previousMonitor = selectedMonitor.value;
    const previousIdentity = monitorIdentity(previousMonitor);
    const previousWidth = screenW.value;
    const previousHeight = screenH.value;
    if (!options.silent) monitorLoading.value = true;
    try {
      const [found, current] = await Promise.all([
        availableMonitors().catch(() => [] as Monitor[]),
        currentMonitor().catch(() => null),
      ]);
      if (gen !== monitorGen) return;
      monitors.value = found.filter((monitor) => monitor.size.width > 0 && monitor.size.height > 0);
      const fallback = current
        ? monitors.value.find((monitor) => (
          monitor.position.x === current.position.x
          && monitor.position.y === current.position.y
        )) ?? monitors.value.find((monitor) => monitor.name === current.name) ?? null
        : null;
      const preserved = options.preserveSelection === false
        ? null
        : findSameMonitor(monitors.value, previousMonitor);
      const selected = preserved
        ?? selectAlterQOverlayMonitor(monitors.value, placementPrefs(), fallback);
      const index = selected ? monitors.value.indexOf(selected) : -1;
      selectedMonitorIndex.value = index >= 0 ? index : 0;
      applySelectedMonitorSize();
      if (
        props.modelValue
        && previewSrc.value
        && (
          previousIdentity !== monitorIdentity(selectedMonitor.value)
          || previousWidth !== screenW.value
          || previousHeight !== screenH.value
        )
      ) {
        syncFromProps();
        await nextTick();
        updateImgBox(false);
        focusOnRect();
      }
    } catch {
      applySelectedMonitorSize();
    } finally {
      if (gen === monitorGen && !options.silent) monitorLoading.value = false;
    }
  }
  
  async function refreshMonitorsSilently() {
    if (silentMonitorRefreshInFlight || monitorLoading.value) return;
    silentMonitorRefreshInFlight = true;
    try {
      await loadDisplaySize({silent: true});
    } finally {
      silentMonitorRefreshInFlight = false;
    }
  }
  
  async function loadPreview(path: string) {
    const gen = screenshotPicker.beginPreview();
    const session = dialogGen;
    loading.value = true;
    imagePath.value = '';
    previewSrc.value = '';
    previewWidth.value = 0;
    previewHeight.value = 0;
    try {
      const src = await alterQScreenshotPreview({path, maxEdge: 0});
      if (!screenshotPicker.isPreviewCurrent(gen) || session !== dialogGen || !props.modelValue) return;
      imagePath.value = path;
      previewSrc.value = src;
      await nextTick();
      await loadDisplaySize();
      if (!screenshotPicker.isPreviewCurrent(gen) || session !== dialogGen || !props.modelValue) return;
      syncFromProps();
      zoom.value = DEFAULT_ZOOM;
      updateImgBox(false);
      focusOnRect();
    } catch (e) {
      if (screenshotPicker.isPreviewCurrent(gen)) toast.error(String(e));
    } finally {
      if (screenshotPicker.isPreviewCurrent(gen)) loading.value = false;
    }
  }
  
  async function refreshRecent() {
    const gen = screenshotPicker.beginThumbnails();
    try {
      const folder = props.folder.trim()
        ? await normalizeAlterQFolder(props.folder)
        : '';
      if (!folder) {
        recentPaths.value = [];
        recentThumbs.value = [];
        return;
      }
      const paths = await alterQListRecentScreenshots({folder, limit: 12});
      if (!screenshotPicker.isThumbnailsCurrent(gen)) return;
      recentPaths.value = paths;
      const thumbs = await Promise.all(
        paths.map(async (p) => {
          try {
            const src = await alterQScreenshotPreview({path: p, maxEdge: THUMB_MAX_EDGE});
            return {path: p, title: p.split(/[/\\]/).pop() || p, src};
          } catch {
            return {path: p, title: p, src: ''};
          }
        }),
      );
      if (!screenshotPicker.isThumbnailsCurrent(gen)) return;
      recentThumbs.value = thumbs.filter((t) => t.src);
    } catch {
      if (screenshotPicker.isThumbnailsCurrent(gen)) {
        recentPaths.value = [];
        recentThumbs.value = [];
      }
    }
  }
  
  async function loadLatest() {
    if (!props.folder.trim()) {
      toast.warning(t('apex.alterQ.calibrateNeedFolder'));
      return;
    }
    const session = dialogGen;
    loading.value = true;
    try {
      const folder = await normalizeAlterQFolder(props.folder);
      const latest = await alterQLatestScreenshot({folder});
      if (session !== dialogGen || !props.modelValue) return;
      void refreshRecent();
      await loadPreview(latest);
    } catch (e) {
      if (session === dialogGen && props.modelValue) {
        toast.error(String(e));
        loading.value = false;
      }
    }
  }
  
  async function pickImage() {
    const selected = await open({
      multiple: false,
      defaultPath: props.folder || undefined,
      filters: [{name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'bmp', 'webp']}],
    });
    if (typeof selected === 'string' && selected) {
      await loadPreview(selected);
    }
  }
  
  function onSelectRecent(path: string | null) {
    if (path) void loadPreview(path);
  }
  
  function clientToRel(clientX: number, clientY: number): {x: number; y: number} {
    const stage = stageRef.value;
    if (!stage || imgBox.width <= 0) return {x: 0, y: 0};
    const rect = stage.getBoundingClientRect();
    const px = clientX - rect.left - imgBox.left;
    const py = clientY - rect.top - imgBox.top;
    return {
      x: Math.min(1, Math.max(0, px / imgBox.width)),
      y: Math.min(1, Math.max(0, py / imgBox.height)),
    };
  }
  
  function onPointerDown(e: PointerEvent, handle: Handle) {
    if (!previewSrc.value) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    panDrag = null;
    drag = {
      handle,
      startX: e.clientX,
      startY: e.clientY,
      origin: {...draft},
    };
  }
  
  function onStagePointerDown(e: PointerEvent) {
    if (!previewSrc.value || drag) return;
    if ((e.target as HTMLElement).closest('.place-roi')) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    panDrag = {
      startX: e.clientX,
      startY: e.clientY,
      originX: panX.value,
      originY: panY.value,
    };
  }
  
  function onPointerMove(e: PointerEvent) {
    if (panDrag) {
      panX.value = panDrag.originX + (e.clientX - panDrag.startX);
      panY.value = panDrag.originY + (e.clientY - panDrag.startY);
      applyPanToBox();
      return;
    }
    if (!drag) return;
    const start = clientToRel(drag.startX, drag.startY);
    const cur = clientToRel(e.clientX, e.clientY);
    const dx = cur.x - start.x;
    const dy = cur.y - start.y;
    const next = transformAlterQRoi(drag.origin, drag.handle, dx, dy);
    assignRoi(next);
  }
  
  function onPointerUp() {
    drag = null;
    panDrag = null;
  }
  
  function onWheel(e: WheelEvent) {
    if (!previewSrc.value) return;
    e.preventDefault();
    setZoom(zoom.value + (e.deltaY > 0 ? -0.2 : 0.2), e.clientX, e.clientY);
  }
  
  function resetRect() {
    const monitor = selectedMonitor.value;
    assignRoi(defaultAlterQOverlayPlacement(monitor ? {
      name: monitor.name,
      width: monitor.size.width,
      height: monitor.size.height,
    } : undefined, monitor?.scaleFactor ?? 1).rect);
    focusOnRect();
  }
  
  async function confirm() {
    if (loading.value || monitorLoading.value || !previewSrc.value || previewAspectMismatch.value) return;
    const session = dialogGen;
    await loadDisplaySize();
    if (
      session !== dialogGen
      || !props.modelValue
      || loading.value
      || monitorLoading.value
      || !previewSrc.value
      || previewAspectMismatch.value
    ) return;
    emit('confirm', roiToGeometry(clampRoi({...draft}), screenW.value, screenH.value));
    openDialog.value = false;
  }
  
  function onMonitorChange(index: number) {
    const nextIndex = Number(index);
    if (!Number.isInteger(nextIndex) || nextIndex < 0 || nextIndex >= monitors.value.length) return;
    const previousScale = selectedMonitor.value?.scaleFactor || 1;
    const logicalWidth = draft.w * screenW.value / previousScale;
    const logicalHeight = draft.h * screenH.value / previousScale;
    const relativeX = draft.x;
    const relativeY = draft.y;
    selectedMonitorIndex.value = nextIndex;
    applySelectedMonitorSize();
    const nextScale = selectedMonitor.value?.scaleFactor || 1;
    assignRoi({
      x: relativeX,
      y: relativeY,
      w: logicalWidth * nextScale / screenW.value,
      h: logicalHeight * nextScale / screenH.value,
    });
    nextTick(() => {
      updateImgBox(false);
      focusOnRect();
    });
  }
  
  function onResize() {
    updateImgBox(true);
  }
  
  function onImageLoad() {
    const image = imgRef.value;
    previewWidth.value = image?.naturalWidth ?? 0;
    previewHeight.value = image?.naturalHeight ?? 0;
    if (!selectedMonitor.value && previewWidth.value > 0 && previewHeight.value > 0) {
      screenW.value = previewWidth.value;
      screenH.value = previewHeight.value;
      syncFromProps();
    }
    updateImgBox(false);
    nextTick(() => focusOnRect());
  }
  
  watch(
    () => props.modelValue,
    async (v) => {
      const session = ++dialogGen;
      if (!v) {
        screenshotPicker.invalidateAll();
        monitorGen += 1;
        loading.value = false;
        monitorLoading.value = false;
        if (monitorRefreshTimer != null) {
          clearInterval(monitorRefreshTimer);
          monitorRefreshTimer = null;
        }
        return;
      }
      if (monitorRefreshTimer == null) {
        monitorRefreshTimer = setInterval(() => {
          if (props.modelValue && !loading.value && !drag && !panDrag) {
            void refreshMonitorsSilently();
          }
        }, 1500);
      }
      zoom.value = DEFAULT_ZOOM;
      loading.value = true;
      previewSrc.value = '';
      imagePath.value = '';
      await loadDisplaySize({preserveSelection: false});
      if (session !== dialogGen || !props.modelValue) return;
      syncFromProps();
      try {
        if (props.folder.trim()) {
          await loadLatest();
        } else {
          await refreshRecent();
          if (session === dialogGen && props.modelValue && recentPaths.value[0]) {
            await loadPreview(recentPaths.value[0]!);
          } else {
            loading.value = false;
          }
        }
      } catch {
        if (session === dialogGen) loading.value = false;
      }
    },
  );
  
  watch(
    () => props.placement,
    () => {
      if (!props.modelValue || !monitors.value.length) return;
      const selected = selectAlterQOverlayMonitor(
        monitors.value,
        placementPrefs(),
        selectedMonitor.value,
      );
      const index = selected ? monitors.value.indexOf(selected) : -1;
      if (index >= 0 && index !== selectedMonitorIndex.value) {
        selectedMonitorIndex.value = index;
        applySelectedMonitorSize();
        syncFromProps();
      }
    },
  );
  
  onMounted(() => {
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('resize', onResize);
  });
  
  onBeforeUnmount(() => {
    dialogGen += 1;
    screenshotPicker.invalidateAll();
    monitorGen += 1;
    if (monitorRefreshTimer != null) clearInterval(monitorRefreshTimer);
    monitorRefreshTimer = null;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('resize', onResize);
  });
  
  const roiStyle = computed(() => ({
    left: `${imgBox.left + draft.x * imgBox.width}px`,
    top: `${imgBox.top + draft.y * imgBox.height}px`,
    width: `${draft.w * imgBox.width}px`,
    height: `${draft.h * imgBox.height}px`,
  }));
  
  const imgStyle = computed(() => ({
    left: `${imgBox.left}px`,
    top: `${imgBox.top}px`,
    width: `${imgBox.width}px`,
    height: `${imgBox.height}px`,
    objectFit: 'cover' as const,
  }));

  return {
    aspectMismatchText,
    bumpZoom,
    confirm,
    draft,
    imagePath,
    imgRef,
    imgStyle,
    loadLatest,
    loading,
    monitorItems,
    monitorLoading,
    onImageLoad,
    onMonitorChange,
    onPointerDown,
    onSelectRecent,
    onStagePointerDown,
    onWheel,
    openDialog,
    pickImage,
    previewAspectMismatch,
    previewSrc,
    recentThumbs,
    ref,
    resetRect,
    roiStyle,
    screenH,
    screenW,
    selectedMonitorDisplayText,
    selectedMonitorIndex,
    setZoom,
    stageRef,
    t,
    zoomPercent,
  };
}
