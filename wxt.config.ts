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
  },
});
