import {reactive, readonly} from 'vue';

export type AppConfirmationKind = 'info' | 'warning' | 'error';

export interface AppConfirmationOptions {
  title: string;
  kind?: AppConfirmationKind;
  confirmText?: string;
  cancelText?: string;
}

interface AppConfirmationState {
  open: boolean;
  title: string;
  message: string;
  kind: AppConfirmationKind;
  confirmText?: string;
  cancelText?: string;
}

const state = reactive<AppConfirmationState>({
  open: false,
  title: '',
  message: '',
  kind: 'info',
});

let pendingPromise: Promise<boolean> | null = null;
let settlePending: ((accepted: boolean) => void) | null = null;

export const appConfirmationState = readonly(state);

export function confirm(message: string, options: AppConfirmationOptions): Promise<boolean> {
  if (pendingPromise) return pendingPromise;

  state.title = options.title;
  state.message = message;
  state.kind = options.kind ?? 'info';
  state.confirmText = options.confirmText;
  state.cancelText = options.cancelText;
  state.open = true;

  pendingPromise = new Promise<boolean>((resolve) => {
    settlePending = resolve;
  });
  return pendingPromise;
}

export function resolveAppConfirmation(accepted: boolean) {
  const resolve = settlePending;
  if (!resolve) return;

  state.open = false;
  settlePending = null;
  pendingPromise = null;
  resolve(accepted);
}
