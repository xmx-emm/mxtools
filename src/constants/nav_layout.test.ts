import {describe, expect, it} from 'vitest';
import {
  NAV_MIN_WIDTH,
  NAV_PRIMARY_EXPANDED_MIN,
  NAV_PRIMARY_MAX,
  NAV_SECONDARY_EXPANDED_MIN,
  NAV_SECONDARY_MAX,
  navPanelExpandedWidth,
  navPanelLabelProgress,
  navPanelSnapThreshold,
  snapNavPanelWidth,
} from '@/constants/nav_layout.ts';

describe('navigation width snapping', () => {
  it('derives expanded widths from the active localized labels', () => {
    expect(navPanelExpandedWidth(65, NAV_PRIMARY_EXPANDED_MIN, NAV_PRIMARY_MAX)).toBe(133);
    expect(navPanelExpandedWidth(102, NAV_SECONDARY_EXPANDED_MIN, NAV_SECONDARY_MAX)).toBe(170);
    expect(navPanelExpandedWidth(0, NAV_PRIMARY_EXPANDED_MIN, NAV_PRIMARY_MAX)).toBe(
      NAV_PRIMARY_EXPANDED_MIN,
    );
    expect(navPanelExpandedWidth(999, NAV_SECONDARY_EXPANDED_MIN, NAV_SECONDARY_MAX)).toBe(
      NAV_SECONDARY_MAX,
    );
  });

  it('switches targets only after crossing half of each panel range', () => {
    const primaryMiddle = navPanelSnapThreshold(NAV_PRIMARY_MAX);
    const secondaryMiddle = navPanelSnapThreshold(NAV_SECONDARY_MAX);

    expect(snapNavPanelWidth(primaryMiddle - 1, NAV_PRIMARY_MAX)).toBe(NAV_MIN_WIDTH);
    expect(snapNavPanelWidth(primaryMiddle + 1, NAV_PRIMARY_MAX)).toBe(NAV_PRIMARY_MAX);
    expect(snapNavPanelWidth(secondaryMiddle - 1, NAV_SECONDARY_MAX)).toBe(NAV_MIN_WIDTH);
    expect(snapNavPanelWidth(secondaryMiddle + 1, NAV_SECONDARY_MAX)).toBe(NAV_SECONDARY_MAX);
  });

  it('reveals labels continuously before the panel is fully expanded', () => {
    expect(navPanelLabelProgress(NAV_MIN_WIDTH, NAV_PRIMARY_MAX)).toBe(0);
    expect(navPanelLabelProgress(NAV_MIN_WIDTH + 8, NAV_PRIMARY_MAX)).toBe(0);
    expect(navPanelLabelProgress(NAV_MIN_WIDTH + 32, NAV_PRIMARY_MAX)).toBeGreaterThan(0);
    expect(navPanelLabelProgress(NAV_MIN_WIDTH + 32, NAV_PRIMARY_MAX)).toBeLessThan(1);
    const measuredPrimaryMax = navPanelExpandedWidth(65, NAV_PRIMARY_EXPANDED_MIN, NAV_PRIMARY_MAX);
    const measuredSecondaryMax = navPanelExpandedWidth(
      102,
      NAV_SECONDARY_EXPANDED_MIN,
      NAV_SECONDARY_MAX,
    );
    expect(navPanelLabelProgress(measuredPrimaryMax - 12, measuredPrimaryMax)).toBe(1);
    expect(navPanelLabelProgress(measuredSecondaryMax - 12, measuredSecondaryMax)).toBe(1);
    expect(navPanelLabelProgress(NAV_PRIMARY_MAX, NAV_PRIMARY_MAX)).toBe(1);
    expect(navPanelLabelProgress(NAV_SECONDARY_MAX, NAV_SECONDARY_MAX)).toBe(1);
  });
});
