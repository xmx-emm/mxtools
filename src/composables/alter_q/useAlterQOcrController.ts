import {ref} from 'vue';
import type {AlterQOcrStatus} from '@/ipc/commands.ts';

/** Reactive OCR lifecycle state shared by the wizard and OCR workspace panel. */
export function useAlterQOcrController(initialChecking: boolean) {
  const ocrOk = ref<boolean | null>(null);
  const ocrChecking = ref(initialChecking);
  const ocrCheckFailed = ref(false);
  const ocrStatus = ref<AlterQOcrStatus | null>(null);
  const ocrDownloading = ref(false);
  const ocrDownloadPercent = ref(0);
  const ocrDownloadFile = ref('');
  const ocrDownloadMirror = ref('');

  function setDownloadProgress(payload: {fileName: string; percent: number; mirrorLabel: string}) {
    ocrDownloadFile.value = payload.fileName;
    ocrDownloadPercent.value = payload.percent;
    ocrDownloadMirror.value = payload.mirrorLabel;
  }

  function resetDownloadProgress() {
    ocrDownloadPercent.value = 0;
    ocrDownloadFile.value = '';
    ocrDownloadMirror.value = '';
  }

  return {
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
  };
}
