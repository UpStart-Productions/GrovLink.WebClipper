// Real (production) sign-in via Cognito Hosted UI -- the same login page the
// admin app uses (password OR "Continue with Google"), opened through
// chrome.identity.launchWebAuthFlow(). This is the standard Chrome extension
// pattern for OAuth flows that need a redirect back into the extension: no
// backend auth endpoint, no AWS Amplify (its SRP/session machinery has known
// friction inside extension pages), just a browser popup + Authorization
// Code + PKCE against Cognito's own token endpoint.
//
// Reuses the admin app's existing App Client (see
// admin/src/environments/environment.production.ts in Nonprofit.Mobile.Platform)
// rather than a dedicated one -- Jeff's call, so both apps recognize the same
// signed-in users under one client ID.
//
// See dev-keys/README.md for why the extension needs a *stable* ID: the
// OAuth redirect URI below is derived from it, and has to be pre-registered
// as an allowed callback URL on the Cognito App Client.

const COGNITO_DOMAIN = 'auth.grovlink.com';
const CLIENT_ID = '4qvqllf1hegq189djtbj04vn2b';
const SCOPES = 'openid profile email';
const TOKENS_KEY = 'gl_cognito_tokens';

export interface CognitoTokens {
  idToken: string;
  accessToken: string;
  refreshToken: string;
  /** Epoch ms when the ID/access token expire. */
  expiresAt: number;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomString(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

async function sha256Base64Url(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(new Uint8Array(digest));
}

function getRedirectUri(): string {
  // Resolves to https://<extension-id>.chromiumapp.org/ -- stable because the
  // extension ID is pinned (see wxt.config.ts's manifest.key).
  return chrome.identity.getRedirectURL();
}

/**
 * Launches the Hosted UI in a Chrome-managed popup and resolves once the
 * user finishes logging in (password or Google) and Chrome captures the
 * redirect back to this extension. Persists tokens to chrome.storage.local
 * on success.
 */
export async function signInWithCognito(): Promise<CognitoTokens> {
  const redirectUri = getRedirectUri();
  const codeVerifier = randomString(32);
  const codeChallenge = await sha256Base64Url(codeVerifier);
  const state = randomString(16);

  const authorizeUrl = new URL(`https://${COGNITO_DOMAIN}/oauth2/authorize`);
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('client_id', CLIENT_ID);
  authorizeUrl.searchParams.set('redirect_uri', redirectUri);
  authorizeUrl.searchParams.set('scope', SCOPES);
  authorizeUrl.searchParams.set('state', state);
  authorizeUrl.searchParams.set('code_challenge', codeChallenge);
  authorizeUrl.searchParams.set('code_challenge_method', 'S256');

  const resultUrl = await new Promise<string>((resolve, reject) => {
    chrome.identity.launchWebAuthFlow({ url: authorizeUrl.toString(), interactive: true }, (redirectedTo) => {
      if (chrome.runtime.lastError || !redirectedTo) {
        reject(new Error(chrome.runtime.lastError?.message || 'Sign-in was cancelled.'));
        return;
      }
      resolve(redirectedTo);
    });
  });

  const returned = new URL(resultUrl);
  const errorParam = returned.searchParams.get('error');
  if (errorParam) {
    throw new Error(returned.searchParams.get('error_description') || errorParam);
  }
  const code = returned.searchParams.get('code');
  if (!code) {
    throw new Error('Cognito did not return an authorization code.');
  }
  if (returned.searchParams.get('state') !== state) {
    throw new Error('Sign-in response failed state verification.');
  }

  const tokens = await requestTokens(
    new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }),
  );
  await setCognitoTokens(tokens);
  return tokens;
}

async function requestTokens(body: URLSearchParams): Promise<CognitoTokens> {
  const res = await fetch(`https://${COGNITO_DOMAIN}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Cognito token request failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const json = await res.json();
  return {
    idToken: json.id_token,
    accessToken: json.access_token,
    // Cognito only issues a refresh_token on the initial authorization_code
    // exchange -- refresh_token grant responses omit it, so callers must
    // carry the original one forward (see refreshCognitoTokens below).
    refreshToken: json.refresh_token,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
  };
}

export async function refreshCognitoTokens(refreshToken: string): Promise<CognitoTokens> {
  const fresh = await requestTokens(
    new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: CLIENT_ID,
      refresh_token: refreshToken,
    }),
  );
  const merged: CognitoTokens = { ...fresh, refreshToken: fresh.refreshToken || refreshToken };
  await setCognitoTokens(merged);
  return merged;
}

export async function getCognitoTokens(): Promise<CognitoTokens | null> {
  const stored = await chrome.storage.local.get(TOKENS_KEY);
  return stored[TOKENS_KEY] ?? null;
}

async function setCognitoTokens(tokens: CognitoTokens): Promise<void> {
  await chrome.storage.local.set({ [TOKENS_KEY]: tokens });
}

export async function clearCognitoTokens(): Promise<void> {
  await chrome.storage.local.remove(TOKENS_KEY);
}

/**
 * Returns a valid ID token for API calls, silently refreshing first if the
 * current one is expired or about to be. Returns null if there's no session
 * or the refresh itself fails (bad/revoked refresh token) -- callers should
 * treat that as "signed out."
 */
export async function getValidIdToken(): Promise<string | null> {
  const tokens = await getCognitoTokens();
  if (!tokens) return null;

  const refreshBufferMs = 60_000;
  if (Date.now() < tokens.expiresAt - refreshBufferMs) {
    return tokens.idToken;
  }
  if (!tokens.refreshToken) {
    await clearCognitoTokens();
    return null;
  }
  try {
    const refreshed = await refreshCognitoTokens(tokens.refreshToken);
    return refreshed.idToken;
  } catch {
    await clearCognitoTokens();
    return null;
  }
}

/** Decodes the (unverified -- for display purposes only) claims out of a JWT. */
export function decodeIdTokenClaims(idToken: string): Record<string, unknown> | null {
  try {
    const payload = idToken.split('.')[1];
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(normalized)
        .split('')
        .map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`)
        .join(''),
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export async function signOutCognito(): Promise<void> {
  await clearCognitoTokens();
  // Clears the Hosted UI's own session cookie -- without this, the next
  // signInWithCognito() would silently re-authenticate the same user instead
  // of showing a login page. Non-interactive so it doesn't flash a window.
  const logoutUrl = new URL(`https://${COGNITO_DOMAIN}/logout`);
  logoutUrl.searchParams.set('client_id', CLIENT_ID);
  logoutUrl.searchParams.set('logout_uri', getRedirectUri());
  try {
    await new Promise<void>((resolve) => {
      chrome.identity.launchWebAuthFlow({ url: logoutUrl.toString(), interactive: false }, () => resolve());
    });
  } catch {
    // Best-effort cleanup -- local tokens are already cleared above either way.
  }
}
