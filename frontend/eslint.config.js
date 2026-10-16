import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  { ignores: ['dist/**', 'node_modules/**'] },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: 'detect' } },
    plugins: { react, 'react-hooks': reactHooks },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['warn', { args: 'none', ignoreRestSiblings: true }],
      'no-unreachable': 'error',
      'no-dupe-keys': 'error',
      'no-self-assign': 'error',
      'no-constant-condition': 'warn',
      'react/jsx-no-undef': 'error',
      'react/jsx-uses-vars': 'error',
      'react/jsx-key': 'error',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
];
