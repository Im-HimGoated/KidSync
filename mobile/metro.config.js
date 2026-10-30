const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
// Shared images live outside mobile/, so resolve their native registry here.
config.transformer.assetRegistryPath = require.resolve('react-native/asset-registry');
config.watchFolders = [
  path.resolve(__dirname, '../shared'),
  path.resolve(__dirname, '../assets')
];
module.exports = config;
