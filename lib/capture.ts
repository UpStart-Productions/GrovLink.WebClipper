// What the extension captured, before it becomes a form. "page" comes from just
// clicking the toolbar icon with nothing selected; "selection" comes from the
// floating bubble or the right-click menu; "image" comes from right-clicking a photo.
export interface CapturePayload {
  kind: 'page' | 'selection' | 'image';
  pageTitle: string;
  pageUrl: string;
  text?: string;
  imageUrl?: string;
  // Pulled from the page's schema.org/Event JSON-LD when present (see
  // content.ts's extractEventSchema()) -- exact ISO date strings, no parsing
  // ambiguity. A page's event date doesn't depend on what you captured from
  // it, so this rides along on every capture kind, not just selections.
  structuredStartDate?: string;
  structuredEndDate?: string;
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

export interface StructuredEventData {
  startDate?: string;
  endDate?: string;
}

// Asks the content script already running in that tab to scan the page for
// schema.org/Event JSON-LD. Used both here (page-level captures) and from
// background.ts (context-menu captures, which have no DOM access of their
// own). Fails quietly -- pages the content script can't run on (chrome://,
// the Web Store, etc.) or that just don't have structured event data are both
// "no result," not an error worth surfacing to the user.
export async function requestStructuredEventData(tabId: number): Promise<StructuredEventData | null> {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: 'gl-get-structured-event-data' });
    return (response as StructuredEventData | undefined) ?? null;
  } catch {
    return null;
  }
}

// Fallback when the panel opens with nothing staged: just describe the active tab.
export async function getActiveTabCapture(): Promise<CapturePayload | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return null;
  const structured = tab.id != null ? await requestStructuredEventData(tab.id) : null;
  return {
    kind: 'page',
    pageTitle: tab.title ?? '',
    pageUrl: tab.url ?? '',
    structuredStartDate: structured?.startDate,
    structuredEndDate: structured?.endDate,
  };
}
