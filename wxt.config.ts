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
    sourcesTemplate: 'qx-plus-insights-{{packageVersion}}-sources.zip',
    // Allowlist, not blocklist: the sources zip goes to AMO and public releases, so stray local files must never ride along.
    includeSources: [
      'assets/**', 'components/**', 'entrypoints/**', 'lib/**', 'public/**', 'utils/**',
      'components.json', 'package.json', 'package-lock.json', 'tsconfig.json', 'wxt.config.ts',
      'README.md', 'LICENSE', 'SECURITY.md', 'examples/**',
    ],
  },
  manifest: ({ browser }) => ({
    name: 'QX+ Insights',
    version: pkg.version,
    description:
      'Mehr Durchblick an der Börse: Mit zusätzlichen Insights und Details behalten Sie jederzeit die volle Kontrolle über Ihre Depots.',
    permissions: ['storage', 'unlimitedStorage'],
    ...(browser !== 'firefox' && { minimum_chrome_version: '116' }),
    // Derived from API_BASE_URL so the code can never call a host the manifest doesn't allow
    host_permissions: [`${new URL(API_BASE_URL).origin}/*`],
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self';"
    },
    action: {
      default_title: 'QX+ insights',
    },
    ...(browser === 'firefox' && {
      // Permanent AMO identity: changing it orphans every installed copy
      browser_specific_settings: {
        gecko: {
          id: 'insights@qx.plus',
          strict_min_version: '140.0',
          // Feed calls send holdings ISINs and the API key; SupportWidget sends name, email, message and screenshot
          data_collection_permissions: {
            required: ['financialAndPaymentInfo', 'personallyIdentifyingInfo', 'personalCommunications', 'authenticationInfo'],
          },
        },
      },
    }),
  }),
});
