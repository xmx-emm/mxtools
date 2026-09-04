import {reactive, readonly} from 'vue';

export type AppConfirmationKind = 'info' | 'warning' | 'error';
export type AppConfirmationAction = () => void | Promise<void>;

export interface AppConfirmationOptions {
  title: string;
  kind?: AppConfirmationKind;
  confirmText?: string;
  cancelText?: string;
  actionText?: string;
  onAction?: AppConfirmationAction;
}

interface AppConfirmationState {
  open: boolean;
  title: string;
  message: string;
  kind: AppConfirmationKind;
  confirmText?: string;
  cancelText?: string;
  actionText?: string;
  onAction?: AppConfirmationAction;
  actionRunning: boolean;
}

const state = reactive<AppConfirmationState>({
  open: false,
  title: '',
  message: '',
  kind: 'info',
  actionRunning: false,
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
  state.actionText = options.actionText;
  state.onAction = options.onAction;
  state.actionRunning = false;
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
  state.actionText = undefined;
  state.onAction = undefined;
  state.actionRunning = false;
  settlePending = null;
  pendingPromise = null;
  resolve(accepted);
}

export async function runAppConfirmationAction() {
  if (!settlePending || state.actionRunning) return;
  const action = state.onAction;
  state.actionRunning = true;
  state.open = false;
  try {
    await action?.();
  } finally {
    resolveAppConfirmation(false);
  }
}
