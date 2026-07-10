import { useEffect, useRef } from 'react';
import Quill from 'quill';
import 'quill/dist/quill.snow.css';

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

// Thin wrapper so Long description can be a lightly formatted rich text field
// (bold/italic/lists) instead of a plain textarea, while still behaving like
// a normal controlled React input from the outside. There's no React binding
// for Quill in play here -- react-quill's peer deps are fussy with React 18 --
// so this drives the vanilla `quill` package directly instead.
export default function RichTextEditor({ value, onChange, placeholder }: RichTextEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const quillRef = useRef<Quill | null>(null);
  // Tracks the last HTML this component itself emitted via onChange, so the
  // "sync external value into the editor" effect below can tell "the user
  // typed this, it's already in the editor, nothing to do" apart from "the
  // value changed some other way (a new capture came in), push it in."
  // Without this, every keystroke would round-trip through React state and
  // reset the cursor to the start of the field.
  const lastEmittedRef = useRef(value);

  useEffect(() => {
    if (!containerRef.current) return;
    const quill = new Quill(containerRef.current, {
      theme: 'snow',
      placeholder,
      modules: {
        toolbar: [['bold', 'italic'], [{ list: 'bullet' }, { list: 'ordered' }]],
      },
    });
    if (value) {
      quill.clipboard.dangerouslyPasteHTML(value);
    }
    quill.on('text-change', () => {
      const isEmpty = quill.getText().trim().length === 0;
      const html = isEmpty ? '' : quill.root.innerHTML;
      lastEmittedRef.current = html;
      onChange(html);
    });
    quillRef.current = quill;
    return () => {
      quillRef.current = null;
    };
    // Deliberately mount-only -- Quill owns its own DOM/undo-history from here,
    // re-running this on every value change would blow that away.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const quill = quillRef.current;
    if (!quill || value === lastEmittedRef.current) return;
    lastEmittedRef.current = value;
    quill.clipboard.dangerouslyPasteHTML(value || '');
  }, [value]);

  return (
    <div className="rich-text-wrap">
      <div ref={containerRef} />
    </div>
  );
}
