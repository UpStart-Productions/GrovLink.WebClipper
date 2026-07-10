import { API_BASE } from './config';
import { getDevCreds } from './devAuth';

async function authHeaders(): Promise<Record<string, string>> {
  const creds = await getDevCreds();
  if (!creds) throw new Error('Not signed in yet.');
  return {
    'content-type': 'application/json',
    'x-user-email': creds.email,
    'x-customer-slug': creds.customerSlug,
    'x-tenant-slug': creds.tenantSlug,
  };
}

export interface CreateEventInput {
  title: string;
  shortDescription?: string;
  startDate: string;
  endDate: string;
  isActive?: boolean;
}

// Maps straight onto EventCreateDto in api/src/app/admin/dto/event-create.dto.ts.
// Always submitted with isActive: false unless told otherwise -- that draft state
// is what makes the later "approval" step free instead of a feature we have to build.
export async function createDraftEvent(input: CreateEventInput) {
  const res = await fetch(`${API_BASE}/admin/events`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ ...input, isActive: input.isActive ?? false }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText}${body ? ` — ${body}` : ''}`);
  }
  return res.json();
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
