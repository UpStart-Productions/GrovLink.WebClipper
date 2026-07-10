interface StructuredEventData {
  startDate?: string;
  endDate?: string;
}

function isEventType(type: unknown): boolean {
  if (typeof type === 'string') return type === 'Event' || type.endsWith('Event');
  if (Array.isArray(type)) return type.some(isEventType);
  return false;
}

// JSON-LD often wraps the real content in an array, or in an @graph list
// (Google's recommended pattern for pages with multiple structured blocks) --
// walk a few levels deep (capped, since this is arbitrary third-party JSON)
// looking for the first node whose @type is (or includes) "Event".
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

// Most event listing platforms (Eventbrite, Facebook Events, Meetup,
// WordPress/Squarespace event plugins) embed schema.org/Event data as JSON-LD
// for SEO -- exact ISO date strings, no natural-language ambiguity. Reading
// this directly is far more reliable than trying to parse a date back out of
// the rendered page text, so the side panel tries this first and only falls
// back to chrono-node text parsing when a page doesn't have it.
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

// This is the whole point of the extension, per the strategy brief: a floating
// action that appears the instant you select text, with no need to open a panel
// first. Pinterest's clipper doesn't have this -- it only works page-level.
export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    let bubble: HTMLDivElement | null = null;
    let repositionScheduled = false;

    // Answers the side panel's / background script's request for this page's
    // structured event data (see requestStructuredEventData() in lib/capture.ts).
    // Synchronous, so no need to return true / keep the message channel open.
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

    // Null when there's no selection worth showing a bubble for (too short,
    // or the range has zero size -- e.g. a collapsed cursor with no drag).
    function currentSelectionRect(): DOMRect | null {
      const sel = window.getSelection();
      const text = sel?.toString().trim() ?? '';
      if (!sel || sel.rangeCount === 0 || text.length < 8) return null;
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return null;
      return rect;
    }

    function showBubble(rect: DOMRect, text: string) {
      removeBubble();
      bubble = document.createElement('div');
      Object.assign(bubble.style, {
        position: 'fixed',
        display: 'flex',
        alignItems: 'center',
        gap: '7px',
        background: '#1f2937',
        border: '1px solid rgba(121, 182, 72, 0.55)',
        color: '#ffffff',
        padding: '6px 14px 6px 8px',
        borderRadius: '20px',
        fontSize: '12px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        fontWeight: '600',
        lineHeight: '1',
        cursor: 'pointer',
        zIndex: '2147483647',
        boxShadow: '0 6px 16px rgba(0, 0, 0, 0.25)',
        userSelect: 'none',
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

      bubble.appendChild(icon);
      bubble.appendChild(label);
      positionBubble(rect);

      bubble.addEventListener('mousedown', (e) => {
        // Prevent the click from collapsing the selection before we read it.
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

      document.body.appendChild(bubble);
    }

    document.addEventListener('selectionchange', () => {
      const rect = currentSelectionRect();
      if (!rect) {
        removeBubble();
        return;
      }
      showBubble(rect, window.getSelection()!.toString().trim());
    });

    document.addEventListener('mousedown', (e) => {
      if (bubble && e.target !== bubble) removeBubble();
    });

    // Scrolling shouldn't dismiss the bubble on its own -- only the selection
    // clearing should. Follow the selection's new position each frame instead;
    // only remove it if the selection itself is actually gone.
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
