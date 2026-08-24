import { createRequire } from 'node:module';
import { defineConfig } from 'vitepress';
import type { Plugin } from 'vite';
import tailwindcss from '@tailwindcss/vite';

// O JSON de @iconify-json/game-icons tem ~6 MB (65k ícones) e não é
// tree-shakeable por ícone. Este plugin devolve um módulo só com os ícones
// usados no site — os dados continuam vindo do pacote, em build time.
const DOCS_GAME_ICONS = ['tentacles-skull'] as const;
const require = createRequire(import.meta.url);
const gameIconsSingle = (): Plugin => {
  const VIRTUAL = '\0game-icons-single';
  return {
    name: 'game-icons-single',
    enforce: 'pre',
    resolveId: (id) => (id === '@iconify-json/game-icons/icons.json' ? VIRTUAL : null),
    load: (id) => {
      if (id !== VIRTUAL) return null;
      const json = require('@iconify-json/game-icons/icons.json') as {
        width: number;
        height: number;
        icons: Record<string, unknown>;
      };
      const icons = Object.fromEntries(DOCS_GAME_ICONS.map((name) => [name, json.icons[name]]));
      return `export default ${JSON.stringify({ prefix: 'game-icons', width: json.width, height: json.height, icons })}`;
    },
  };
};

// VitePress site configuration for the user-facing Script API docs.
//
// `base: '/'` (absolute) is what VitePress expects by default and is required
// for the runtime asset resolver to load `hashmap.json` correctly from any
// page. Inside Electron, `electron-serve` registers the `app://` scheme
// serving `out/docs/` as root — so `app://-/` maps to `out/docs/index.html`
// and `/hashmap.json` resolves to `app://-/hashmap.json` (which exists).
//
// To publish on GitHub Pages later, override via env var:
//   `VITE_BASE=/wydbot/ npm run docs:build`
export default defineConfig({
  lang: 'pt-BR',
  title: 'wydbot.com — Script API',
  description: 'Documentação da API exposta a scripts de macro no wydbot.com.',
  base: process.env['VITE_BASE'] ?? '/',
  cleanUrls: false,
  // readme.md é doc dev-facing (GitHub), não página do site — exclui do build
  // e do índice da busca local.
  srcExclude: ['readme.md'],
  // Dark-only: o design system WYDbot não tem light theme. `force-dark` fixa a
  // classe `.dark` no <html> (sem toggle) — necessário para o Shiki renderizar
  // as cores do tema dark nos blocos de código.
  appearance: 'force-dark',
  vite: {
    plugins: [gameIconsSingle(), tailwindcss()],
  },
  themeConfig: {
    logo: { src: '/wydbot-logo-white.svg', alt: 'wydbot' },
    siteTitle: 'Script API',
    nav: [
      { text: 'Guias', link: '/guias/primeiros-passos' },
      { text: 'API', link: '/api/player' },
      { text: 'Tipos', link: '/api/item' },
    ],
    sidebar: [
      {
        text: 'Guias',
        items: [{ text: 'Primeiros passos', link: '/guias/primeiros-passos' }],
      },
      {
        text: 'Estado do jogo',
        items: [
          { text: 'player', link: '/api/player' },
          { text: 'npcs', link: '/api/npcs' },
          { text: 'monsters', link: '/api/monsters' },
          { text: 'otherPlayers', link: '/api/other-players' },
        ],
      },
      {
        text: 'Controle',
        items: [
          { text: 'macro', link: '/api/macro' },
          { text: 'memory', link: '/api/memory' },
        ],
      },
      {
        text: 'Ações',
        items: [
          { text: 'log', link: '/api/log' },
          { text: 'alert', link: '/api/alert' },
        ],
      },
      {
        text: 'Tipos',
        items: [
          { text: 'Item', link: '/api/item' },
          { text: 'Entidade', link: '/api/entidade' },
          { text: 'ItemShort', link: '/api/item-short' },
        ],
      },
    ],
    search: {
      provider: 'local',
      options: {
        translations: {
          button: { buttonText: 'Buscar', buttonAriaLabel: 'Buscar na documentação' },
          modal: {
            displayDetails: 'Mostrar lista detalhada',
            resetButtonTitle: 'Limpar busca',
            backButtonTitle: 'Voltar',
            noResultsText: 'Nenhum resultado encontrado',
            footer: {
              selectText: 'para selecionar',
              navigateText: 'para navegar',
              closeText: 'para fechar',
            },
          },
        },
      },
    },
    docFooter: { prev: 'Anterior', next: 'Próximo' },
    outline: { level: [2, 3], label: 'Nesta página' },
    darkModeSwitchLabel: 'Tema',
    sidebarMenuLabel: 'Menu',
    returnToTopLabel: 'Voltar ao topo',
    lastUpdated: { text: 'Atualizado em' },
  },
});
