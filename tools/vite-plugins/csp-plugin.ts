import type { Plugin } from 'vite';
import { buildCspString, type CSPMode } from '../../src/shared/security/csp-policy';

interface CSPPluginOptions {
  mode?: CSPMode;
}

export const cspPlugin = (opts: CSPPluginOptions = {}): Plugin => {
  let resolvedMode: CSPMode = 'production';

  return {
    name: 'wyd-csp',
    config(_, env) {
      resolvedMode = opts.mode ?? (env.command === 'build' ? 'production' : 'development');
    },
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        const csp = buildCspString(resolvedMode);
        return html.replace(
          '<head>',
          `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}">`,
        );
      },
    },
  };
};
