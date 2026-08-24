import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

// ─── Renderer config: React + relaxed OOP rules ─────────────────────────────

export default tseslint.config(
  {
    files: ['src/renderer/**/*.ts', 'src/renderer/**/*.tsx'],
    ...react.configs.flat.recommended,
    ...react.configs.flat['jsx-runtime'],
    plugins: {
      ...react.configs.flat.recommended.plugins,
      ...react.configs.flat['jsx-runtime'].plugins,
      'react-hooks': reactHooks,
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      // React Hooks — only the two universal rules (no React Compiler rules)
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // React general
      'react/jsx-key': 'error',
      'react/display-name': 'warn',
      'react/prop-types': 'off', // TypeScript handles this

      // Console is allowed — renderer has intentional wrapper in logger.ts
      'no-console': 'off',

      // func-style off — allows ErrorBoundary class components and FC arrows
      'func-style': 'off',

      // OOP rules OFF for renderer (these are main-process concerns)
      '@typescript-eslint/explicit-member-accessibility': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/member-ordering': 'off',
    },
  },
);
