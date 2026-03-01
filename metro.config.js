const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

const config = getDefaultConfig(__dirname)

config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  "node:crypto": path.resolve(__dirname, "lib/polyfills/crypto-shim.js"),
};

module.exports = withNativeWind(config, { input: './app/global.css' })