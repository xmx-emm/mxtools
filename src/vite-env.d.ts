/// <reference types="vite/client" />

interface Window {
  __splashStart?: number;
}

declare module '*.vue' {
  import type {DefineComponent} from 'vue';
  const component: DefineComponent<{}, {}, any>;
  export default component;
}
