import {describe, expect, it} from 'vitest';
import {
  defaultApexQOverlayPlacement,
  defaultApexQPrefs,
  normalizeApexQOverlayPlacement,
} from '@/types/apex_q.ts';
import {selectApexQOverlayMonitor, type ApexQMonitorDescriptor} from '@/utils/apex_q.ts';

const monitors: ApexQMonitorDescriptor[] = [
  {
    name: 'Generic Display',
    position: {x: 0, y: 0},
    size: {width: 1920, height: 1080},
    scaleFactor: 1,
  },
  {
    name: 'Generic Display',
    position: {x: 1920, y: 0},
    size: {width: 1920, height: 1080},
    scaleFactor: 1,
  },
];

describe('APEX Q overlay placement', () => {
  it('keeps the default near the bottom-right and scales physical dimensions', () => {
    const placement = defaultApexQOverlayPlacement(
      {name: 'Display 2', width: 3840, height: 2160},
      2,
    );

    expect(placement.monitorName).toBe('Display 2');
    expect(placement.rect.w).toBeCloseTo(440 / 3840, 6);
    expect(placement.rect.h).toBeCloseTo(248 / 2160, 6);
    expect(1 - placement.rect.x - placement.rect.w).toBeCloseTo(80 / 3840, 6);
    expect(1 - placement.rect.y - placement.rect.h).toBeCloseTo(160 / 2160, 6);
    expect(placement.rect.x + placement.rect.w).toBeLessThanOrEqual(1);
    expect(placement.rect.y + placement.rect.h).toBeLessThanOrEqual(1);
  });

  it('normalizes out-of-bounds rectangles and rejects empty ones', () => {
    const normalized = normalizeApexQOverlayPlacement({
      version: 2,
      monitorName: 'Display 1',
      monitorWidth: 1920,
      monitorHeight: 1080,
      rect: {x: 0.98, y: -0.2, w: 0.2, h: 0.1},
    });

    expect(normalized?.rect).toEqual({
      x: expect.closeTo(0.8, 6),
      y: 0,
      w: expect.closeTo(0.2, 6),
      h: expect.closeTo(0.1, 6),
    });
    expect(normalizeApexQOverlayPlacement({
      version: 2,
      monitorWidth: 1920,
      monitorHeight: 1080,
      rect: {x: 0, y: 0, w: 0, h: 0.1},
    })).toBeNull();
  });

  it('uses legacy coordinates to disambiguate monitors with the same name', () => {
    const prefs = defaultApexQPrefs();
    prefs.overlayX = 2100;
    prefs.overlayY = 100;
    prefs.overlayPlacement = {
      version: 2,
      monitorName: 'Generic Display',
      monitorWidth: 1920,
      monitorHeight: 1080,
      rect: {x: 0.7, y: 0.7, w: 0.1, h: 0.1},
    };

    expect(selectApexQOverlayMonitor(monitors, prefs)).toBe(monitors[1]);
  });

  it('prefers saved coordinates over a fallback monitor with the same name and size', () => {
    const prefs = defaultApexQPrefs();
    prefs.overlayX = 2100;
    prefs.overlayY = 100;
    prefs.overlayPlacement = {
      version: 2,
      monitorName: 'Generic Display',
      monitorWidth: 1920,
      monitorHeight: 1080,
      rect: {x: 0.7, y: 0.7, w: 0.1, h: 0.1},
    };

    expect(selectApexQOverlayMonitor(monitors, prefs, monitors[0])).toBe(monitors[1]);
  });

  it('falls back to saved coordinates when a monitor was renamed', () => {
    const prefs = defaultApexQPrefs();
    prefs.overlayX = 2100;
    prefs.overlayY = 100;
    prefs.overlayPlacement = {
      version: 2,
      monitorName: 'Old display name',
      monitorWidth: 1920,
      monitorHeight: 1080,
      rect: {x: 0.7, y: 0.7, w: 0.1, h: 0.1},
    };

    expect(selectApexQOverlayMonitor(monitors, prefs)).toBe(monitors[1]);
  });

  it('uses the saved physical resolution before overlapping logical coordinates', () => {
    const mixedDpiMonitors: ApexQMonitorDescriptor[] = [
      monitors[0]!,
      {
        name: 'Generic Display',
        position: {x: 1920, y: 0},
        size: {width: 3840, height: 2160},
        scaleFactor: 2,
      },
    ];
    const prefs = defaultApexQPrefs();
    // This legacy logical point can fall inside either monitor after DPI conversion.
    prefs.overlayX = 1060;
    prefs.overlayY = 100;
    prefs.overlayPlacement = {
      version: 2,
      monitorName: 'Generic Display',
      monitorWidth: 3840,
      monitorHeight: 2160,
      rect: {x: 0.7, y: 0.7, w: 0.1, h: 0.1},
    };

    expect(selectApexQOverlayMonitor(mixedDpiMonitors, prefs)).toBe(mixedDpiMonitors[1]);
  });
});
