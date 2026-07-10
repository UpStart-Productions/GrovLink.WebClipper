import { requestStructuredEventData } from '../lib/capture';

export default defineBackground(() => {
  // Clicking the toolbar icon opens the side panel directly -- there's no
  // separate quick-capture popup in this stub (see README for what's cut).
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

  chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
      id: 'grovlink-send-selection',
      title: 'Send to GrovLink',
      contexts: ['selection'],
    });
    chrome.contextMenus.create({
      id: 'grovlink-send-image',
      title: 'Send image to GrovLink',
      contexts: ['image'],
    });
  });

  // sidePanel.open() only works when called synchronously in direct response to
  // a user gesture -- if anything (an await, a .then()) runs before it, Chrome no
  // longer considers the call gesture-triggered and it silently does nothing.
  // So it goes first in both listeners below; storage gets set right after,
  // without blocking it.

  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (!tab) return;
    if (info.menuItemId !== 'grovlink-send-selection' && info.menuItemId !== 'grovlink-send-image') {
      return;
    }

    if (tab.windowId != null) {
      chrome.sidePanel.open({ windowId: tab.windowId }).catch((err) => {
        console.error('GrovLink: sidePanel.open failed', err);
      });
    }

    // sidePanel.open() above is the only part that has to run synchronously --
    // everything from here down can safely await. Context menu clicks have no
    // DOM access of their own (this runs in the background service worker), so
    // asking the content script already in that tab for structured event data
    // is the only way to get it for this capture path.
    const structured = tab.id != null ? await requestStructuredEventData(tab.id) : null;

    if (info.menuItemId === 'grovlink-send-selection') {
      chrome.storage.session.set({
        gl_capture: {
          kind: 'selection',
          text: info.selectionText ?? '',
          pageUrl: tab.url ?? '',
          pageTitle: tab.title ?? '',
          structuredStartDate: structured?.startDate,
          structuredEndDate: structured?.endDate,
        },
      });
    } else {
      chrome.storage.session.set({
        gl_capture: {
          kind: 'image',
          imageUrl: info.srcUrl ?? '',
          pageUrl: tab.url ?? '',
          pageTitle: tab.title ?? '',
          structuredStartDate: structured?.startDate,
          structuredEndDate: structured?.endDate,
        },
      });
    }
  });

  // The content script's floating selection bubble sends this instead of going
  // through the context menu, since bubble clicks don't carry menu info.
  chrome.runtime.onMessage.addListener((message, sender) => {
    if (message?.type !== 'gl-open-panel-with-capture') return;
    const windowId = sender.tab?.windowId;

    if (windowId != null) {
      chrome.sidePanel.open({ windowId }).catch((err) => {
        console.error('GrovLink: sidePanel.open failed', err);
      });
    }

    chrome.storage.session.set({ gl_capture: message.payload });
  });
});
