const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: 'tests',
  testMatch: '*.spec.js',
  use: { channel: 'chrome', headless: true, viewport: { width: 1440, height: 900 } },
});
