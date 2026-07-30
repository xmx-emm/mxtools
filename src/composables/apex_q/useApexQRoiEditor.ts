import {computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch} from 'vue';
import {useI18n} from 'vue-i18n';
import {open} from '@tauri-apps/plugin-dialog';
import {useToast} from 'vue-toastification';
import {
  apexQLatestScreenshot,
  apexQListRecentScreenshots,
  apexQScreenshotPreview,
  apexQTestOcr,
  type ApexQOcrParseResult,
} from '@/ipc/commands.ts';
import type {ApexQRoi} from '@/types/apex_q.ts';
import {DEFAULT_PING_ROI, DEFAULT_SHOWPOS_ROI, loadApexQPrefs} from '@/types/apex_q.ts';
import {normalizeApexQFolder} from '@/utils/apex_q.ts';
import {useApexQScreenshotPicker} from './useApexQScreenshotPicker.ts';
import {
  clampApexQRoi,
  transformApexQRoi,
  zoomPanForAnchor,
  type ApexQRoiHandle,
} from '@/utils/apex_q_roi.ts';

export type ApexQRoiEditorProps = {
  modelValue: boolean;
  folder: string;
  showposRoi: ApexQRoi;
  pingRoi: ApexQRoi;
};
export type ApexQRoiEditorEmits = {
  'update:modelValue': [value: boolean];
  confirm: [payload: {showposRoi: ApexQRoi; pingRoi: ApexQRoi}];
};
type Emit = <K extends keyof ApexQRoiEditorEmits>(event: K, ...args: ApexQRoiEditorEmits[K]) => void;

export function useApexQRoiEditor(props: Readonly<ApexQRoiEditorProps>, emit: Emit) {
  type RoiKind = 'showpos' | 'ping';
  type Handle = ApexQRoiHandle;

  /** 相对「完整适应」的倍率：左上 400%、中间 300% */
  const SHOWPOS_DEFAULT_ZOOM = 4;
  const PING_DEFAULT_ZOOM = 3;
  const MIN_ZOOM = 1;
  const MAX_ZOOM = 6;
  /** 选图缩略图边长（缩小+降质，加快列表预览） */
  const THUMB_MAX_EDGE = 200;

  const {t} = useI18n();
  const toast = useToast();

  const openDialog = computed({
    get: () => props.modelValue,
    set: (v: boolean) => emit('update:modelValue', v),
  });

  const kind = ref<RoiKind>('showpos');
  const draftShowpos = reactive<ApexQRoi>({...DEFAULT_SHOWPOS_ROI});
  const draftPing = reactive<ApexQRoi>({...DEFAULT_PING_ROI});
  const imagePath = ref('');
  const previewSrc = ref('');
  const recentPaths = ref<string[]>([]);
  const recentThumbs = ref<{path: string; title: string; src: string}[]>([]);
  const loading = ref(false);
  const verifying = ref(false);
  const verifyResult = ref<ApexQOcrParseResult | null>(null);
  const verifyKind = ref<RoiKind | null>(null);
  const verifyStale = ref(true);
  const verifiedKinds = reactive<Record<RoiKind, boolean>>({showpos: false, ping: false});
  const stageRef = ref<HTMLElement | null>(null);
  const imgRef = ref<HTMLImageElement | null>(null);
  const imgBox = reactive({left: 0, top: 0, width: 0, height: 0});
  const zoom = ref(SHOWPOS_DEFAULT_ZOOM);
  const panX = ref(0);
  const panY = ref(0);

  const screenshotPicker = useApexQScreenshotPicker();
  let verifyGen = 0;

  function defaultZoomForKind(k: RoiKind = kind.value) {
    return k === 'showpos' ? SHOWPOS_DEFAULT_ZOOM : PING_DEFAULT_ZOOM;
  }

  const activeRoi = computed(() => (kind.value === 'showpos' ? draftShowpos : draftPing));
  const zoomPercent = computed(() => Math.round(zoom.value * 100));

  /** 选区放大预览：与裁剪框同比例；默认右下，可拖动 */
  const LOUPE_LONG_SIDE = 260;
  const loupePos = reactive<{left: number | null; top: number | null}>({left: null, top: null});

  function loupeViewSize(): {width: number; height: number} {
    const r = activeRoi.value;
    const aspect = Math.max(r.w, 1e-4) / Math.max(r.h, 1e-4);
    if (aspect >= 1) {
      const width = LOUPE_LONG_SIDE;
      return {width, height: Math.max(24, width / aspect)};
    }
    const height = Math.min(LOUPE_LONG_SIDE, 180);
    return {width: Math.max(40, height * aspect), height};
  }

  const loupeShellStyle = computed(() => {
    const {width} = loupeViewSize();
    const style: Record<string, string> = {width: `${width}px`};
    if (loupePos.left != null && loupePos.top != null) {
      style.left = `${loupePos.left}px`;
      style.top = `${loupePos.top}px`;
      style.right = 'auto';
      style.bottom = 'auto';
    } else {
      style.right = '10px';
      style.bottom = '10px';
      style.left = 'auto';
      style.top = 'auto';
    }
    return style;
  });

  const loupeViewStyle = computed(() => {
    const {width, height} = loupeViewSize();
    return {width: `${width}px`, height: `${height}px`};
  });

  /** 选区放大镜：把当前蓝框内容铺满预览窗 */
  const loupeImgStyle = computed(() => {
    const r = activeRoi.value;
    const w = Math.max(r.w, 1e-4);
    const h = Math.max(r.h, 1e-4);
    return {
      width: `${100 / w}%`,
      height: `${100 / h}%`,
      transform: `translate(${-r.x * 100}%, ${-r.y * 100}%)`,
    };
  });

  const loupeDragging = ref(false);
  let loupeDrag: {
    startX: number;
    startY: number;
    originLeft: number;
    originTop: number;
  } | null = null;
  /** 当前校准项的最近一次尝试识别是否仍有效且读出了目标值。 */
  const verifyFresh = computed(
    () => !verifyStale.value && verifyResult.value != null && verifyKind.value === kind.value,
  );
  const verifyPassed = computed(() => {
    if (!verifyFresh.value || !verifyResult.value) return false;
    return kind.value === 'showpos'
      ? verifyResult.value.alpha != null
      : verifyResult.value.distanceM != null;
  });
  const allRegionsVerified = computed(() => verifiedKinds.showpos && verifiedKinds.ping);

  let drag: {
    handle: Handle;
    startX: number;
    startY: number;
    origin: ApexQRoi;
  } | null = null;

  let panDrag: {
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null = null;

  /** showpos 可框到单行数字；ping 保持稍大以免拖没了 */
  const SHOWPOS_MIN_W = 0.025;
  const SHOWPOS_MIN_H = 0.006;
  const PING_MIN_W = 0.02;
  const PING_MIN_H = 0.02;

  function clampRoi(r: ApexQRoi, forKind: RoiKind = 'showpos'): ApexQRoi {
    const minW = forKind === 'showpos' ? SHOWPOS_MIN_W : PING_MIN_W;
    const minH = forKind === 'showpos' ? SHOWPOS_MIN_H : PING_MIN_H;
    return clampApexQRoi(r, {minW, minH});
  }

  function assignRoi(target: ApexQRoi, next: ApexQRoi, forKind: RoiKind) {
    const c = clampRoi(next, forKind);
    target.x = c.x;
    target.y = c.y;
    target.w = c.w;
    target.h = c.h;
    // Any geometry edit invalidates an in-flight OCR response as well as the
    // cached pass marker. The native request cannot be cancelled, so its
    // generation is checked before the result is allowed back into the UI.
    verifyGen += 1;
    verifying.value = false;
    verifiedKinds[forKind] = false;
  }

  function syncFromProps() {
    assignRoi(draftShowpos, props.showposRoi, 'showpos');
    assignRoi(draftPing, props.pingRoi, 'ping');
  }

  function computeFitScale(): number {
    const stage = stageRef.value;
    const img = imgRef.value;
    if (!stage || !img || !img.naturalWidth) return 1;
    return Math.min(stage.clientWidth / img.naturalWidth, stage.clientHeight / img.naturalHeight);
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

  function updateImgBox(keepFocus = false) {
    const stage = stageRef.value;
    const img = imgRef.value;
    if (!stage || !img || !img.naturalWidth) return;
    const prevW = imgBox.width;
    const prevH = imgBox.height;
    const cx = keepFocus && prevW > 0 ? (stage.clientWidth / 2 - panX.value) / prevW : 0.5;
    const cy = keepFocus && prevH > 0 ? (stage.clientHeight / 2 - panY.value) / prevH : 0.5;

    const scale = computeFitScale() * zoom.value;
    imgBox.width = img.naturalWidth * scale;
    imgBox.height = img.naturalHeight * scale;

    if (keepFocus && prevW > 0) {
      panX.value = stage.clientWidth / 2 - cx * imgBox.width;
      panY.value = stage.clientHeight / 2 - cy * imgBox.height;
    }
    applyPanToBox();
  }

  /** 把图像相对坐标 (rx, ry) 放到视口中心 */
  function focusOnRel(rx: number, ry: number) {
    const stage = stageRef.value;
    const img = imgRef.value;
    if (!stage || !img || !img.naturalWidth) return;
    const scale = computeFitScale() * zoom.value;
    imgBox.width = img.naturalWidth * scale;
    imgBox.height = img.naturalHeight * scale;
    panX.value = stage.clientWidth / 2 - rx * imgBox.width;
    panY.value = stage.clientHeight / 2 - ry * imgBox.height;
    applyPanToBox();
  }

  function focusActiveKind() {
    if (kind.value === 'showpos') {
      // 左上 showpos：对准当前框（默认在左上）
      const r = draftShowpos;
      focusOnRel(r.x + r.w / 2, r.y + r.h / 2);
    } else {
      // 中心标点距离
      const r = draftPing;
      focusOnRel(r.x + r.w / 2, r.y + r.h / 2);
    }
  }

  function setZoom(next: number, anchorClientX?: number, anchorClientY?: number) {
    const stage = stageRef.value;
    const img = imgRef.value;
    if (!stage || !img || !img.naturalWidth) {
      zoom.value = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
      return;
    }
    const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
    const rect = stage.getBoundingClientRect();
    const ax = anchorClientX != null ? anchorClientX - rect.left : stage.clientWidth / 2;
    const ay = anchorClientY != null ? anchorClientY - rect.top : stage.clientHeight / 2;
    const oldBox = {
      left: panX.value,
      top: panY.value,
      width: imgBox.width,
      height: imgBox.height,
    };
    zoom.value = clamped;
    const scale = computeFitScale() * zoom.value;
    imgBox.width = img.naturalWidth * scale;
    imgBox.height = img.naturalHeight * scale;
    const pan = zoomPanForAnchor(
      {x: ax, y: ay},
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

  function resetZoomToKindDefault() {
    zoom.value = defaultZoomForKind();
    updateImgBox();
    focusActiveKind();
  }

  async function loadPreview(path: string) {
    if (!path) return;
    const gen = screenshotPicker.beginPreview();
    verifyGen += 1;
    verifying.value = false;
    loading.value = true;
    imagePath.value = '';
    previewSrc.value = '';
    verifyResult.value = null;
    verifyKind.value = null;
    verifyStale.value = true;
    verifiedKinds.showpos = false;
    verifiedKinds.ping = false;
    try {
      const normalized = await normalizeApexQFolder(path);
      if (!screenshotPicker.isPreviewCurrent(gen)) return;
      // 校准主图：原图不缩小，避免放大后发糊
      const src = await apexQScreenshotPreview({path: normalized, maxEdge: 0});
      if (!screenshotPicker.isPreviewCurrent(gen)) return;
      imagePath.value = normalized;
      previewSrc.value = src;
      await nextTick();
      zoom.value = defaultZoomForKind();
      updateImgBox();
      focusActiveKind();
    } catch (e) {
      if (!screenshotPicker.isPreviewCurrent(gen)) return;
      toast.error(String(e));
    } finally {
      if (screenshotPicker.isPreviewCurrent(gen)) loading.value = false;
    }
  }

  async function runOcrVerify() {
    if (!imagePath.value) {
      toast.warning(t('apex.apexQ.calibrateNoImage'));
      return;
    }
    const active = kind.value;
    const requestGen = ++verifyGen;
    const requestPath = imagePath.value;
    const requestShowposRoi = clampRoi({...draftShowpos}, 'showpos');
    const requestPingRoi = clampRoi({...draftPing}, 'ping');
    verifying.value = true;
    verifyStale.value = true;
    verifiedKinds[active] = false;
    try {
      const result = await apexQTestOcr({
        path: requestPath,
        showposRoi: requestShowposRoi,
        pingRoi: requestPingRoi,
        kind: active,
        engine: loadApexQPrefs().ocrEngine ?? 'auto',
      });
      if (requestGen !== verifyGen || imagePath.value !== requestPath) return;
      verifyResult.value = result;
      verifyKind.value = active;
      verifyStale.value = false;
      verifiedKinds[active] = active === 'showpos'
        ? result.alpha != null
        : result.distanceM != null;
      if (active === 'showpos') {
        if (result.alpha != null) {
          toast.success(t('apex.apexQ.calibrateVerifyOkShowpos', {alpha: result.alpha.toFixed(2)}));
        } else {
          toast.warning(t('apex.apexQ.calibrateVerifyPartialShowpos'));
        }
      } else if (result.distanceM != null) {
        toast.success(
          t('apex.apexQ.calibrateVerifyOkPing', {distance: result.distanceM.toFixed(1)}),
        );
      } else {
        toast.warning(t('apex.apexQ.calibrateVerifyPartialPing'));
      }
    } catch (e) {
      if (requestGen !== verifyGen || imagePath.value !== requestPath) return;
      verifiedKinds[active] = false;
      verifyResult.value = null;
      verifyKind.value = null;
      verifyStale.value = true;
      toast.error(String(e));
    } finally {
      if (requestGen === verifyGen) verifying.value = false;
    }
  }

  async function refreshRecent() {
    if (!props.folder.trim()) {
      recentPaths.value = [];
      recentThumbs.value = [];
      return;
    }
    const gen = screenshotPicker.beginThumbnails();
    try {
      const paths = await apexQListRecentScreenshots({
        folder: await normalizeApexQFolder(props.folder),
        limit: 12,
      });
      if (!screenshotPicker.isThumbnailsCurrent(gen)) return;
      recentPaths.value = paths;
      // 选图列表：缩小预览，加快加载
      const thumbs = await Promise.all(
        paths.map(async (p) => {
          const title = p.split(/[/\\]/).pop() || p;
          try {
            const src = await apexQScreenshotPreview({path: p, maxEdge: THUMB_MAX_EDGE});
            return {path: p, title, src};
          } catch {
            return {path: p, title, src: ''};
          }
        }),
      );
      if (!screenshotPicker.isThumbnailsCurrent(gen)) return;
      recentThumbs.value = thumbs.filter((t) => t.src);
    } catch {
      if (!screenshotPicker.isThumbnailsCurrent(gen)) return;
      recentPaths.value = [];
      recentThumbs.value = [];
    }
  }

  async function loadLatest() {
    if (!props.folder.trim()) {
      toast.warning(t('apex.apexQ.calibrateNeedFolder'));
      return;
    }
    loading.value = true;
    try {
      const folder = await normalizeApexQFolder(props.folder);
      const latest = await apexQLatestScreenshot({folder});
      // 主图优先；缩略图并行，不阻塞预览
      void refreshRecent();
      await loadPreview(latest);
    } catch (e) {
      toast.error(String(e));
      loading.value = false;
    }
  }

  async function pickImage() {
    const selected = await open({
      multiple: false,
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
    const roi = activeRoi.value;
    drag = {
      handle,
      startX: e.clientX,
      startY: e.clientY,
      origin: {...roi},
    };
  }

  function onStagePointerDown(e: PointerEvent) {
    if (!previewSrc.value || drag || loupeDrag) return;
    if ((e.target as HTMLElement).closest('.calibrate-roi')) return;
    if ((e.target as HTMLElement).closest('.calibrate-loupe')) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    panDrag = {
      startX: e.clientX,
      startY: e.clientY,
      originX: panX.value,
      originY: panY.value,
    };
  }

  function onLoupePointerDown(e: PointerEvent) {
    if (!previewSrc.value || !stageRef.value) return;
    e.preventDefault();
    e.stopPropagation();
    const stage = stageRef.value;
    const el = e.currentTarget as HTMLElement;
    const stageRect = stage.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    let left = loupePos.left;
    let top = loupePos.top;
    if (left == null || top == null) {
      left = elRect.left - stageRect.left;
      top = elRect.top - stageRect.top;
      loupePos.left = left;
      loupePos.top = top;
    }
    el.setPointerCapture?.(e.pointerId);
    loupeDrag = {
      startX: e.clientX,
      startY: e.clientY,
      originLeft: left,
      originTop: top,
    };
    loupeDragging.value = true;
  }

  function clampLoupePos(left: number, top: number): {left: number; top: number} {
    const stage = stageRef.value;
    if (!stage) return {left, top};
    const {width: lw, height: lh} = loupeViewSize();
    const labelH = 22;
    const boxW = lw;
    const boxH = lh + labelH;
    const maxL = Math.max(0, stage.clientWidth - boxW);
    const maxT = Math.max(0, stage.clientHeight - boxH);
    return {
      left: Math.min(maxL, Math.max(0, left)),
      top: Math.min(maxT, Math.max(0, top)),
    };
  }

  function onPointerMove(e: PointerEvent) {
    if (loupeDrag) {
      const next = clampLoupePos(
        loupeDrag.originLeft + (e.clientX - loupeDrag.startX),
        loupeDrag.originTop + (e.clientY - loupeDrag.startY),
      );
      loupePos.left = next.left;
      loupePos.top = next.top;
      return;
    }
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
    const next = transformApexQRoi(drag.origin, drag.handle, dx, dy);
    assignRoi(activeRoi.value, next, kind.value);
  }

  function onPointerUp() {
    drag = null;
    panDrag = null;
    loupeDrag = null;
    loupeDragging.value = false;
  }

  function onWheel(e: WheelEvent) {
    if (!previewSrc.value) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.2 : 0.2;
    setZoom(zoom.value + delta, e.clientX, e.clientY);
  }

  function resetActive() {
    if (kind.value === 'showpos') assignRoi(draftShowpos, DEFAULT_SHOWPOS_ROI, 'showpos');
    else assignRoi(draftPing, DEFAULT_PING_ROI, 'ping');
    verifyStale.value = true;
    focusActiveKind();
  }

  function confirm() {
    if (!allRegionsVerified.value) {
      toast.warning(t('apex.apexQ.calibrateVerifyRequired'));
      return;
    }
    emit('confirm', {
      showposRoi: clampRoi({...draftShowpos}, 'showpos'),
      pingRoi: clampRoi({...draftPing}, 'ping'),
    });
    openDialog.value = false;
  }

  function onResize() {
    updateImgBox(true);
  }

  watch(
    () => props.modelValue,
    async (v) => {
      if (!v) return;
      kind.value = 'showpos';
      zoom.value = defaultZoomForKind('showpos');
      loupePos.left = null;
      loupePos.top = null;
      syncFromProps();
      // 立刻进入加载态，避免主舞台长时间空白
      loading.value = true;
      previewSrc.value = '';
      imagePath.value = '';
      try {
        if (props.folder.trim()) {
          await loadLatest();
        } else {
          await refreshRecent();
          if (recentPaths.value[0]) {
            await loadPreview(recentPaths.value[0]!);
          } else {
            loading.value = false;
          }
        }
      } catch (e) {
        toast.error(String(e));
        loading.value = false;
      }
    },
  );

  watch(kind, () => {
    if (!previewSrc.value) return;
    zoom.value = defaultZoomForKind();
    updateImgBox();
    focusActiveKind();
  });

  watch(
    () => [draftShowpos.x, draftShowpos.y, draftShowpos.w, draftShowpos.h],
    () => {
      if (verifyResult.value && verifyKind.value === 'showpos') verifyStale.value = true;
    },
  );

  watch(
    () => [draftPing.x, draftPing.y, draftPing.w, draftPing.h],
    () => {
      if (verifyResult.value && verifyKind.value === 'ping') verifyStale.value = true;
    },
  );

  watch(previewSrc, async () => {
    await nextTick();
    updateImgBox();
    focusActiveKind();
  });

  onMounted(() => {
    window.addEventListener('resize', onResize);
  });

  onBeforeUnmount(() => {
    window.removeEventListener('resize', onResize);
  });

  return {
    MAX_ZOOM,
    MIN_ZOOM,
    activeRoi,
    allRegionsVerified,
    bumpZoom,
    confirm,
    focusActiveKind,
    imagePath,
    imgBox,
    imgRef,
    kind,
    loadLatest,
    loading,
    loupeDragging,
    loupeImgStyle,
    loupeShellStyle,
    loupeViewStyle,
    onLoupePointerDown,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onSelectRecent,
    onStagePointerDown,
    onWheel,
    openDialog,
    panDrag,
    pickImage,
    previewSrc,
    recentThumbs,
    ref,
    resetActive,
    resetZoomToKindDefault,
    runOcrVerify,
    stageRef,
    t,
    updateImgBox,
    verifiedKinds,
    verifyFresh,
    verifyKind,
    verifyPassed,
    verifyResult,
    verifyStale,
    verifying,
    zoom,
    zoomPercent,
  };
}
