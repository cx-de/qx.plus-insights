import { defineConfig } from 'wxt';
import pkg from './package.json'

// Derived from WXT_API_BASE_URL so a staging/local build can't call a host the manifest doesn't allow.
function apiHostPermission() {
  const apiBaseUrl = process.env.WXT_API_BASE_URL;
  if (!apiBaseUrl) throw new Error('WXT_API_BASE_URL is missing — copy .env.example to .env');
  return `${new URL(apiBaseUrl).origin}/*`;
}

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  manifestVersion: 3,
  // A function, not an object: WXT loads .env only after reading this file, so process.env is empty at top level.
  manifest: () => ({
    name: 'QX+ Insights',
    version: pkg.version,
    description:
      'Mehr Durchblick an der Börse: Mit zusätzlichen Insights und Details behalten Sie jederzeit die volle Kontrolle über Ihre Depots.',
    permissions: ['storage', 'unlimitedStorage'],
    minimum_chrome_version: '116',
    host_permissions: [apiHostPermission()],
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self';"
    },
    action: {
      default_title: 'QX+ insights',
    },
  }),
});
