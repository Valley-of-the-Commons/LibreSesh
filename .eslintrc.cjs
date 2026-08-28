/* eslint-env node */
module.exports = {
  root: true,
  env: { es2022: true, node: true, browser: true },
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2022, sourceType: 'module', ecmaFeatures: { jsx: true } },
  plugins: ['@typescript-eslint', 'react-hooks'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  rules: {
    ...require('eslint-plugin-react-hooks').configs.recommended.rules,
    // Handlers legitimately return promises we deliberately don't await.
    '@typescript-eslint/no-misused-promises': 'off',
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    'no-console': ['warn', { allow: ['warn', 'error', 'log'] }],
    eqeqeq: ['error', 'smart'],
  },
  ignorePatterns: [
    'node_modules/',
    'server/dist/',
    'web/dist/',
    'data/',
    // The approved mockup is a reference artefact, not shipped source.
    'design/mockup.jsx',
  ],
};
