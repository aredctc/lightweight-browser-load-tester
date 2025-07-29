module.exports = {
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
  ],
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
  },
  env: {
    node: true,
    es2020: true,
  },
  globals: {
    NodeJS: 'readonly',
    Buffer: 'readonly',
    global: 'readonly',
    fetch: 'readonly',
    Response: 'readonly',
    URL: 'readonly',
    URLSearchParams: 'readonly',
    AbortSignal: 'readonly',
    localStorage: 'readonly',
    sessionStorage: 'readonly',
    indexedDB: 'readonly',
    window: 'readonly',
  },
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { 
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
      ignoreRestSiblings: true 
    }],
    'no-unused-vars': 'off',
    'no-undef': 'error',
  },
  ignorePatterns: ['dist/', 'node_modules/', '*.js'],
};