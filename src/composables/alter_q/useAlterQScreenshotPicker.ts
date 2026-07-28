export interface AlterQScreenshotRequestGuard {
  beginPreview(): number;
  beginThumbnails(): number;
  isPreviewCurrent(generation: number): boolean;
  isThumbnailsCurrent(generation: number): boolean;
  invalidatePreview(): void;
  invalidateThumbnails(): void;
  invalidateAll(): void;
}

/**
 * Shared generation guard for screenshot previews and thumbnail lists.
 * A stale async response can never overwrite a newer picker request.
 */
export function useAlterQScreenshotPicker(): AlterQScreenshotRequestGuard {
  let previewGeneration = 0;
  let thumbnailGeneration = 0;

  return {
    beginPreview: () => ++previewGeneration,
    beginThumbnails: () => ++thumbnailGeneration,
    isPreviewCurrent: generation => generation === previewGeneration,
    isThumbnailsCurrent: generation => generation === thumbnailGeneration,
    invalidatePreview: () => {
      previewGeneration += 1;
    },
    invalidateThumbnails: () => {
      thumbnailGeneration += 1;
    },
    invalidateAll: () => {
      previewGeneration += 1;
      thumbnailGeneration += 1;
    },
  };
}
