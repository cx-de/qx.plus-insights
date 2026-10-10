import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';
import pkg from './package.json'
import { API_BASE_URL } from './utils/constants';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifestVersion: 3,
  // packageVersion, not version: WXT 0.21 changed what {{version}} resolves to
  zip: {
    artifactTemplate: 'qx-insights-v{{packageVersion}}-{{browser}}.zip',
    sourcesTemplate: 'qx-insights-v{{packageVersion}}-sources.zip',
  },
  manifest: () => ({
    name: 'QX+ Insights',
    version: pkg.version,
    description:
      'Mehr Durchblick an der Börse: Mit zusätzlichen Insights und Details behalten Sie jederzeit die volle Kontrolle über Ihre Depots.',
    permissions: ['storage', 'unlimitedStorage'],
    minimum_chrome_version: '116',
    // Derived from API_BASE_URL so the code can never call a host the manifest doesn't allow
    host_permissions: [`${new URL(API_BASE_URL).origin}/*`],
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self';"
    },
    action: {
      default_title: 'QX+ insights',
    },
  }),
});
