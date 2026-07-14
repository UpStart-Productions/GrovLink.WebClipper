// Deliberately NOT keyed off Vite's built-in import.meta.env.PROD/DEV --
// `wxt build` (the same command used for everyday local "Load unpacked"
// testing) always runs in Vite's "production" mode, which has nothing to do
// with whether this build should talk to the real GrovLink API. Instead this
// is driven by an explicit WXT_API_ENV env var (WXT exposes anything
// prefixed WXT_/VITE_ to import.meta.env -- see envPrefix in WXT's Vite
// builder), only set by the dedicated `npm run build:release` / `npm run
// zip:release` scripts. Plain `npm run build`/`npm run dev` are unaffected
// and keep hitting localhost, exactly as they always have.
const isReleaseBuild = import.meta.env.WXT_API_ENV === 'production';

export const API_BASE = isReleaseBuild ? 'https://api.grovlink.com/api' : 'http://localhost:3000/api';

// Where the "open in app" icon on a notification points -- the Angular admin
// dashboard. Matches the admin app's own production redirect URIs (see
// admin/src/environments/environment.production.ts in
// Nonprofit.Mobile.Platform: redirectSignIn/redirectSignOut are both
// https://app.grovlink.com/).
export const ADMIN_BASE_URL = isReleaseBuild ? 'https://app.grovlink.com' : 'http://localhost:4200';
