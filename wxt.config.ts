import { defineConfig } from 'wxt';

// WXT_API_ENV=production → api.grovlink.com (default npm run build/dev).
// WXT_STORE_BUILD=true → strip dev manifest key (Chrome Web Store zips only).
const isProductionApi = process.env.WXT_API_ENV === 'production';
const isStoreBuild = process.env.WXT_STORE_BUILD === 'true';

const DEV_EXTENSION_KEY =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqaFbAWJ/hG1MnRVOpLnpQJ0VOHDk4cYb1brMS2JY2xDloI2LXpI9oiqXqo2b1YubMdaBaWtD+J/1I3D3ZCqzlMBpDOW+FFAkxMOw8W/us64AVKYlfinD7MxKEQuUZTdkyOkv8CRKQqw0g18eJNQmftFwab1eqXT/FsaPwPmJRePD0xKgRzVwCQvGLmDX3QNED9tW+iZCm99tmdgkFp1elDGRXNjM6wUFiJsxYT3LwhXS2788Lp4VD59P8Pyt6vkWq8MfzSMrUo1C34tBA1r6UJLoCRhcjMxcVZlVA5ogMrBG2tT+0AzHEx1/OiDN0dJOE7qbHpgEuWpGSY3skLaGXQIDAQAB';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  srcDir: '.',
  manifest: {
    name: isStoreBuild
      ? 'GrovLink Web Clipper'
      : isProductionApi
        ? 'GrovLink Web Clipper (prod API)'
        : 'GrovLink Web Clipper (local API)',
    description:
      'Capture events, calls to action, classes, and impact stories from any webpage and send them to GrovLink as drafts for approval.',
    version: '1.0.3',
    // Dev key pins a stable extension ID for Cognito OAuth during unpacked
    // testing. Omitted only for Chrome Web Store builds (they assign their own ID).
    ...(isStoreBuild ? {} : { key: DEV_EXTENSION_KEY }),
    permissions: ['storage', 'activeTab', 'contextMenus', 'sidePanel', 'identity'],
    host_permissions: isProductionApi
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
    web_accessible_resources: [
      {
        resources: ['grovlink-logo.svg'],
        matches: ['<all_urls>'],
      },
    ],
  },
});
