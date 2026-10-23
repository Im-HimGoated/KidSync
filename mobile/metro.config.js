const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.watchFolders = [
  path.resolve(__dirname, '../shared'),
  path.resolve(__dirname, '../assets')
];
module.exports = config;
