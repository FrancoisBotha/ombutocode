/**
 * Clipboard paste support for xterm agent terminals.
 *
 * Wires Ctrl+V (and Ctrl+Shift+V) plus right-click paste — the right-click
 * convention matches Windows Terminal / PuTTY and the existing Workspace
 * terminal. Text goes through term.paste(), which normalises line endings
 * and respects bracketed-paste mode, so multi-line pastes reach CLI agents
 * as a single paste instead of line-by-line submissions.
 *
 * Call after term.open() — the listeners live on the terminal and its DOM
 * element, so they are torn down with term.dispose().
 */
export function enableTerminalPaste(term) {
  const doPaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) term.paste(text);
    } catch (err) {
      console.warn('Clipboard paste failed:', err);
    }
  };

  term.attachCustomKeyEventHandler((e) => {
    if (
      e.type === 'keydown' &&
      e.ctrlKey && !e.altKey && !e.metaKey &&
      (e.key === 'v' || e.key === 'V')
    ) {
      // preventDefault stops the browser's native paste from also firing,
      // which would double-paste.
      e.preventDefault();
      doPaste();
      return false;
    }
    return true;
  });

  if (term.element) {
    term.element.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      doPaste();
    });
  }
}
