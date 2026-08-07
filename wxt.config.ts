import { defineConfig } from 'wxt';

// Deliberately not using WXT's env.mode here (development/production) --
// `wxt build` defaults to "production" mode even for an everyday local
// "Load unpacked" test build, so that flag can't distinguish "about to
// upload this to the Chrome Web Store" from "just testing locally." Instead
// this reads the same WXT_API_ENV env var lib/config.ts uses, set only by
// `npm run build:release`/`npm run zip:release`. Plain `npm run build`
// keeps producing the dev-labeled, localhost-pointed build exactly as
// before.
const isReleaseBuild = process.env.WXT_API_ENV === 'production';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  srcDir: '.',
  manifest: {
    name: isReleaseBuild ? 'GrovLink Web Clipper' : 'GrovLink Web Clipper (dev)',
    description:
      'Capture events, calls to action, classes, and impact stories from any webpage and send them to GrovLink as drafts for approval.',
    version: '1.0.0',
    // Pins the extension to a fixed ID (cdoajlipibgcaelkcfljfakanlclogpj) for
    // local dev/testing builds only -- Chrome Web Store rejects a manifest
    // with a `key` field on first upload (it assigns its own ID instead), so
    // this is omitted entirely from release builds below. That means the
    // published extension gets a *different* ID than the one used for local
    // testing -- after the first upload, grab the real assigned ID from the
    // Developer Dashboard and register its
    // https://<that-id>.chromiumapp.org/ as an additional callback + sign-out
    // URL on the Cognito App Client (keep the dev one registered too, so
    // local testing keeps working). Private key lives at
    // dev-keys/extension-dev-key.pem (gitignored, not a secret in the
    // traditional sense -- just needs to stay stable so the local dev ID
    // doesn't change). See dev-keys/README.md.
    ...(isReleaseBuild
      ? {}
      : {
          key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqaFbAWJ/hG1MnRVOpLnpQJ0VOHDk4cYb1brMS2JY2xDloI2LXpI9oiqXqo2b1YubMdaBaWtD+J/1I3D3ZCqzlMBpDOW+FFAkxMOw8W/us64AVKYlfinD7MxKEQuUZTdkyOkv8CRKQqw0g18eJNQmftFwab1eqXT/FsaPwPmJRePD0xKgRzVwCQvGLmDX3QNED9tW+iZCm99tmdgkFp1elDGRXNjM6wUFiJsxYT3LwhXS2788Lp4VD59P8Pyt6vkWq8MfzSMrUo1C34tBA1r6UJLoCRhcjMxcVZlVA5ogMrBG2tT+0AzHEx1/OiDN0dJOE7qbHpgEuWpGSY3skLaGXQIDAQAB',
        }),
    // 'identity' is what unlocks chrome.identity.launchWebAuthFlow() for the
    // Cognito Hosted UI login (see lib/cognitoAuth.ts).
    permissions: ['storage', 'activeTab', 'contextMenus', 'sidePanel', 'identity'],
    // Cognito's Hosted UI domain is needed either way (token exchange/refresh
    // calls in lib/cognitoAuth.ts run as ordinary fetch() from the side
    // panel, and host_permissions is what grants them cross-origin access
    // regardless of whether Cognito's token endpoint sends CORS headers).
    // The API origin itself differs: production builds talk to the real
    // GrovLink API, dev builds talk to localhost (see lib/config.ts, which
    // has to stay in sync with this list).
    host_permissions: isReleaseBuild
      ? [
          'https://api.grovlink.com/*',
          'https://auth.grovlink.com/*',
          'https://cognito-idp.us-west-2.amazonaws.com/*',
        ]
      : [
          'http://localhost:3000/*',
          'https://auth.grovlink.com/*',
          'https://cognito-idp.us-west-2.amazonaws.com/*',
        ],
    icons: {
      16: 'icon/16.png',
      32: 'icon/32.png',
      48: 'icon/48.png',
      128: 'icon/128.png',
    },
    action: {
      default_icon: {
        16: 'icon/16.png',
        32: 'icon/32.png',
        48: 'icon/48.png',
        128: 'icon/128.png',
      },
    },
    // The selection-bubble content script injects the logo into third-party
    // pages, so it needs to be explicitly web-accessible to those page origins.
    web_accessible_resources: [
      {
        resources: ['grovlink-logo.svg'],
        matches: ['<all_urls>'],
      },
    ],
  },
});
