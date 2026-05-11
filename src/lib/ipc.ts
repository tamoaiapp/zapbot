import type { ZapBotApi } from '../../electron/preload';

declare global {
  interface Window {
    api: ZapBotApi;
  }
}

// Throw a clear error when running outside Electron (e.g. tests, plain `vite preview`)
function notInElectron(): never {
  throw new Error('window.api is not available — running outside Electron preload context');
}

export const api: ZapBotApi = typeof window !== 'undefined' && window.api ? window.api : (new Proxy(
  {},
  {
    get() {
      return notInElectron;
    },
  }
) as unknown as ZapBotApi);
