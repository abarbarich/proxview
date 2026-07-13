import { resolve } from 'node:path';

function bool(value: string | undefined): boolean {
  return value === '1' || value?.toLowerCase() === 'true';
}

/**
 * Central runtime configuration, resolved once from the environment.
 * Kept intentionally small; credentials live in the encrypted store, not here.
 */
export const env = {
  /** Bind host. 0.0.0.0 inside the container; compose maps it to 127.0.0.1 on the host. */
  host: process.env.HOST ?? '0.0.0.0',
  port: Number(process.env.PORT ?? 8080),
  /** Where SQLite, the secret key and other state live (a mounted volume in Docker). */
  dataDir: resolve(process.env.DATA_DIR ?? './data'),
  /** Serve synthetic data so the UI is fully explorable without a real cluster. */
  demo: bool(process.env.DEMO),
  // Release version: injected into the image at build time (CI passes the git tag as the
  // VERSION build-arg → PROXVIEW_VERSION). Falls back to the package version in local dev.
  version: process.env.PROXVIEW_VERSION || process.env.npm_package_version || '0.1.0',
  /** Built frontend, relative to the compiled backend/dist/index.js. */
  frontendDir: resolve(
    process.env.FRONTEND_DIR ?? new URL('../../../frontend/dist', import.meta.url).pathname,
  ),
  isProd: process.env.NODE_ENV === 'production',
} as const;
