import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';
import boundaries from 'eslint-plugin-boundaries';
import importX from 'eslint-plugin-import-x';

// ─── Custom inline rule ──────────────────────────────────────────────────────
// Ensures *-types.ts files contain only type/interface declarations (no runtime).
const typesFileOnlyExports = {
  meta: {
    type: 'problem',
    messages: {
      runtimeExport:
        "Files ending in '-types.ts' must only export type/interface declarations.",
    },
    schema: [],
  },
  create(context) {
    if (!context.filename.endsWith('-types.ts')) return {};
    return {
      ExportNamedDeclaration(node) {
        if (
          node.exportKind !== 'type' &&
          !(node.declaration?.type === 'TSInterfaceDeclaration') &&
          !(node.declaration?.type === 'TSTypeAliasDeclaration')
        ) {
          context.report({ node, messageId: 'runtimeExport' });
        }
      },
      ExportDefaultDeclaration(node) {
        context.report({ node, messageId: 'runtimeExport' });
      },
      ExportAllDeclaration(node) {
        if (node.exportKind !== 'type') {
          context.report({ node, messageId: 'runtimeExport' });
        }
      },
    };
  },
};

// ─── Base config: universal rules for all src/**/*.ts(x) ─────────────────────

export default tseslint.config(
  {
    ignores: [
      'out/',
      'dist/',
      'node_modules/',
      'src/preload/index.d.ts',
      'src/renderer/lib/script-ctx-dts.generated.ts',
      'src/renderer/lib/script-ctx-meta.generated.json',
    ],
  },

  ...tseslint.configs.recommended,
  eslintConfigPrettier,

  {
    files: ['src/**/*.ts', 'src/**/*.tsx', 'tools/**/*.ts'],
    plugins: {
      boundaries,
      'import-x': importX,
      local: { rules: { 'types-file-only-exports': typesFileOnlyExports } },
    },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    settings: {
      // ── Boundaries: element declarations for DAG enforcement ──
      'boundaries/elements': [
        { type: 'shared', pattern: 'src/shared/**/*', mode: 'full' },
        { type: 'renderer', pattern: 'src/renderer/**/*', mode: 'full' },
        { type: 'preload', pattern: 'src/preload/**/*', mode: 'full' },
        { type: 'main-index', pattern: 'src/main/index.ts', mode: 'full' },
        { type: 'ipc', pattern: 'src/main/ipc/**/*', mode: 'full' },
        { type: 'session', pattern: 'src/main/session/**/*', mode: 'full' },
        { type: 'protocol', pattern: 'src/main/protocol/**/*', mode: 'full' },
        { type: 'platform', pattern: 'src/main/platform/**/*', mode: 'full' },
        { type: 'game-assets', pattern: 'src/main/game-assets/**/*', mode: 'full' },
        { type: 'settings', pattern: 'src/main/settings/**/*', mode: 'full' },
        { type: 'main-lib', pattern: 'src/main/lib/**/*', mode: 'full' },
        { type: 'logging', pattern: 'src/main/logging/**/*', mode: 'full' },
      ],
      'boundaries/include': ['src/**/*.*'],

      // ── Import-x: TypeScript alias resolution ──
      'import-x/resolver': {
        typescript: { alwaysTryTypes: true },
      },
    },
    rules: {
      // ── Universal rules ────────────────────────────────────────────────
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/naming-convention': [
        'warn',
        {
          selector: 'variable',
          format: ['camelCase', 'UPPER_CASE', 'PascalCase'],
        },
        {
          selector: 'typeLike',
          format: ['PascalCase'],
        },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-floating-promises': ['error', { ignoreVoid: true }],

      // ── Custom — types files contain only types ────────────────────────
      'local/types-file-only-exports': 'error',

      // ── Import ordering (code-style.md §7) ────────────────────────────
      'import-x/order': [
        'error',
        {
          groups: [
            'builtin',
            'external',
            'internal',
            ['parent', 'sibling', 'index'],
          ],
          pathGroups: [
            { pattern: '@shared/**', group: 'internal', position: 'before' },
            { pattern: '@main/**', group: 'internal', position: 'after' },
            { pattern: '@renderer/**', group: 'internal', position: 'after' },
          ],
          pathGroupsExcludedImportTypes: ['builtin'],
          distinctGroup: false,
          'newlines-between': 'ignore',
        },
      ],

      // ── Boundaries — DAG enforcement ───────────────────────────────────
      // v6 renamed 'boundaries/element-types' → 'boundaries/dependencies' and
      // moved to object-based selectors. `from` accepts a BaseElementSelector
      // ({ type: '<element>' }); `allow`/`disallow` accept RulePolicyEntry,
      // which is a DependencySelector wrapping the target under `to`.
      // Same DAG semantics as v5, just verbose.
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          rules: [
            {
              from: { type: 'main-index' },
              allow: [
                { to: { type: 'ipc' } },
                { to: { type: 'session' } },
                { to: { type: 'logging' } },
                { to: { type: 'shared' } },
              ],
            },
            {
              from: { type: 'ipc' },
              allow: [
                { to: { type: 'ipc' } },
                { to: { type: 'session' } },
                { to: { type: 'protocol' } },
                { to: { type: 'platform' } },
                { to: { type: 'game-assets' } },
                { to: { type: 'settings' } },
                { to: { type: 'main-lib' } },
                { to: { type: 'logging' } },
                { to: { type: 'shared' } },
              ],
            },
            {
              from: { type: 'session' },
              allow: [
                { to: { type: 'session' } },
                { to: { type: 'protocol' } },
                { to: { type: 'logging' } },
                { to: { type: 'shared' } },
              ],
            },
            {
              from: { type: 'protocol' },
              allow: [
                { to: { type: 'protocol' } },
                { to: { type: 'logging' } },
                { to: { type: 'shared' } },
              ],
            },
            {
              from: { type: 'platform' },
              allow: [{ to: { type: 'platform' } }],
            },
            {
              from: { type: 'game-assets' },
              allow: [
                { to: { type: 'game-assets' } },
                { to: { type: 'main-lib' } },
                { to: { type: 'logging' } },
                { to: { type: 'shared' } },
              ],
            },
            {
              from: { type: 'settings' },
              allow: [
                { to: { type: 'settings' } },
                { to: { type: 'logging' } },
                { to: { type: 'shared' } },
              ],
            },
            {
              from: { type: 'main-lib' },
              allow: [{ to: { type: 'main-lib' } }],
            },
            {
              from: { type: 'logging' },
              allow: [{ to: { type: 'logging' } }, { to: { type: 'shared' } }],
            },
            {
              from: { type: 'renderer' },
              allow: [{ to: { type: 'renderer' } }, { to: { type: 'shared' } }],
            },
            {
              from: { type: 'preload' },
              allow: [{ to: { type: 'preload' } }, { to: { type: 'shared' } }],
            },
            {
              from: { type: 'shared' },
              allow: [{ to: { type: 'shared' } }],
            },
          ],
        },
      ],
    },
  },
);
