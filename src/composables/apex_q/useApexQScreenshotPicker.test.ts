import {describe, expect, it} from 'vitest';
import {useApexQScreenshotPicker} from './useApexQScreenshotPicker.ts';

describe('useApexQScreenshotPicker', () => {
  it('accepts only the latest preview and thumbnail generations', () => {
    const guard = useApexQScreenshotPicker();
    const stalePreview = guard.beginPreview();
    const currentPreview = guard.beginPreview();
    const thumbnails = guard.beginThumbnails();

    expect(guard.isPreviewCurrent(stalePreview)).toBe(false);
    expect(guard.isPreviewCurrent(currentPreview)).toBe(true);
    expect(guard.isThumbnailsCurrent(thumbnails)).toBe(true);

    guard.invalidateAll();
    expect(guard.isPreviewCurrent(currentPreview)).toBe(false);
    expect(guard.isThumbnailsCurrent(thumbnails)).toBe(false);
  });
});
