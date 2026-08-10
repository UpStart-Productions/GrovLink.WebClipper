/** Whether the in-page "Send to GrovLink" selection bubble is enabled. */
export const SELECTION_BUBBLE_ENABLED_KEY = 'gl_selection_bubble_enabled';

/** Set by the side panel when the user is signed in (not on the login screen). */
export const CLIPPER_LOGGED_IN_KEY = 'gl_clipper_logged_in';

export async function getSelectionBubbleEnabled(): Promise<boolean> {
  const stored = await chrome.storage.local.get(SELECTION_BUBBLE_ENABLED_KEY);
  return stored[SELECTION_BUBBLE_ENABLED_KEY] !== false;
}

export async function setSelectionBubbleEnabled(enabled: boolean): Promise<void> {
  await chrome.storage.local.set({ [SELECTION_BUBBLE_ENABLED_KEY]: enabled });
}

export async function setClipperLoggedIn(loggedIn: boolean): Promise<void> {
  await chrome.storage.local.set({ [CLIPPER_LOGGED_IN_KEY]: loggedIn });
}
