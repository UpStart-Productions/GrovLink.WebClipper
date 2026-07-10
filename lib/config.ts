// Local dev backend only. When we wire up real Cognito auth and a production
// build, this should become an environment-specific value instead of a constant.
export const API_BASE = 'http://localhost:3000/api';

// Where the "open in app" icon on a notification points -- the Angular admin
// dashboard, matching whatever API_BASE currently points at (local dev's
// `ng serve` default port). Same caveat as API_BASE: needs to become
// environment-specific rather than a constant once this ships for real.
export const ADMIN_BASE_URL = 'http://localhost:4200';
