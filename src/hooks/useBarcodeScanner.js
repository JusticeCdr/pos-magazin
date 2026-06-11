import { useEffect, useRef } from 'react';

export function useBarcodeScanner(onScan, active = true) {
  // Keep onScan in a ref so the effect only registers ONCE (no listener thrash on every render)
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (!active) return;

    let buffer = '';
    let lastKeyTime = Date.now();
    let pendingChar = null;  // { key, target }
    let pendingTimer = null;

    // Safely inject a single character into a focused input (React-compatible)
    const injectChar = (target, char) => {
      try {
        if (!target || !document.body.contains(target)) return;
        if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') return;

        const proto = target.tagName === 'TEXTAREA'
          ? window.HTMLTextAreaElement.prototype
          : window.HTMLInputElement.prototype;

        const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
        if (!descriptor || !descriptor.set) return;

        const s = (target.selectionStart != null) ? target.selectionStart : target.value.length;
        const e = (target.selectionEnd   != null) ? target.selectionEnd   : s;
        const newVal = target.value.slice(0, s) + char + target.value.slice(e);

        descriptor.set.call(target, newVal);
        target.dispatchEvent(new Event('input', { bubbles: true }));

        try { target.setSelectionRange(s + 1, s + 1); } catch (_) {}
      } catch (_) {
        // Never crash the app due to injection failure — silently ignore
      }
    };

    const flushPending = () => {
      if (pendingTimer) {
        clearTimeout(pendingTimer);
        pendingTimer = null;
      }
      if (pendingChar) {
        const { key, target } = pendingChar;
        pendingChar = null;
        injectChar(target, key);
      }
    };

    const handleKeyDown = (e) => {
      try {
        // Never intercept control shortcuts
        if (e.ctrlKey || e.altKey || e.metaKey) return;

        const now  = Date.now();
        const diff = now - lastKeyTime;
        lastKeyTime = now;

        if (e.key.length === 1) {
          if (diff > 40) {
            // ── Slow keystroke — likely a human typing ───────────────────
            flushPending();

            const target  = e.target;
            const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';

            if (isInput) {
              // Hold the char for 40 ms; inject it back if no scanner char follows
              e.preventDefault();
              e.stopPropagation();

              pendingChar  = { key: e.key, target };
              pendingTimer = setTimeout(flushPending, 40);
            } else {
              // Not in an input — treat as potential first char of a barcode
              buffer = e.key;
            }
          } else {
            // ── Fast keystroke — scanner speed ───────────────────────────
            e.preventDefault();
            e.stopPropagation();

            // If a pending char exists, it was really the first scan char — reclaim it
            if (pendingChar) {
              buffer = pendingChar.key;
              pendingChar = null;
              if (pendingTimer) { clearTimeout(pendingTimer); pendingTimer = null; }
            }

            buffer += e.key;
          }

        } else if (e.key === 'Enter') {
          flushPending();

          if (buffer.length > 3) {
            e.preventDefault();
            e.stopPropagation();
            onScanRef.current(buffer);
          }
          buffer = '';

        } else {
          // Any other special key — flush human char and reset scan buffer
          flushPending();
          buffer = '';
        }

      } catch (_) {
        // Catch-all: never let scanner logic crash the React app
        buffer = '';
      }
    };

    window.addEventListener('keydown', handleKeyDown, true); // capture phase

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      if (pendingTimer) clearTimeout(pendingTimer);
    };
  }, [active]); // Re-register listener only when active state changes
}
