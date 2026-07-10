// Purely local "I've looked at this in the extension" tracking. This is
// deliberately NOT synced to the backend's readAt field -- notifications are
// meant to be actually processed (marked read, approved, denied, etc.) in
// the admin dashboard only. The extension never calls those mutating
// endpoints; this is just a per-browser-profile convenience so re-opening
// the notifications screen doesn't present the same already-glanced-at
// items as brand new every time. Scoped per org (customer+tenant) since a
// notification only makes sense in the context of who you're signed in as.

interface OrgKey {
  customerSlug: string;
  tenantSlug: string;
}

const KEY_PREFIX = 'gl_viewed_notifications:';
// Caps how many ids we remember per org so a long-lived install doesn't
// grow chrome.storage.local without bound.
const MAX_STORED_IDS = 500;

function storageKey(org: OrgKey): string {
  return `${KEY_PREFIX}${org.customerSlug}:${org.tenantSlug}`;
}

export async function getViewedNotificationIds(org: OrgKey): Promise<Set<string>> {
  const key = storageKey(org);
  const result = await chrome.storage.local.get(key);
  const ids = (result[key] as string[] | undefined) ?? [];
  return new Set(ids);
}

export async function markNotificationViewedLocally(org: OrgKey, id: string): Promise<void> {
  const key = storageKey(org);
  const existing = await getViewedNotificationIds(org);
  existing.add(id);
  // Oldest-first array, so slicing from the end keeps the most recent ids
  // when trimming to the cap.
  const trimmed = Array.from(existing).slice(-MAX_STORED_IDS);
  await chrome.storage.local.set({ [key]: trimmed });
}
