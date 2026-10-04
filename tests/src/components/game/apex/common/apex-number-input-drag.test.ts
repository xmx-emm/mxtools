import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';

const source = readFileSync(new URL(
  '../../../../../../src/components/game/apex/common/ApexNumberInput.vue',
  import.meta.url,
), 'utf8');

describe('ApexNumberInput drag adjustment', () => {
  it('uses pointer lock while hiding and restoring the document cursor', () => {
    expect(source).toContain('target.requestPointerLock');
    expect(source).toContain("document.documentElement.style.cursor = 'none'");
    expect(source).toContain('document.exitPointerLock()');
    expect(source).toContain('document.documentElement.style.cursor = previous_document_cursor');
    expect(source).toContain('@lostpointercapture.stop="onLostPointerCapture"');
    expect(source).toContain('window.addEventListener(\'blur\', onWindowBlur');
    expect(source).toContain('event.preventDefault();');
    expect(source).toContain('document.addEventListener(\'pointerlockerror\', onPointerLockError)');
    expect(source).toContain('pointer_lock_failed');
    expect(source).toContain('const DRAG_ACTIVATION_PX = 3');
    expect(source).toContain('if (!dragging.value && Math.abs(client_delta) < DRAG_ACTIVATION_PX) return;');
    expect(source).toContain('Keep the native click/focus path intact.');
    expect(source).toContain('onBeforeUnmount(() => {');
    expect(source).toContain('finishDrag(pointer_lock_target, drag_pointer_id);');
    expect(source).toContain('drag_pointer_id = null;');
    expect(source).toMatch(/\.apex_number_input--drag-adjustable\.apex_number_input--dragging\s*\{[\s\S]*?user-select: none;/);
    expect(source).toContain('drag_start_screen_x = event.screenX');
    expect(source).toContain('drag_start_screen_y = event.screenY');
    expect(source).toContain('native_drag_start = isTauri()');
    expect(source).toContain('const nativeStart = native_drag_start');
    expect(source).toContain('restoreCursorPosition(x, y)');
    expect(source).toContain('const shouldRestoreNativeCursor = isTauri() && dragging.value;');
    expect(source).toContain('const wasPointerLocked = target !== null && document.pointerLockElement === target');
    expect(source).toContain('document.addEventListener(\'pointerlockchange\', onExit)');
    expect(source).toContain('const timeout = window.setTimeout(settle, 50)');
    expect(source).toContain('await pointerLockExit');
    expect(source).toContain('@pointermove.stop="onPointerMove"');
  });
});
