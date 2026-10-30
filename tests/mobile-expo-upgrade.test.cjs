const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { createRequire } = require('node:module');
const mobile = path.resolve(__dirname, '../mobile');
const requireMobile = createRequire(path.join(mobile, 'package.json'));

test('mobile uses the Device Hub-compatible SDK 58 runtime', () => {
  const { dependencies } = requireMobile('./package.json');
  assert.match(dependencies.expo, /^~58\./);
  assert.match(dependencies['@expo/metro-runtime'], /^~58\./);
  assert.match(dependencies['react-native'], /^0\.88\./);
});

test('shared image transforms resolve the native asset registry from mobile', () => {
  const config = requireMobile('./metro.config.js');
  const registry = requireMobile.resolve('react-native/asset-registry');
  assert.equal(config.transformer.assetRegistryPath, registry);
  assert.equal(path.isAbsolute(registry), true);
  assert.equal(fs.existsSync(registry), true);
  assert(config.watchFolders.includes(path.resolve(mobile, '../assets')));
  assert(config.watchFolders.includes(path.resolve(mobile, '../shared')));
});
