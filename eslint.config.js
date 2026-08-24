import tseslint from 'typescript-eslint';
import baseConfig from './eslint.config.base.js';
import mainConfig from './eslint.config.main.js';
import rendererConfig from './eslint.config.renderer.js';

export default [
  ...baseConfig,
  ...mainConfig,
  ...rendererConfig,

  // ─── Test files: relaxed rules ──────────────────────────────────────────
  {
    files: ['tests/**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },

  // ─── CommonJS tool scripts: require() IS the module system there ───────
  {
    files: ['**/*.cjs'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
];
