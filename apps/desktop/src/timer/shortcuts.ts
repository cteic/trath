export type Shortcut = 'toggle' | 'stop';

const TYPING_TARGETS = 'input, textarea, select, button, a, [contenteditable]';

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(TYPING_TARGETS) !== null;
}

/**
 * Space starts, pauses or resumes. Cmd+Enter (Ctrl+Enter elsewhere) stops and
 * saves. Space is left alone in a text field, where it types, and on a
 * button, where it already presses the button.
 */
export function shortcutFor(event: KeyboardEvent): Shortcut | null {
  if (event.repeat) {
    return null;
  }
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    return 'stop';
  }
  const plainSpace =
    event.key === ' ' && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey;
  if (plainSpace && !isTypingTarget(event.target)) {
    return 'toggle';
  }
  return null;
}
