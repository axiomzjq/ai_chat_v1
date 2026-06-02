/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AUTHING_APP_ID: string;
  readonly VITE_AUTHING_DOMAIN: string;
  readonly VITE_AUTHING_USER_POOL_ID: string;
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
