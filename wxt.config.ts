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
    permissions: ['storage', 'activeTab', 'contextMenus', 'sidePanel'],
    // Local backend only for this stub. Add the production API origin here later.
    host_permissions: ['http://localhost:3000/*'],
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
