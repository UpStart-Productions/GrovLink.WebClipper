import {
  CLIPPER_LOGGED_IN_KEY,
  SELECTION_BUBBLE_ENABLED_KEY,
} from '../lib/selectionBubble';

interface StructuredEventData {
  startDate?: string;
  endDate?: string;
}

function isEventType(type: unknown): boolean {
  if (typeof type === 'string') return type === 'Event' || type.endsWith('Event');
  if (Array.isArray(type)) return type.some(isEventType);
  return false;
}

function findEventNode(node: unknown, depth: number): Record<string, unknown> | null {
  if (depth > 4 || node == null || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findEventNode(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  const obj = node as Record<string, unknown>;
  if (isEventType(obj['@type'])) return obj;
  if (Array.isArray(obj['@graph'])) {
    return findEventNode(obj['@graph'], depth + 1);
  }
  return null;
}

function extractEventSchema(): StructuredEventData | null {
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const script of Array.from(scripts)) {
    let data: unknown;
    try {
      data = JSON.parse(script.textContent ?? '');
    } catch {
      continue;
    }
    const event = findEventNode(data, 0);
    const startDate = typeof event?.startDate === 'string' ? event.startDate : undefined;
    if (startDate) {
      const endDate = typeof event?.endDate === 'string' ? event.endDate : undefined;
      return { startDate, endDate };
    }
  }
  return null;
}

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    let bubble: HTMLDivElement | null = null;
    let repositionScheduled = false;
    let bubbleEnabled = true;
    let clipperLoggedIn = false;
    /** User dismissed the bubble for this exact selection text until they highlight again. */
    let dismissedSelectionText: string | null = null;

    async function refreshBubbleSettings(): Promise<void> {
      const stored = await chrome.storage.local.get([
        SELECTION_BUBBLE_ENABLED_KEY,
        CLIPPER_LOGGED_IN_KEY,
      ]);
      bubbleEnabled = stored[SELECTION_BUBBLE_ENABLED_KEY] !== false;
      clipperLoggedIn = !!stored[CLIPPER_LOGGED_IN_KEY];
    }

    void refreshBubbleSettings();

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes[SELECTION_BUBBLE_ENABLED_KEY]) {
        bubbleEnabled = changes[SELECTION_BUBBLE_ENABLED_KEY].newValue !== false;
        if (!bubbleEnabled) removeBubble();
      }
      if (changes[CLIPPER_LOGGED_IN_KEY]) {
        clipperLoggedIn = !!changes[CLIPPER_LOGGED_IN_KEY].newValue;
        if (!clipperLoggedIn) removeBubble();
      }
    });

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === 'gl-get-structured-event-data') {
        sendResponse(extractEventSchema());
      }
    });

    function removeBubble() {
      bubble?.remove();
      bubble = null;
    }

    function positionBubble(rect: DOMRect) {
      if (!bubble) return;
      bubble.style.left = `${Math.max(8, rect.left)}px`;
      bubble.style.top = `${Math.max(8, rect.top - 42)}px`;
    }

    function currentSelectionRect(): DOMRect | null {
      const sel = window.getSelection();
      const text = sel?.toString().trim() ?? '';
      if (!sel || sel.rangeCount === 0 || text.length < 8) return null;
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return null;
      return rect;
    }

    function canShowBubble(): boolean {
      return clipperLoggedIn && bubbleEnabled;
    }

    function showBubble(rect: DOMRect, text: string) {
      removeBubble();
      bubble = document.createElement('div');
      Object.assign(bubble.style, {
        position: 'fixed',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        background: '#1f2937',
        border: '1px solid rgba(121, 182, 72, 0.55)',
        color: '#ffffff',
        padding: '6px 8px 6px 8px',
        borderRadius: '20px',
        fontSize: '12px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        fontWeight: '600',
        lineHeight: '1',
        zIndex: '2147483647',
        boxShadow: '0 6px 16px rgba(0, 0, 0, 0.25)',
        userSelect: 'none',
      } as Partial<CSSStyleDeclaration> as any);

      const action = document.createElement('button');
      action.type = 'button';
      action.setAttribute('aria-label', 'Send to GrovLink');
      Object.assign(action.style, {
        display: 'flex',
        alignItems: 'center',
        gap: '7px',
        background: 'none',
        border: 'none',
        color: 'inherit',
        font: 'inherit',
        fontWeight: 'inherit',
        cursor: 'pointer',
        padding: '0',
        margin: '0',
      } as Partial<CSSStyleDeclaration> as any);

      const icon = document.createElement('img');
      icon.src = chrome.runtime.getURL('grovlink-logo.svg');
      icon.alt = '';
      Object.assign(icon.style, {
        width: '18px',
        height: '18px',
        flexShrink: '0',
        display: 'block',
      } as Partial<CSSStyleDeclaration> as any);

      const label = document.createElement('span');
      label.textContent = 'Send to GrovLink';

      action.appendChild(icon);
      action.appendChild(label);

      action.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const structured = extractEventSchema();
        chrome.runtime.sendMessage({
          type: 'gl-open-panel-with-capture',
          payload: {
            kind: 'selection',
            text,
            pageUrl: location.href,
            pageTitle: document.title,
            structuredStartDate: structured?.startDate,
            structuredEndDate: structured?.endDate,
          },
        });
        removeBubble();
      });

      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.setAttribute('aria-label', 'Dismiss Send to GrovLink');
      closeBtn.textContent = '×';
      Object.assign(closeBtn.style, {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '20px',
        height: '20px',
        flexShrink: '0',
        background: 'none',
        border: 'none',
        color: 'rgba(255, 255, 255, 0.8)',
        cursor: 'pointer',
        fontSize: '17px',
        lineHeight: '1',
        padding: '0',
        margin: '0 0 0 2px',
        borderRadius: '50%',
      } as Partial<CSSStyleDeclaration> as any);

      closeBtn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dismissedSelectionText = text;
        removeBubble();
      });

      bubble.appendChild(action);
      bubble.appendChild(closeBtn);
      positionBubble(rect);
      document.body.appendChild(bubble);
    }

    function handleSelectionChange() {
      const rect = currentSelectionRect();
      if (!rect) {
        removeBubble();
        dismissedSelectionText = null;
        return;
      }

      const text = window.getSelection()?.toString().trim() ?? '';
      if (!canShowBubble()) {
        removeBubble();
        return;
      }
      if (dismissedSelectionText === text) {
        removeBubble();
        return;
      }

      showBubble(rect, text);
    }

    document.addEventListener('selectionchange', () => {
      void refreshBubbleSettings().then(handleSelectionChange);
    });

    document.addEventListener('mousedown', (e) => {
      if (bubble && !bubble.contains(e.target as Node)) removeBubble();
    });

    window.addEventListener(
      'scroll',
      () => {
        if (!bubble || repositionScheduled) return;
        repositionScheduled = true;
        requestAnimationFrame(() => {
          repositionScheduled = false;
          const rect = currentSelectionRect();
          if (rect) {
            positionBubble(rect);
          } else {
            removeBubble();
          }
        });
      },
      true,
    );
  },
});
