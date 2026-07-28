import type {AlterQRoi} from '@/types/alter_q.ts';

export type AlterQRoiHandle = 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w';

export interface AlterQRoiBounds {
  minW: number;
  minH: number;
  maxW?: number;
  maxH?: number;
}

export function clampAlterQRoi(roi: AlterQRoi, bounds: AlterQRoiBounds): AlterQRoi {
  const maxW = Math.min(1, Math.max(bounds.minW, bounds.maxW ?? 1));
  const maxH = Math.min(1, Math.max(bounds.minH, bounds.maxH ?? 1));
  const finiteW = Number.isFinite(roi.w) ? roi.w : bounds.minW;
  const finiteH = Number.isFinite(roi.h) ? roi.h : bounds.minH;
  const w = Math.min(maxW, Math.max(bounds.minW, finiteW));
  const h = Math.min(maxH, Math.max(bounds.minH, finiteH));
  const finiteX = Number.isFinite(roi.x) ? roi.x : 0;
  const finiteY = Number.isFinite(roi.y) ? roi.y : 0;
  const x = Math.min(1 - w, Math.max(0, finiteX));
  const y = Math.min(1 - h, Math.max(0, finiteY));
  return {x, y, w, h};
}

export function transformAlterQRoi(
  origin: AlterQRoi,
  handle: AlterQRoiHandle,
  dx: number,
  dy: number,
): AlterQRoi {
  let next: AlterQRoi;
  switch (handle) {
    case 'move':
      next = {x: origin.x + dx, y: origin.y + dy, w: origin.w, h: origin.h};
      break;
    case 'nw':
      next = {x: origin.x + dx, y: origin.y + dy, w: origin.w - dx, h: origin.h - dy};
      break;
    case 'ne':
      next = {x: origin.x, y: origin.y + dy, w: origin.w + dx, h: origin.h - dy};
      break;
    case 'sw':
      next = {x: origin.x + dx, y: origin.y, w: origin.w - dx, h: origin.h + dy};
      break;
    case 'se':
      next = {x: origin.x, y: origin.y, w: origin.w + dx, h: origin.h + dy};
      break;
    case 'n':
      next = {x: origin.x, y: origin.y + dy, w: origin.w, h: origin.h - dy};
      break;
    case 's':
      next = {x: origin.x, y: origin.y, w: origin.w, h: origin.h + dy};
      break;
    case 'w':
      next = {x: origin.x + dx, y: origin.y, w: origin.w - dx, h: origin.h};
      break;
    case 'e':
      next = {x: origin.x, y: origin.y, w: origin.w + dx, h: origin.h};
      break;
  }
  if (next.w < 0) {
    next.x += next.w;
    next.w = Math.abs(next.w);
  }
  if (next.h < 0) {
    next.y += next.h;
    next.h = Math.abs(next.h);
  }
  return next;
}

export function zoomPanForAnchor(
  anchor: {x: number; y: number},
  oldBox: {left: number; top: number; width: number; height: number},
  newSize: {width: number; height: number},
): {x: number; y: number} {
  const relX = oldBox.width > 0 ? (anchor.x - oldBox.left) / oldBox.width : 0.5;
  const relY = oldBox.height > 0 ? (anchor.y - oldBox.top) / oldBox.height : 0.5;
  return {
    x: anchor.x - relX * newSize.width,
    y: anchor.y - relY * newSize.height,
  };
}

export function alterQRoiToPhysicalGeometry(
  roi: AlterQRoi,
  monitor: {
    width: number;
    height: number;
    scale: number;
    logicalX: number;
    logicalY: number;
    minWidth: number;
    minHeight: number;
  },
) {
  const width = Math.min(
    monitor.width,
    Math.max(monitor.minWidth * monitor.scale, Math.round(roi.w * monitor.width)),
  );
  const height = Math.min(
    monitor.height,
    Math.max(monitor.minHeight * monitor.scale, Math.round(roi.h * monitor.height)),
  );
  const localX = Math.round(Math.min(monitor.width - width, Math.max(0, roi.x * monitor.width)));
  const localY = Math.round(Math.min(monitor.height - height, Math.max(0, roi.y * monitor.height)));
  return {
    x: Math.round(monitor.logicalX + localX / monitor.scale),
    y: Math.round(monitor.logicalY + localY / monitor.scale),
    width: Math.round(width / monitor.scale),
    height: Math.round(height / monitor.scale),
    localX,
    localY,
  };
}
