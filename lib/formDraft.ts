import { CapturePayload } from './capture';
import { ContentKind, CTA_TYPE_OPTIONS } from './contentTypes';

const DRAFT_KEY = 'gl_form_draft';

export interface SavedFormDraft {
  orgKey: string;
  contentType: ContentKind;
  ctaType: string;
  title: string;
  shortDescription: string;
  longDescription: string;
  quotedText: string;
  startDate: string;
  endDate: string;
  dateNote: string;
  photoNote: string;
  capture: CapturePayload | null;
  photoBase64?: string;
  photoMime?: string;
  photoName?: string;
  savedAt: number;
}

function orgKey(customerSlug: string, tenantSlug: string): string {
  return `${customerSlug}:${tenantSlug}`;
}

export async function saveFormDraft(draft: SavedFormDraft): Promise<void> {
  await chrome.storage.session.set({ [DRAFT_KEY]: draft });
}

export async function loadFormDraft(customerSlug: string, tenantSlug: string): Promise<SavedFormDraft | null> {
  const stored = await chrome.storage.session.get(DRAFT_KEY);
  const draft = stored[DRAFT_KEY] as SavedFormDraft | undefined;
  if (!draft || draft.orgKey !== orgKey(customerSlug, tenantSlug)) return null;
  return draft;
}

export async function clearFormDraft(): Promise<void> {
  await chrome.storage.session.remove(DRAFT_KEY);
}

export function emptyDraft(customerSlug: string, tenantSlug: string): SavedFormDraft {
  return {
    orgKey: orgKey(customerSlug, tenantSlug),
    contentType: 'impact_story',
    ctaType: CTA_TYPE_OPTIONS[0].value,
    title: '',
    shortDescription: '',
    longDescription: '',
    quotedText: '',
    startDate: '',
    endDate: '',
    dateNote: '',
    photoNote: '',
    capture: null,
    savedAt: Date.now(),
  };
}

export async function photoFileFromDraft(draft: SavedFormDraft): Promise<File | null> {
  if (!draft.photoBase64 || !draft.photoMime) return null;
  const binary = atob(draft.photoBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const name = draft.photoName || 'photo.jpg';
  return new File([bytes], name, { type: draft.photoMime });
}

export async function fileToDraftPhoto(file: File): Promise<Pick<SavedFormDraft, 'photoBase64' | 'photoMime' | 'photoName'>> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return {
    photoBase64: btoa(binary),
    photoMime: file.type || 'image/jpeg',
    photoName: file.name,
  };
}
