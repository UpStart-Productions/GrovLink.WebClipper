import { createPortal } from 'react-dom';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

const SHOW_DELAY_MS = 1000;

export default function HoverTooltip({
  label,
  children,
  position = 'bottom',
}: {
  label: string;
  children: ReactNode;
  position?: 'top' | 'bottom';
}) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const timerRef = useRef<number | null>(null);

  const updateCoords = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setCoords({
      left: rect.left + rect.width / 2,
      top: position === 'top' ? rect.top - 8 : rect.bottom + 8,
    });
  }, [position]);

  const hide = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setVisible(false);
  }, []);

  const show = useCallback(() => {
    hide();
    timerRef.current = window.setTimeout(() => {
      updateCoords();
      setVisible(true);
    }, SHOW_DELAY_MS);
  }, [hide, updateCoords]);

  useEffect(() => {
    return () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!visible) return;
    const onScrollOrResize = () => updateCoords();
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [visible, updateCoords]);

  return (
    <>
      <span
        ref={triggerRef}
        className="hover-tooltip-trigger"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        {children}
      </span>
      {visible &&
        createPortal(
          <div
            className={`hover-tooltip hover-tooltip--${position}`}
            style={{ top: coords.top, left: coords.left }}
            role="tooltip"
          >
            {label}
          </div>,
          document.body,
        )}
    </>
  );
}
