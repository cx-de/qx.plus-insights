// Wraps .output/safari-mv3 in the Xcode app project that Safari needs (macOS only).
// On any other OS, or without full Xcode, it prints why and exits 0, so it never breaks a Windows or CI run.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const build = resolve(root, '.output/safari-mv3');
// Outside the repo: the Xcode project holds signing settings and must not ride along in the sources zip.
const project = resolve(root, '../qxplus_safari');

if (process.platform !== 'darwin') {
  console.log('Safari Xcode step skipped: needs macOS. The Safari build is in .output/safari-mv3 (npm run zip:safari for a zip).');
  process.exit(0);
}

try {
  execFileSync('xcrun', ['--find', 'safari-web-extension-converter'], { stdio: 'ignore' });
} catch {
  console.log('Safari Xcode step skipped: safari-web-extension-converter not found.');
  console.log('Install full Xcode, then run: sudo xcode-select -s /Applications/Xcode.app');
  process.exit(0);
}

if (!existsSync(resolve(build, 'manifest.json'))) {
  console.error(`No Safari build at ${build}. Run npm run build:safari first.`);
  process.exit(1);
}

// Re-running the converter would overwrite the project and its signing team; the project references the
// build folder, so a fresh build:safari is all an existing project needs.
if (existsSync(project)) {
  console.log(`Rebuilt ${build}. Open ${project} in Xcode and run the macOS app target.`);
  process.exit(0);
}

try {
  execFileSync('xcrun', [
    'safari-web-extension-converter', build,
    '--project-location', project,
    '--app-name', 'QX+ Insights',
    '--bundle-identifier', 'plus.qx.insights',
    '--no-open',
    '--no-prompt',
  ], { stdio: 'inherit' });
} catch (err) {
  console.error('safari-web-extension-converter failed:', err?.message || err);
  process.exit(1);
}

console.log(`Created ${project}. Open it in Xcode, set your signing team, and run the macOS app target.`);
