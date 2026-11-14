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
    artifactTemplate: 'qx-plus-insights-{{packageVersion}}-{{browser}}.zip',
    // WXT zips sources for every Firefox build unless told not to
    zipSources: false,
  },
  manifest: ({ browser }) => ({
    name: 'QX+ Insights',
    version: pkg.version,
    description:
      'Mehr Durchblick an der Börse: Mit zusätzlichen Insights und Details behalten Sie jederzeit die volle Kontrolle über Ihre Depots.',
    // alarms carries no install warning; a new warning on update would disable the extension until re-enabled
    permissions: ['storage', 'unlimitedStorage', 'alarms'],
    // Warns "Display notifications", so it is asked for when the user saves an alert, not on update
    optional_permissions: ['notifications'],
    ...(browser !== 'firefox' && browser !== 'safari' && { minimum_chrome_version: '116' }),
    // Derived from API_BASE_URL so the code can never call a host the manifest doesn't allow
    host_permissions: [`${new URL(API_BASE_URL).origin}/*`],
    // Telegram alerts are opt-in, so the third-party host is asked for only when the user saves a bot
    optional_host_permissions: ['https://api.telegram.org/*'],
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self';"
    },
    action: {
      default_title: 'QX+ Insights',
    },
    ...(browser === 'firefox' && {
      // Permanent AMO identity: changing it orphans every installed copy
      browser_specific_settings: {
        gecko: {
          id: 'insights@qx.plus',
          strict_min_version: '140.0',
          // Feed calls send holdings ISINs and the API key; SupportWidget sends name, email, message and screenshot; Telegram alerts send position names and values
          data_collection_permissions: {
            required: ['financialAndPaymentInfo', 'personallyIdentifyingInfo', 'personalCommunications', 'authenticationInfo'],
          },
        },
      },
    }),
  }),
});
