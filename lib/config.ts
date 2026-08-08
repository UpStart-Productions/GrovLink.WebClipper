// Which GrovLink API this build talks to. Set WXT_API_ENV=production for
// api.grovlink.com (default for npm run build/dev). Omit it (build:local) for
// localhost:3000. WXT_STORE_BUILD=true strips the dev manifest key — only for
// Chrome Web Store zips (npm run zip:store).
const isProductionApi = import.meta.env.WXT_API_ENV === 'production';

export const API_BASE = isProductionApi ? 'https://api.grovlink.com/api' : 'http://localhost:3000/api';

/** Shown in the capture UI so it's obvious which backend Save will hit. */
export const API_ENV_LABEL = isProductionApi ? 'Production' : 'Local dev (localhost)';

export const API_HOST_LABEL = isProductionApi ? 'api.grovlink.com' : 'localhost:3000';

// Where the "open in app" icon on a notification points -- the Angular admin
// dashboard. Matches the admin app's own production redirect URIs (see
// admin/src/environments/environment.production.ts in
// Nonprofit.Mobile.Platform: redirectSignIn/redirectSignOut are both
// https://app.grovlink.com/).
export const ADMIN_BASE_URL = isProductionApi ? 'https://app.grovlink.com' : 'http://localhost:4200';
