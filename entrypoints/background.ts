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

  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (!tab) return;

    if (info.menuItemId === 'grovlink-send-selection') {
      await chrome.storage.session.set({
        gl_capture: {
          kind: 'selection',
          text: info.selectionText ?? '',
          pageUrl: tab.url ?? '',
          pageTitle: tab.title ?? '',
        },
      });
    } else if (info.menuItemId === 'grovlink-send-image') {
      await chrome.storage.session.set({
        gl_capture: {
          kind: 'image',
          imageUrl: info.srcUrl ?? '',
          pageUrl: tab.url ?? '',
          pageTitle: tab.title ?? '',
        },
      });
    } else {
      return;
    }

    if (tab.windowId != null) {
      await chrome.sidePanel.open({ windowId: tab.windowId });
    }
  });

  // The content script's floating selection bubble sends this instead of going
  // through the context menu, since bubble clicks don't carry menu info.
  chrome.runtime.onMessage.addListener((message, sender) => {
    if (message?.type !== 'gl-open-panel-with-capture') return;
    const windowId = sender.tab?.windowId;
    chrome.storage.session.set({ gl_capture: message.payload }).then(() => {
      if (windowId != null) {
        chrome.sidePanel.open({ windowId });
      }
    });
  });
});
