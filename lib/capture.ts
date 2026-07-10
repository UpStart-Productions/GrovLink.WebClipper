// What the extension captured, before it becomes a form. "page" comes from just
// clicking the toolbar icon with nothing selected; "selection" comes from the
// floating bubble or the right-click menu; "image" comes from right-clicking a photo.
export interface CapturePayload {
  kind: 'page' | 'selection' | 'image';
  pageTitle: string;
  pageUrl: string;
  text?: string;
  imageUrl?: string;
}

const SESSION_KEY = 'gl_capture';

// Content script / context menu clicks stash a capture here, then open the panel.
// The panel reads it once and clears it so a stale capture never reappears later.
export async function takePendingCapture(): Promise<CapturePayload | null> {
  const result = await chrome.storage.session.get(SESSION_KEY);
  const capture = result[SESSION_KEY] as CapturePayload | undefined;
  if (capture) {
    await chrome.storage.session.remove(SESSION_KEY);
  }
  return capture ?? null;
}

// Fallback when the panel opens with nothing staged: just describe the active tab.
export async function getActiveTabCapture(): Promise<CapturePayload | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return null;
  return {
    kind: 'page',
    pageTitle: tab.title ?? '',
    pageUrl: tab.url ?? '',
  };
}
