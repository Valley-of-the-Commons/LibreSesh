/** Stamped at build time in web/vite.config.ts. Read through import.meta.env
 *  so the values exist in dev as well as in a production build. */
interface ImportMetaEnv {
  readonly VITE_BUILD_TAG?: string;
  readonly VITE_BUILD_COMMIT?: string;
  readonly VITE_BUILD_DIRTY?: string;
  readonly VITE_BUILD_TIME?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
