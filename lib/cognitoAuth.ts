// Sign-in via aws-amplify (same USER_SRP_AUTH flow as the GrovLink admin app's
// CognitoAuthService.signInWithPassword) so login stays inside the branded side
// panel — no Cognito Hosted UI popup for email/password.
//
// Google sign-in still uses the Hosted UI popup (OAuth can't run inline in an
// extension page). Tokens from either path are checked in getValidIdToken().

import { Amplify } from 'aws-amplify';
import {
  confirmSignIn,
  fetchAuthSession,
  signIn,
  signOut,
} from 'aws-amplify/auth';

const COGNITO_DOMAIN = 'auth.grovlink.com';
const USER_POOL_ID = 'us-west-2_6W08oGoJh';
const CLIENT_ID = '4qvqllf1hegq189djtbj04vn2b';
const SCOPES = 'openid profile email';
const OAUTH_TOKENS_KEY = 'gl_cognito_tokens';

export interface CognitoTokens {
  idToken: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

let configured = false;

function ensureConfigured(): void {
  if (configured) return;
  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: USER_POOL_ID,
        userPoolClientId: CLIENT_ID,
        loginWith: {
          oauth: {
            domain: COGNITO_DOMAIN,
            scopes: ['openid', 'profile', 'email'],
            redirectSignIn: [chrome.identity.getRedirectURL()],
            redirectSignOut: [chrome.identity.getRedirectURL()],
            responseType: 'code',
          },
        },
      },
    },
  });
  configured = true;
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
  return chrome.identity.getRedirectURL();
}

async function requestOAuthTokens(body: URLSearchParams): Promise<CognitoTokens> {
  const res = await fetch(`https://${COGNITO_DOMAIN}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Sign-in failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const json = await res.json();
  return {
    idToken: json.id_token,
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
  };
}

async function getOAuthTokens(): Promise<CognitoTokens | null> {
  const stored = await chrome.storage.local.get(OAUTH_TOKENS_KEY);
  return stored[OAUTH_TOKENS_KEY] ?? null;
}

async function setOAuthTokens(tokens: CognitoTokens): Promise<void> {
  await chrome.storage.local.set({ [OAUTH_TOKENS_KEY]: tokens });
}

async function clearOAuthTokens(): Promise<void> {
  await chrome.storage.local.remove(OAUTH_TOKENS_KEY);
}

async function refreshOAuthTokens(refreshToken: string): Promise<CognitoTokens> {
  const fresh = await requestOAuthTokens(
    new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: CLIENT_ID,
      refresh_token: refreshToken,
    }),
  );
  const merged: CognitoTokens = { ...fresh, refreshToken: fresh.refreshToken || refreshToken };
  await setOAuthTokens(merged);
  return merged;
}

async function getValidOAuthIdToken(): Promise<string | null> {
  const tokens = await getOAuthTokens();
  if (!tokens) return null;

  const refreshBufferMs = 60_000;
  if (Date.now() < tokens.expiresAt - refreshBufferMs) {
    return tokens.idToken;
  }
  if (!tokens.refreshToken) {
    await clearOAuthTokens();
    return null;
  }
  try {
    const refreshed = await refreshOAuthTokens(tokens.refreshToken);
    return refreshed.idToken;
  } catch {
    await clearOAuthTokens();
    return null;
  }
}

export async function signInWithPassword(
  email: string,
  password: string,
): Promise<{ needsNewPassword: boolean }> {
  ensureConfigured();
  await clearOAuthTokens();
  const result = await signIn({ username: email.trim(), password });
  const step = (result as { nextStep?: { signInStep?: string } }).nextStep?.signInStep;
  const needsNewPassword =
    step === 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED' ||
    step === 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD';
  if (needsNewPassword) {
    return { needsNewPassword: true };
  }
  await fetchAuthSession();
  return { needsNewPassword: false };
}

export async function confirmSignInWithNewPassword(newPassword: string): Promise<void> {
  ensureConfigured();
  await confirmSignIn({ challengeResponse: newPassword });
  await fetchAuthSession();
}

/** Google (and other Hosted UI providers) — opens a popup. */
export async function signInWithGoogle(): Promise<void> {
  ensureConfigured();
  try {
    await signOut({ global: true });
  } catch {
    /* no Amplify session yet */
  }
  await clearOAuthTokens();

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
  authorizeUrl.searchParams.set('identity_provider', 'Google');

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
    throw new Error('Google sign-in did not return an authorization code.');
  }
  if (returned.searchParams.get('state') !== state) {
    throw new Error('Sign-in response failed state verification.');
  }

  const tokens = await requestOAuthTokens(
    new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }),
  );
  await setOAuthTokens(tokens);
}

/** @deprecated Use signInWithPassword or signInWithGoogle. Kept for callers migrating. */
export async function signInWithCognito(): Promise<CognitoTokens> {
  throw new Error('Use email/password sign-in or Sign in with Google.');
}

export async function getCognitoTokens(): Promise<CognitoTokens | null> {
  return getOAuthTokens();
}

export async function getValidIdToken(): Promise<string | null> {
  ensureConfigured();
  try {
    const session = await fetchAuthSession();
    const token = session.tokens?.idToken?.toString() ?? null;
    if (token) return token;
    const refreshed = await fetchAuthSession({ forceRefresh: true });
    const refreshedToken = refreshed.tokens?.idToken?.toString() ?? null;
    if (refreshedToken) return refreshedToken;
  } catch {
    /* fall through to OAuth tokens */
  }
  return getValidOAuthIdToken();
}

export async function hasCognitoSession(): Promise<boolean> {
  return !!(await getValidIdToken());
}

export async function signOutCognito(): Promise<void> {
  ensureConfigured();
  await clearOAuthTokens();
  try {
    await signOut({ global: true });
  } catch {
    /* already signed out */
  }
  const logoutUrl = new URL(`https://${COGNITO_DOMAIN}/logout`);
  logoutUrl.searchParams.set('client_id', CLIENT_ID);
  logoutUrl.searchParams.set('logout_uri', getRedirectUri());
  try {
    await new Promise<void>((resolve) => {
      chrome.identity.launchWebAuthFlow({ url: logoutUrl.toString(), interactive: false }, () => resolve());
    });
  } catch {
    /* best-effort Hosted UI cookie cleanup */
  }
}

export function getAuthErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message.startsWith('API error ')) {
    return err.message.replace(/^API error \d+: /, '');
  }
  if (err && typeof err === 'object' && 'name' in err) {
    const name = (err as { name: string }).name;
    const message = (err as { message?: string }).message ?? '';
    if (name === 'NotAuthorizedException' || message.includes('Incorrect username or password')) {
      return 'Invalid email or password.';
    }
    if (name === 'UserNotFoundException') {
      return 'No sign-in account for this email. Ask an admin to send you a sign-in invite first.';
    }
    if (name === 'LimitExceededException' || message.includes('Attempt limit exceeded')) {
      return 'Too many attempts. Please try again later.';
    }
    if (
      name === 'InvalidParameterException' ||
      message.includes('cannot be reset in the current state') ||
      message.includes('User password cannot be reset')
    ) {
      return 'Your account needs a temporary password first. Sign in with the password from your invite, then set a new password.';
    }
    if (name === 'UserNotConfirmedException') {
      return 'Please verify your email before signing in.';
    }
    if (name === 'InvalidPasswordException') {
      return 'Password does not meet requirements.';
    }
    if (message) return message;
  }
  return err instanceof Error ? err.message : 'An error occurred. Please try again.';
}

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
