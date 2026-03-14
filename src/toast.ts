import { PluginOptions } from 'vue-toastification';
import { POSITION } from 'vue-toastification/src/ts/constants.ts';
import i18n from '@/i18n/i18n';

const TOAST_CLASS_NAME = 'mx-toast-no-select';
const TOAST_BODY_CLASS_NAME = 'mx-toast-body-no-select';
const TOAST_STYLE_ID = 'mx-toast-noselect-style';

type ToastTextContainer = {
  title?: unknown;
  body?: unknown;
  content?: unknown;
};

function translateText(text: string): string {
  if (i18n.global.te(text)) {
    return String(i18n.global.t(text));
  }

  return text;
}

function translateToastContent<T>(content: T): T {
  if (typeof content === 'string') {
    return translateText(content) as T;
  }

  if (content && typeof content === 'object') {
    const cloned = { ...(content as ToastTextContainer) };

    if (typeof cloned.title === 'string') {
      cloned.title = translateText(cloned.title);
    }

    if (typeof cloned.body === 'string') {
      cloned.body = translateText(cloned.body);
    }

    if (typeof cloned.content === 'string') {
      cloned.content = translateText(cloned.content);
    }

    return cloned as T;
  }

  return content;
}

function ensureToastNoSelectStyle(): void {
  if (typeof document === 'undefined') {
    return;
  }

  if (document.getElementById(TOAST_STYLE_ID)) {
    return;
  }

  const style = document.createElement('style');
  style.id = TOAST_STYLE_ID;
  style.textContent = `
.${TOAST_CLASS_NAME},
.${TOAST_CLASS_NAME} *,
.${TOAST_BODY_CLASS_NAME},
.${TOAST_BODY_CLASS_NAME} * {
  user-select: none;
  -webkit-user-select: none;
}
`;
  document.head.appendChild(style);
}

ensureToastNoSelectStyle();

const toastOptions: PluginOptions = {
  position: POSITION.TOP_RIGHT,
  timeout: 2500,
  closeOnClick: true,
  pauseOnFocusLoss: true,
  pauseOnHover: true,
  draggable: true,
  draggablePercent: 0.6,
  showCloseButtonOnHover: false,
  hideProgressBar: false,
  icon: true,
  rtl: false,
  toastClassName: TOAST_CLASS_NAME,
  bodyClassName: TOAST_BODY_CLASS_NAME,
  filterBeforeCreate: (toast) => translateToastContent(toast),
};

export { toastOptions };