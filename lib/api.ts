import { ADMIN_BASE_URL, API_BASE } from './config';
import { getDevCreds } from './devAuth';
import { getValidIdToken } from './cognitoAuth';
import { getOrgContext } from './orgContext';
import { CONTENT_BASE_PATH, CONTENT_KINDS, CONTENT_LIST_KEY, ContentKind } from './contentTypes';

// Real Cognito login takes priority when both are present -- that shouldn't
// normally happen (App.tsx only ever sets up one at a time and "switch"
// clears whichever is active), but if it did, a real signed-in session is
// the one actually backed by a live token worth trusting.
async function authHeadersRaw(): Promise<Record<string, string>> {
  const idToken = await getValidIdToken();
  if (idToken) {
    const org = await getOrgContext();
    if (!org) throw new Error('Pick an organization before making changes.');
    return {
      Authorization: `Bearer ${idToken}`,
      'x-customer-slug': org.customerSlug,
      'x-tenant-slug': org.tenantSlug,
    };
  }
  const creds = await getDevCreds();
  if (!creds) throw new Error('Not signed in yet.');
  return {
    'x-user-email': creds.email,
    'x-customer-slug': creds.customerSlug,
    'x-tenant-slug': creds.tenantSlug,
  };
}

async function authHeaders(): Promise<Record<string, string>> {
  return { ...(await authHeadersRaw()), 'content-type': 'application/json' };
}

async function throwIfNotOk(res: Response): Promise<void> {
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText}${body ? ` — ${body}` : ''}`);
  }
}

export interface CreateDraftInput {
  title: string;
  shortDescription?: string;
  longDescription?: string;
  isActive?: boolean;
  // Set after a successful uploadStagingPhoto() call for the same stagingId --
  // each admin controller pulls the staged photo in at create time.
  stagingId?: string;
  // Only meaningful for events and CTAs (EventCreateDto requires these; CTAs
  // accept them optionally). Ignored by the class/impact-story endpoints if sent.
  startDate?: string;
  endDate?: string;
  // Required for CTAs only -- see CTA_TYPE_OPTIONS in contentTypes.ts.
  type?: string;
}

// One create call for all four content kinds -- they share the same core
// fields (title/descriptions/isActive/stagingId), maps onto whichever
// *CreateDto the backend expects for that kind. Always submitted with
// isActive: false unless told otherwise -- that draft state is what makes the
// later "approval" step (see fetchDrafts/approveDraft below) free instead of a
// feature we have to build.
export async function createDraft(kind: ContentKind, input: CreateDraftInput) {
  const res = await fetch(`${API_BASE}${CONTENT_BASE_PATH[kind]}`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ ...input, isActive: input.isActive ?? false }),
  });
  await throwIfNotOk(res);
  return res.json();
}

// Uploads a photo ahead of create. Must be followed by createDraft() for the
// same kind with the same stagingId, which is what actually attaches the
// photo to the created record -- this call alone just parks the file
// server-side.
export async function uploadStagingPhoto(
  kind: ContentKind,
  stagingId: string,
  file: Blob,
  filename: string,
): Promise<{ url: string }> {
  const form = new FormData();
  form.append('file', file, filename);
  const res = await fetch(`${API_BASE}${CONTENT_BASE_PATH[kind]}/staging/${stagingId}/photo`, {
    method: 'POST',
    // No content-type here -- fetch sets multipart/form-data with the right
    // boundary automatically for a FormData body. Setting it manually breaks upload.
    headers: await authHeadersRaw(),
    body: form,
  });
  await throwIfNotOk(res);
  return res.json();
}

// One row of the approval queue -- a not-yet-active record of any kind. Only
// the fields the queue actually displays get pulled out of each API's (very
// differently shaped) response.
export interface DraftItem {
  kind: ContentKind;
  id: string;
  title: string;
  shortDescription?: string;
  photoUrl?: string;
  createdAt: string;
}

// Pulls all four lists in parallel and keeps only isActive: false rows --
// that's the entire definition of "needs approval" here, since every create
// from this clipper lands as a draft. Merged and sorted newest-first so the
// queue reads as one inbox instead of four separate tabs.
export async function fetchDrafts(): Promise<DraftItem[]> {
  const headers = await authHeaders();
  const perKind = await Promise.all(
    CONTENT_KINDS.map(async (kind) => {
      const res = await fetch(`${API_BASE}${CONTENT_BASE_PATH[kind]}`, { headers });
      await throwIfNotOk(res);
      const data = await res.json();
      const rows: Array<Record<string, unknown>> = data[CONTENT_LIST_KEY[kind]] ?? [];
      return rows
        .filter((r) => !r.isActive)
        .map(
          (r): DraftItem => ({
            kind,
            id: String(r.id),
            title: String(r.title ?? '(untitled)'),
            shortDescription: (r.shortDescription as string | undefined) ?? undefined,
            photoUrl: (r.photoUrl as string | undefined) ?? undefined,
            createdAt: String(r.createdAt ?? ''),
          }),
        );
    }),
  );
  return perKind.flat().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

// Flips isActive: true -- the entire "approval" action. Every admin PATCH
// endpoint accepts isActive and fires the app notification on the
// false-to-true transition, so this is genuinely all approval takes.
export async function approveDraft(kind: ContentKind, id: string): Promise<void> {
  const res = await fetch(`${API_BASE}${CONTENT_BASE_PATH[kind]}/${id}`, {
    method: 'PATCH',
    headers: await authHeaders(),
    body: JSON.stringify({ isActive: true }),
  });
  await throwIfNotOk(res);
}

// Permanently deletes a draft -- for rejecting something the clipper grabbed
// that isn't worth keeping around.
export async function discardDraft(kind: ContentKind, id: string): Promise<void> {
  const res = await fetch(`${API_BASE}${CONTENT_BASE_PATH[kind]}/${id}`, {
    method: 'DELETE',
    headers: await authHeadersRaw(),
  });
  await throwIfNotOk(res);
}

// Staff-facing operational alerts -- class registrations, volunteer
// interest, voucher requests, intake submissions, etc. (see
// AdminNotificationsController in Nonprofit.Mobile.Platform). View-only here
// by design: some notification types have dedicated approve/deny endpoints
// that trigger real side effects (approving a voucher, etc.) -- those stay
// in the admin dashboard rather than being duplicated into the extension.
export interface AdminNotification {
  id: string;
  tenantId: string;
  tenant: { id: string; slug: string; name: string } | null;
  type: string;
  title: string;
  body: string | null;
  meta: unknown;
  readAt: string | null;
  createdAt: string;
}

// Where "open in app" for a given notification should go -- ported directly
// from NotificationsBellComponent#getNotificationLink in the admin app
// (admin/src/app/ui/notifications-bell/notifications-bell.component.ts) so
// the extension deep-links to the same place the admin dashboard's own bell
// would. Returns an admin-app-relative path (e.g. ['/events', id]), or null
// when there's nothing more specific to link to -- callers fall back to the
// dashboard home in that case.
export function notificationLinkPath(n: AdminNotification): string[] | null {
  const meta = (n.meta ?? null) as {
    itemType?: string;
    itemId?: string;
    serviceId?: string;
    appUserId?: string;
  } | null;
  if ((n.type === 'voucher_request' || n.type === 'volunteer_interest') && meta?.appUserId) {
    return ['/app-users', meta.appUserId];
  }
  if (!meta?.itemType || !meta?.itemId) return null;
  switch (meta.itemType) {
    case 'event':
      return ['/events', meta.itemId];
    case 'class':
      return ['/classes', meta.itemId];
    case 'service':
      return ['/services', meta.itemId];
    case 'cta':
      return ['/ctas', meta.itemId];
    case 'provider_offering':
      return meta.serviceId ? ['/services', meta.serviceId, 'offerings', meta.itemId] : null;
    case 'volunteer_position':
      return ['/volunteers'];
    case 'donation':
      return ['/donations'];
    default:
      return null;
  }
}

// Full URL for the "open in app" icon -- falls back to the dashboard home
// when notificationLinkPath() has nothing more specific (some notification
// types, like class_registration, have no admin-app deep link at all).
export function notificationAppUrl(n: AdminNotification): string {
  const path = notificationLinkPath(n);
  return `${ADMIN_BASE_URL}${path ? path.join('/') : '/'}`;
}

export async function fetchNotifications(opts?: { unreadOnly?: boolean; limit?: number }): Promise<AdminNotification[]> {
  const params = new URLSearchParams();
  if (opts?.unreadOnly) params.set('unreadOnly', 'true');
  if (opts?.limit) params.set('limit', String(opts.limit));
  const qs = params.toString();
  const res = await fetch(`${API_BASE}/admin/notifications${qs ? `?${qs}` : ''}`, {
    headers: await authHeadersRaw(),
  });
  await throwIfNotOk(res);
  const data = await res.json();
  return data.notifications ?? [];
}

export async function fetchUnreadNotificationCount(): Promise<number> {
  const res = await fetch(`${API_BASE}/admin/notifications/unread-count`, {
    headers: await authHeadersRaw(),
  });
  await throwIfNotOk(res);
  const data = await res.json();
  return data.count ?? 0;
}

// Deliberately no markNotificationRead/markNotificationUnread here. The
// extension only ever reads notifications (this fetch + the unread-count
// one above) -- marking something read/unread, approved, denied, etc. is
// real processing that happens in the admin dashboard. See
// lib/notificationViews.ts for the extension's own local-only "I've looked
// at this" tracking, which never touches the backend's readAt.

export interface OrgOption {
  id: string;
  slug: string;
  name: string;
}

// GET /my-customers -- deliberately no x-customer-slug header here, since
// finding out which customers this user belongs to is the whole point
// (see UsersController#myCustomers in Nonprofit.Mobile.Platform, which reads
// req.user straight off the verified JWT). Only meaningful for real Cognito
// sign-in; dev mode skips this since DevLogin already asks for the slugs
// directly.
export async function fetchMyCustomers(): Promise<OrgOption[]> {
  const idToken = await getValidIdToken();
  if (!idToken) throw new Error('Not signed in.');
  const res = await fetch(`${API_BASE}/my-customers`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  await throwIfNotOk(res);
  const data = await res.json();
  return data.customers ?? [];
}

// GET /my-tenants -- this one *does* need x-customer-slug, since it's asking
// "which locations within this customer," not a global list.
export async function fetchMyTenants(customerSlug: string): Promise<OrgOption[]> {
  const idToken = await getValidIdToken();
  if (!idToken) throw new Error('Not signed in.');
  const res = await fetch(`${API_BASE}/my-tenants`, {
    headers: { Authorization: `Bearer ${idToken}`, 'x-customer-slug': customerSlug },
  });
  await throwIfNotOk(res);
  const data = await res.json();
  return data.tenants ?? [];
}

export interface SeedUser {
  email: string;
  role: string;
  org: string | null;
  affiliate: string | null;
}

// Convenience for the dev login screen only -- GET /dev/seed-users is disabled
// in production (see api/src/app/dev/dev.controller.ts).
export async function fetchSeedUsers(): Promise<SeedUser[]> {
  const res = await fetch(`${API_BASE}/dev/seed-users`);
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText} — is the local API running on :3000?`);
  }
  const data = await res.json();
  return data.users ?? [];
}
