// Which customer/tenant a real (Cognito-authenticated) user is currently
// acting as. Dev-mode sign-in carries this same info directly on DevCreds
// instead (see devAuth.ts), since dev login asks for the slugs directly and
// has no picker step -- this file only matters for the real-auth path, once
// a user has picked an org via the /my-customers -> /my-tenants flow (see
// OrgPicker in App.tsx).

export interface OrgContext {
  customerSlug: string;
  tenantSlug: string;
  customerName: string;
  tenantName: string;
}

const KEY = 'gl_org_context';

export async function getOrgContext(): Promise<OrgContext | null> {
  const result = await chrome.storage.local.get(KEY);
  return (result[KEY] as OrgContext | undefined) ?? null;
}

export async function setOrgContext(ctx: OrgContext): Promise<void> {
  await chrome.storage.local.set({ [KEY]: ctx });
}

export async function clearOrgContext(): Promise<void> {
  await chrome.storage.local.remove(KEY);
}
