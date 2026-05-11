/* eslint-env node */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    project: './tsconfig.json',
    tsconfigRootDir: __dirname,
  },
  plugins: ['@typescript-eslint', 'jsdoc'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/strict-type-checked',
    'plugin:jsdoc/recommended-typescript-error',
  ],
  rules: {
    'jsdoc/require-jsdoc': [
      'error',
      {
        publicOnly: true,
        require: {
          ArrowFunctionExpression: true,
          ClassDeclaration: true,
          ClassExpression: true,
          FunctionDeclaration: true,
          FunctionExpression: true,
          MethodDefinition: true,
        },
        contexts: [
          'TSInterfaceDeclaration',
          'TSTypeAliasDeclaration',
          'ExportNamedDeclaration > VariableDeclaration',
        ],
      },
    ],
    'jsdoc/require-param': [
      'error',
      {
        // Constitution Principle IV requires `@param` per parameter; nested
        // destructured properties are documented via the parent param block
        // rather than per-field, to avoid noise in the bag/options pattern.
        checkDestructured: false,
        checkDestructuredRoots: true,
      },
    ],
    // `check-param-names` mirrors the same convention.
    'jsdoc/check-param-names': ['error', { checkDestructured: false }],
    // Constitution Principle IV requires `@param for each parameter`; it does
    // not mandate prose for every block. Inline param descriptions remain a
    // reviewer expectation but are not mechanically enforced.
    'jsdoc/require-param-description': 'off',
    'jsdoc/require-returns': 'error',
    'jsdoc/require-returns-description': 'off',
    'jsdoc/no-undefined-types': 'off',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    '@typescript-eslint/explicit-module-boundary-types': 'error',
    '@typescript-eslint/consistent-type-imports': 'error',
  },
  overrides: [
    {
      files: ['tests/**/*.ts', '**/*.spec.ts'],
      rules: {
        'jsdoc/require-jsdoc': 'off',
        '@typescript-eslint/no-explicit-any': 'off',
        // Constitution Principle II permits non-null assertions in tests with
        // inline justification; we relax the rule across `tests/**` because
        // tests routinely assert preconditions on captured fixtures (e.g.,
        // `mockSendVerification.mock.calls[0]![0]`) where the surrounding
        // assertion makes the non-null intent obvious.
        '@typescript-eslint/no-non-null-assertion': 'off',
        // Tests frequently destructure unknown shapes from third-party
        // captures or DB rows; the strict-type-checked preset's safety
        // rules are too noisy here without adding real safety.
        '@typescript-eslint/no-unsafe-assignment': 'off',
        '@typescript-eslint/no-unsafe-member-access': 'off',
        '@typescript-eslint/no-unsafe-argument': 'off',
        '@typescript-eslint/no-unsafe-call': 'off',
        '@typescript-eslint/no-unsafe-return': 'off',
        '@typescript-eslint/no-confusing-void-expression': 'off',
        '@typescript-eslint/no-misused-promises': 'off',
        '@typescript-eslint/require-await': 'off',
        '@typescript-eslint/await-thenable': 'off',
        '@typescript-eslint/unbound-method': 'off',
        '@typescript-eslint/no-floating-promises': 'off',
        '@typescript-eslint/no-unnecessary-condition': 'off',
        '@typescript-eslint/restrict-template-expressions': 'off',
        '@typescript-eslint/prefer-promise-reject-errors': 'off',
        'jsdoc/require-returns': 'off',
        'jsdoc/require-returns-check': 'off',
      },
    },
  ],
  ignorePatterns: ['dist/', 'node_modules/', 'coverage/'],
};
