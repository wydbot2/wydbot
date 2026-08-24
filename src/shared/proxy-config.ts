import { z } from 'zod';

export const DEFAULT_PROXY_LIST_URL =
  'https://raw.githubusercontent.com/proxifly/free-proxy-list/refs/heads/main/proxies/protocols/socks5/data.txt';

/** Maximum TCP + SOCKS5 greeting time between this machine and the proxy. */
export const MAX_PROXY_LATENCY_MS = 400;

export const ProxyListUrlSchema = z
  .string()
  .trim()
  .min(1, 'Informe a URL da lista.')
  .max(2048, 'A URL é muito longa.')
  .pipe(z.url({ protocol: /^https$/, error: 'Informe uma URL HTTPS válida.' }))
  .transform((value) => new URL(value).toString());

export const ProxySettingsSchema = z.discriminatedUnion('enabled', [
  z.object({ enabled: z.literal(false) }),
  z.object({ enabled: z.literal(true), listUrl: ProxyListUrlSchema }),
]);

export type ProxySettings = z.infer<typeof ProxySettingsSchema>;
