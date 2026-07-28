/** 录制快捷键时暂停应用内快捷键响应，避免录制过程中触发动作。 */
let recordingDepth = 0;

export function beginShortcutRecording() {
  recordingDepth += 1;
}

export function endShortcutRecording() {
  recordingDepth = Math.max(0, recordingDepth - 1);
}

export function isShortcutRecording(): boolean {
  return recordingDepth > 0;
}
