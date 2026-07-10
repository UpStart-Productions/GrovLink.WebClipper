// This is the whole point of the extension, per the strategy brief: a floating
// action that appears the instant you select text, with no need to open a panel
// first. Pinterest's clipper doesn't have this -- it only works page-level.
export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    let bubble: HTMLDivElement | null = null;

    function removeBubble() {
      bubble?.remove();
      bubble = null;
    }

    function showBubble(rect: DOMRect, text: string) {
      removeBubble();
      bubble = document.createElement('div');
      bubble.textContent = 'Send to GrovLink';
      Object.assign(bubble.style, {
        position: 'fixed',
        left: `${Math.max(8, rect.left)}px`,
        top: `${Math.max(8, rect.top - 42)}px`,
        background: '#1f2937',
        color: '#ffffff',
        padding: '8px 14px',
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

      bubble.addEventListener('mousedown', (e) => {
        // Prevent the click from collapsing the selection before we read it.
        e.preventDefault();
        e.stopPropagation();
        chrome.runtime.sendMessage({
          type: 'gl-open-panel-with-capture',
          payload: {
            kind: 'selection',
            text,
            pageUrl: location.href,
            pageTitle: document.title,
          },
        });
        removeBubble();
      });

      document.body.appendChild(bubble);
    }

    document.addEventListener('selectionchange', () => {
      const sel = window.getSelection();
      const text = sel?.toString().trim() ?? '';
      // Short selections (a word, a stray click) aren't worth a bubble.
      if (!sel || sel.rangeCount === 0 || text.length < 8) {
        removeBubble();
        return;
      }
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        removeBubble();
        return;
      }
      showBubble(rect, text);
    });

    document.addEventListener('mousedown', (e) => {
      if (bubble && e.target !== bubble) removeBubble();
    });

    window.addEventListener('scroll', removeBubble, true);
  },
});
