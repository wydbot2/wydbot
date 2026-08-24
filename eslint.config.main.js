import tseslint from 'typescript-eslint';

// ─── Main-process & preload config: OOP + strict rules ───────────────────────

export default tseslint.config(
  {
    files: ['src/main/**/*.ts', 'src/preload/**/*.ts'],
    rules: {
      // Block `export function` — force arrow expressions
      'func-style': ['error', 'expression'],

      // Require explicit access modifiers on class members
      '@typescript-eslint/explicit-member-accessibility': [
        'error',
        {
          accessibility: 'explicit',
          overrides: {
            constructors: 'no-public',
          },
        },
      ],

      // Require return types on exported functions
      '@typescript-eslint/explicit-module-boundary-types': [
        'error',
        {
          allowHigherOrderFunctions: true,
          allowTypedFunctionExpressions: true,
          allowDirectConstAssertionInArrowFunctions: true,
        },
      ],

      // Block .then()/.catch() chains — use async/await
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.property.name='then']",
          message: 'Use async/await instead of .then() chains.',
        },
        {
          selector: "CallExpression[callee.property.name='catch']",
          message: 'Use try/catch with async/await instead of .catch().',
        },
      ],

      // Console warning — prefer Winston logger
      'no-console': ['warn', { allow: ['warn', 'error'] }],

      // Class member ordering (code-style.md §4)
      '@typescript-eslint/member-ordering': [
        'error',
        {
          default: {
            memberTypes: [
              // Static
              'public-static-field',
              'protected-static-field',
              'private-static-field',
              'public-static-method',

              // Instance fields (public/protected only — private omitted)
              'public-instance-field',
              'protected-instance-field',

              // Constructor
              'constructor',

              // Accessors grouped by visibility
              ['public-instance-get', 'public-instance-set'],
              ['protected-instance-get', 'protected-instance-set'],
              ['private-instance-get', 'private-instance-set'],

              // Methods by visibility
              'public-instance-method',
              'protected-instance-method',
              'private-instance-method',
            ],
          },
        },
      ],

      // Barrel enforcement — only ipc/ has a barrel today
      'import-x/no-internal-modules': [
        'error',
        {
          forbid: ['src/main/ipc/!(index)*'],
        },
      ],
    },
  },

  // ─── Force @shared/ alias — main process ──────────────────────────────────
  {
    files: ['src/main/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '../shared/*',
                '../shared/**/*',
                '../../shared/*',
                '../../shared/**/*',
              ],
              message: 'Use @shared/ alias instead of relative path to shared/.',
            },
          ],
        },
      ],
    },
  },

  // ─── Force @shared/ alias — preload ───────────────────────────────────────
  {
    files: ['src/preload/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../shared/*', '../shared/**/*'],
              message: 'Use @shared/ alias instead of relative path to shared/.',
            },
          ],
        },
      ],
    },
  },
);
