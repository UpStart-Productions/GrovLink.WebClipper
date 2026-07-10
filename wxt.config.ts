import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  srcDir: '.',
  manifest: {
    name: 'GrovLink Web Clipper (dev)',
    description:
      'Capture events from any page and send them to GrovLink as drafts. Local dev build, not for the Chrome Web Store.',
    version: '0.0.1',
    // Pins the extension to a fixed ID (cdoajlipibgcaelkcfljfakanlclogpj) across
    // rebuilds/reloads instead of getting a new random one every "Load unpacked".
    // Required for Cognito login: the OAuth redirect URI
    // (https://cdoajlipibgcaelkcfljfakanlclogpj.chromiumapp.org/) has to be a
    // fixed, known value we can register in the Cognito App Client ahead of time.
    // Private key lives at dev-keys/extension-dev-key.pem (gitignored, not a
    // secret in the traditional sense -- just needs to stay stable on this
    // machine so the ID doesn't change). See dev-keys/README.md.
    key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqaFbAWJ/hG1MnRVOpLnpQJ0VOHDk4cYb1brMS2JY2xDloI2LXpI9oiqXqo2b1YubMdaBaWtD+J/1I3D3ZCqzlMBpDOW+FFAkxMOw8W/us64AVKYlfinD7MxKEQuUZTdkyOkv8CRKQqw0g18eJNQmftFwab1eqXT/FsaPwPmJRePD0xKgRzVwCQvGLmDX3QNED9tW+iZCm99tmdgkFp1elDGRXNjM6wUFiJsxYT3LwhXS2788Lp4VD59P8Pyt6vkWq8MfzSMrUo1C34tBA1r6UJLoCRhcjMxcVZlVA5ogMrBG2tT+0AzHEx1/OiDN0dJOE7qbHpgEuWpGSY3skLaGXQIDAQAB',
    // 'identity' is what unlocks chrome.identity.launchWebAuthFlow() for the
    // Cognito Hosted UI login (see lib/cognitoAuth.ts).
    permissions: ['storage', 'activeTab', 'contextMenus', 'sidePanel', 'identity'],
    // Local backend for this stub, plus Cognito's Hosted UI domain (token
    // exchange/refresh calls in lib/cognitoAuth.ts run as ordinary fetch()
    // from the side panel, and this grants them cross-origin access
    // regardless of whether Cognito's token endpoint sends CORS headers).
    // Add the production API origin here once the extension talks to
    // anything besides localhost.
    host_permissions: ['http://localhost:3000/*', 'https://auth.grovlink.com/*'],
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
