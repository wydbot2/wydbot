export type CSPMode = 'production' | 'development' | 'docs';

const BASE_POLICY: Record<string, readonly string[]> = {
  'default-src': ["'self'"],
  // Tailwind v4 + React inline styles require 'unsafe-inline' here.
  'style-src': ["'self'", "'unsafe-inline'"],
  'img-src': ["'self'", 'data:', 'blob:', 'wydicon:', 'wydmap:', 'wydaffect:', 'wydskill:'],
  'font-src': ["'self'", 'data:'],
  'worker-src': ["'self'", 'blob:'],
  'media-src': ["'self'"],
  'object-src': ["'none'"],
  'frame-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'none'"],
};

export const buildCspString = (mode: CSPMode): string => {
  // 'wasm-unsafe-eval' for QuickJS; 'unsafe-inline' for the Vite React Refresh
  // preamble (dev) and the VitePress SPA bootstrap inline scripts (docs window).
  const scriptSrc =
    mode === 'development' || mode === 'docs'
      ? ["'self'", "'wasm-unsafe-eval'", "'unsafe-inline'"]
      : ["'self'", "'wasm-unsafe-eval'"];

  const connectSrc =
    mode === 'development'
      ? ["'self'", 'ws://localhost:*', 'http://localhost:*', 'http://127.0.0.1:*']
      : ["'self'"];

  const policy: Record<string, readonly string[]> = {
    ...BASE_POLICY,
    'script-src': scriptSrc,
    'connect-src': connectSrc,
  };
  return Object.entries(policy)
    .map(([directive, sources]) => `${directive} ${sources.join(' ')}`)
    .join('; ');
};
