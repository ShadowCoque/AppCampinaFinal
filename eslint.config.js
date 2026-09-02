// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // `.expo` contiene tipos generados por expo-router; no se revisan.
    ignores: ['dist/*', '.expo/*'],
  },
]);
