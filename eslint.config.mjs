import js from '@eslint/js';
import pluginVue from 'eslint-plugin-vue';
import tseslint from 'typescript-eslint';
import vueParser from 'vue-eslint-parser';

export default tseslint.config(
  {
    ignores: ['dist/**', 'src-tauri/target/**', 'node_modules/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/essential'],
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        setTimeout: 'readonly',
      },
    },
  },
  {
    // public 下的脚本直接运行在 WebView 浏览器环境
    files: ['public/**/*.js'],
    languageOptions: {
      globals: {
        window: 'readonly',
        document: 'readonly',
      },
    },
    rules: {
      'no-restricted-globals': ['error', 'localStorage', 'sessionStorage'],
      'no-restricted-properties': [
        'error',
        {object: 'window', property: 'localStorage'},
        {object: 'window', property: 'sessionStorage'},
        {object: 'globalThis', property: 'localStorage'},
        {object: 'globalThis', property: 'sessionStorage'},
      ],
    },
  },
  {
    files: ['**/*.{ts,tsx,vue}'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tseslint.parser,
        ecmaVersion: 'latest',
        sourceType: 'module',
        extraFileExtensions: ['.vue'],
      },
    },
    rules: {
      // TypeScript and vue-tsc resolve browser/type globals more accurately than
      // ESLint's JavaScript-only no-undef rule.
      'no-undef': 'off',
      'no-restricted-globals': ['error', 'localStorage', 'sessionStorage'],
      'no-restricted-properties': [
        'error',
        {object: 'window', property: 'localStorage'},
        {object: 'window', property: 'sessionStorage'},
        {object: 'globalThis', property: 'localStorage'},
        {object: 'globalThis', property: 'sessionStorage'},
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', {argsIgnorePattern: '^_'}],
      'vue/multi-word-component-names': 'off',
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/html-self-closing': 'off',
      'vue/valid-v-slot': ['error', {allowModifiers: true}],
    },
  },
  {
    files: ['**/*.d.ts'],
    rules: {
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  // APEX Q remains deliberately split into small, independently testable SFCs.
  // Count the complete SFC (script, template, and styles) so styles cannot hide
  // a component that has outgrown its responsibility.
  {
    files: ['src/components/game/apex/apex_q/**/*.vue'],
    rules: {
      'max-lines': ['error', {max: 700, skipBlankLines: false, skipComments: false}],
    },
  },
  {
    files: ['src/components/game/apex/apex_q/ApexQDialog.vue'],
    rules: {
      'max-lines': ['error', {max: 700, skipBlankLines: false, skipComments: false}],
    },
  },
  {
    files: [
      'src/components/game/apex/apex_q/ApexQRoiCalibrateDialog.vue',
      'src/components/game/apex/apex_q/ApexQOverlayPlaceDialog.vue',
    ],
    rules: {
      'max-lines': ['error', {max: 500, skipBlankLines: false, skipComments: false}],
    },
  },
);
