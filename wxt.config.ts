import { defineConfig } from 'wxt';
import pkg from './package.json'

import fs from "fs";
import path from "path";

// Derived from WXT_API_BASE_URL so a staging/local build can't call a host the manifest doesn't allow.
function apiHostPermission() {
  const apiBaseUrl = process.env.WXT_API_BASE_URL;
  if (!apiBaseUrl) throw new Error('WXT_API_BASE_URL is missing — copy .env.example to .env');
  return `${new URL(apiBaseUrl).origin}/*`;
}

//See https://wxt.dev/api/config.html
export default defineConfig({
  vite: () => ({
    
  }),
  //extensionApi: 'chrome',
  modules: ['@wxt-dev/module-vue'],

  // manifest: {
  //   permissions: ["activeTab", "scripting"],
  //   action: {}
  // },
  //srcDir: 'src',
  manifestVersion: 3,
  // A function, not an object: WXT loads .env only after reading this file, so process.env is empty at top level.
  manifest: () => ({
    //manifest_version: 3,
    name: 'QX+ Insights',
    version: pkg.version,
    description:
      'Mehr Durchblick an der Börse: Mit zusätzlichen Insights und Details behalten Sie jederzeit die volle Kontrolle über Ihre Depots.',
    permissions: ['activeTab', 'storage', 'unlimitedStorage', 'tabs'],
    minimum_chrome_version: '116',
    host_permissions: [
      //'http://localhost/4040',
      //'https://feed.qx.plus/*',
      apiHostPermission(),
    ],
    content_scripts: [
      // {
      //   matches: ['https://konto.flatex.de/*'],
      //   js: ['src/sharedComponents/components.js', 'src/siteManipulation/kontoFlatex.js', 'src/content.js'],
      //   css: ['src/sharedComponents/components.css'],
      //   run_at: 'document_start',
      //   world: 'ISOLATED',
      // },
      // {
      //   matches: ['https://app.smartbrokerplus.de/*'],
      //   js: ['content.js','sharedComponents/components.js', 'siteManipulation/smartBrokerPlus.js'],
      //   css: ['sharedComponents/components.css'],
      //   run_at: 'document_end',
      //   world: 'ISOLATED',
      // },
    ],
    content_security_policy: {
      //extension_pages: "default-src 'self'; img-src 'self' data:; connect-src http://localhost:4040/ data: blob: filesystem:;",
      extension_pages: "script-src 'self'; object-src 'self';"
    },
    /*web_accessible_resources: [
      { resources: ["*.html"], matches: ["<all_urls>"] },
    ],*/
    action: {
      default_title: 'QX+ insights',
    },
  }),
});
