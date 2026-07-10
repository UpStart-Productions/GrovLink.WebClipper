// Stand-in for real auth. The local API accepts x-user-email / x-customer-slug /
// x-tenant-slug headers instead of a Cognito JWT whenever NODE_ENV !== 'production'
// (see api/src/app/auth/dev-auth.guard.ts in Nonprofit.Mobile.Platform). This lets us
// test the whole capture -> API -> database path before building real login.

export interface DevCreds {
  email: string;
  customerSlug: string;
  tenantSlug: string;
}

const KEY = 'gl_dev_creds';

export async function getDevCreds(): Promise<DevCreds | null> {
  const result = await chrome.storage.local.get(KEY);
  return (result[KEY] as DevCreds | undefined) ?? null;
}

export async function setDevCreds(creds: DevCreds): Promise<void> {
  await chrome.storage.local.set({ [KEY]: creds });
}

export async function clearDevCreds(): Promise<void> {
  await chrome.storage.local.remove(KEY);
}
