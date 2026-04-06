'use strict';

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const BUNDLE_ID = 'com.ombutocode.app';
const BUNDLE_NAME = 'Ombuto Code';

const plistPath = path.join(
  __dirname,
  '..',
  'node_modules',
  'electron',
  'dist',
  'Electron.app',
  'Contents',
  'Info.plist'
);

if (!fs.existsSync(plistPath)) {
  // Electron not yet downloaded or not on macOS — skip silently.
  process.exit(0);
}

try {
  const plistBuddy = '/usr/libexec/PlistBuddy';
  execSync(`${plistBuddy} -c "Set :CFBundleIdentifier ${BUNDLE_ID}" "${plistPath}"`);
  execSync(`${plistBuddy} -c "Set :CFBundleName ${BUNDLE_NAME}" "${plistPath}"`);
  console.log(`[postinstall] Patched Electron.app bundle ID → ${BUNDLE_ID}`);
} catch (err) {
  // PlistBuddy not available (Linux/Windows) — skip silently.
  if (err.status !== 0) {
    console.warn(`[postinstall] Could not patch Electron plist: ${err.message}`);
  }
}
