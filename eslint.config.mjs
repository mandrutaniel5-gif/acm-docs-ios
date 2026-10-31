// The checks that find real mistakes. The app's scripts share one page (no modules), so names defined in
// another script are not reported; style is left alone.
const realMistakes = {
  'no-dupe-keys': 'error', 'no-dupe-args': 'error', 'no-duplicate-case': 'error', 'no-unreachable': 'error', 'no-func-assign': 'error',
  'no-const-assign': 'error', 'no-redeclare': 'error', 'no-self-assign': 'error', 'no-unsafe-negation': 'error', 'no-unsafe-finally': 'error',
  'use-isnan': 'error', 'valid-typeof': 'error', 'no-sparse-arrays': 'error', 'no-invalid-regexp': 'error', 'no-obj-calls': 'error',
  'getter-return': 'error', 'no-setter-return': 'error', 'no-async-promise-executor': 'error', 'no-compare-neg-zero': 'error', 'for-direction': 'error',
};
export default [
  { ignores: ['app/vendor/**', 'build/vendor/**', 'site/control/fb.js', 'site/control/qr.js', 'app/js/i18n/**', 'app/js/i18n-en.js', 'app/js/invoice-langs.js', 'ios/www/**', 'dist/**', 'node_modules/**', 'functions/node_modules/**', 'test/ui/out/**', 'test/*.rgba'] },
  { files: ['app/js/**/*.js', 'site/control/*.js'], languageOptions: { sourceType: 'script', ecmaVersion: 2023 }, rules: realMistakes },
  { files: ['main.js', 'preload.js', 'ocr.js', 'build/*.js', 'test/*.js'], languageOptions: { sourceType: 'commonjs', ecmaVersion: 2023 }, rules: realMistakes },
  { files: ['**/*.mjs', 'functions/**/*.js'], languageOptions: { sourceType: 'module', ecmaVersion: 2023 }, rules: realMistakes },
];
