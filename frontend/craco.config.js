// craco.config.js
const path = require("path");
require("dotenv").config();

let GenerateSW = null;
try {
  ({ GenerateSW } = require("workbox-webpack-plugin"));
} catch (_) {
  // workbox-webpack-plugin aún no instalado — se omite PWA en dev hasta yarn install
}

// Environment variable overrides
const config = {
  enableHealthCheck: process.env.ENABLE_HEALTH_CHECK === "true",
};

function makeDevServerV5Compatible(devServerConfig) {
  const {
    https,
    onAfterSetupMiddleware,
    onBeforeSetupMiddleware,
    onListening,
    setupMiddlewares,
    ...compatibleConfig
  } = devServerConfig;

  compatibleConfig.server =
    typeof https === "object"
      ? { type: "https", options: https }
      : https
        ? "https"
        : "http";
  compatibleConfig.headers = {
    ...compatibleConfig.headers,
    "Cross-Origin-Resource-Policy": "same-origin",
  };

  if (onBeforeSetupMiddleware || setupMiddlewares) {
    compatibleConfig.setupMiddlewares = (middlewares, devServer) => {
      if (onBeforeSetupMiddleware) {
        onBeforeSetupMiddleware(devServer);
      }

      return setupMiddlewares
        ? setupMiddlewares(middlewares, devServer)
        : middlewares;
    };
  }

  compatibleConfig.onListening = (devServer) => {
    devServer.close ??= (callback) => devServer.stopCallback(callback);

    if (onListening) {
      onListening(devServer);
    }
    if (onAfterSetupMiddleware) {
      onAfterSetupMiddleware(devServer);
    }
  };

  return compatibleConfig;
}

// Conditionally load health check modules only if enabled
let WebpackHealthPlugin;
let setupHealthEndpoints;
let healthPluginInstance;

if (config.enableHealthCheck) {
  WebpackHealthPlugin = require("./plugins/health-check/webpack-health-plugin");
  setupHealthEndpoints = require("./plugins/health-check/health-endpoints");
  healthPluginInstance = new WebpackHealthPlugin();
}

let webpackConfig = {
  eslint: {
    configure: {
      extends: ["plugin:react-hooks/recommended"],
      rules: {
        "react-hooks/rules-of-hooks": "error",
        "react-hooks/exhaustive-deps": "warn",
      },
    },
  },
  webpack: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
    configure: (webpackConfig) => {

      // Add ignored patterns to reduce watched directories
        webpackConfig.watchOptions = {
          ...webpackConfig.watchOptions,
          ignored: [
            '**/node_modules/**',
            '**/.git/**',
            '**/build/**',
            '**/dist/**',
            '**/coverage/**',
            '**/public/**',
        ],
      };

      // Add health check plugin to webpack if enabled
      if (config.enableHealthCheck && healthPluginInstance) {
        webpackConfig.plugins.push(healthPluginInstance);
      }

      // PWA — Workbox GenerateSW (solo en production build)
      if (GenerateSW && process.env.NODE_ENV === "production") {
        webpackConfig.plugins.push(
          new GenerateSW({
            clientsClaim: true,
            skipWaiting: true,
            maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
            navigateFallback: "/index.html",
            navigateFallbackDenylist: [/^\/api\//],
            runtimeCaching: [
              {
                urlPattern: /^https:\/\/(?:[a-c]\.)?tile\.openstreetmap\.org\/.*/i,
                handler: "CacheFirst",
                options: {
                  cacheName: "osm-tiles",
                  expiration: { maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60 },
                  cacheableResponse: { statuses: [0, 200] },
                },
              },
              {
                urlPattern: /^https:\/\/.*\.tile\.openstreetmap\.org\/.*/i,
                handler: "CacheFirst",
                options: {
                  cacheName: "osm-tiles-fallback",
                  expiration: { maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60 },
                  cacheableResponse: { statuses: [0, 200] },
                },
              },
              {
                urlPattern: /^https:\/\/.*\.arcgisonline\.com\/.*/i,
                handler: "CacheFirst",
                options: {
                  cacheName: "esri-tiles",
                  expiration: { maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60 },
                  cacheableResponse: { statuses: [0, 200] },
                },
              },
              {
                urlPattern: /^https:\/\/.*\.maptiler\.com\/.*/i,
                handler: "CacheFirst",
                options: {
                  cacheName: "maptiler-tiles",
                  expiration: { maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60 },
                  cacheableResponse: { statuses: [0, 200] },
                },
              },
              {
                urlPattern: /^https:\/\/demotiles\.maplibre\.org\/.*/i,
                handler: "CacheFirst",
                options: {
                  cacheName: "maplibre-tiles",
                  expiration: { maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60 },
                  cacheableResponse: { statuses: [0, 200] },
                },
              },
              {
                urlPattern: /^https?:\/\/.*\/api\/.*/i,
                handler: "NetworkFirst",
                options: {
                  cacheName: "api-cache",
                  networkTimeoutSeconds: 10,
                  expiration: { maxEntries: 50, maxAgeSeconds: 5 * 60 },
                  cacheableResponse: { statuses: [0, 200] },
                },
              },
              {
                urlPattern: /^https?:\/\/[^/]+\/api\/.*/i,
                handler: "NetworkFirst",
                options: {
                  cacheName: "api-cache-alt",
                  networkTimeoutSeconds: 10,
                  expiration: { maxEntries: 50, maxAgeSeconds: 5 * 60 },
                  cacheableResponse: { statuses: [0, 200] },
                },
              },
            ],
          })
        );
      }

      return webpackConfig;
    },
  },
};

webpackConfig.devServer = (devServerConfig) => {
  // Add health check endpoints if enabled
  if (config.enableHealthCheck && setupHealthEndpoints && healthPluginInstance) {
    const originalSetupMiddlewares = devServerConfig.setupMiddlewares;

    devServerConfig.setupMiddlewares = (middlewares, devServer) => {
      // Call original setup if exists
      if (originalSetupMiddlewares) {
        middlewares = originalSetupMiddlewares(middlewares, devServer);
      }

      // Setup health endpoints
      setupHealthEndpoints(devServer, healthPluginInstance);

      return middlewares;
    };
  }

  return devServerConfig;
};

const configureDevServer = webpackConfig.devServer;
webpackConfig.devServer = (devServerConfig) =>
  makeDevServerV5Compatible(configureDevServer(devServerConfig));

module.exports = webpackConfig;
