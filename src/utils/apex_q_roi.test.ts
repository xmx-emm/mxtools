import {describe, expect, it} from 'vitest';
import {
  apexQRoiToPhysicalGeometry,
  clampApexQRoi,
  transformApexQRoi,
  zoomPanForAnchor,
  type ApexQRoiHandle,
} from './apex_q_roi.ts';

describe('APEX Q ROI geometry', () => {
  it('clamps rectangles and supports move plus all eight resize handles', () => {
    const origin = {x: 0.25, y: 0.25, w: 0.2, h: 0.2};
    const handles: ApexQRoiHandle[] = ['move', 'nw', 'ne', 'sw', 'se', 'n', 's', 'w', 'e'];
    for (const handle of handles) {
      const transformed = transformApexQRoi(origin, handle, 0.05, -0.04);
      const clamped = clampApexQRoi(transformed, {minW: 0.02, minH: 0.02});
      expect(clamped.x).toBeGreaterThanOrEqual(0);
      expect(clamped.y).toBeGreaterThanOrEqual(0);
      expect(clamped.x + clamped.w).toBeLessThanOrEqual(1);
      expect(clamped.y + clamped.h).toBeLessThanOrEqual(1);
    }
  });

  it('keeps the image coordinate under the zoom anchor stable', () => {
    const pan = zoomPanForAnchor(
      {x: 100, y: 80},
      {left: 20, top: 10, width: 200, height: 100},
      {width: 400, height: 200},
    );
    expect(pan).toEqual({x: -60, y: -60});
  });

  it('converts normalized ROI to logical coordinates on a scaled monitor', () => {
    expect(apexQRoiToPhysicalGeometry(
      {x: 0.5, y: 0.5, w: 0.25, h: 0.25},
      {
        width: 3840,
        height: 2160,
        scale: 2,
        logicalX: 1920,
        logicalY: 0,
        minWidth: 220,
        minHeight: 124,
      },
    )).toMatchObject({x: 2880, y: 540, width: 480, height: 270});
  });
});
