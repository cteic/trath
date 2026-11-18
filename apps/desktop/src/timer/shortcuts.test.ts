import { describe, expect, it } from 'vitest';

import { shortcutFor } from './shortcuts';

function key(init: KeyboardEventInit, target: Element = document.body): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { bubbles: true, ...init });
  target.dispatchEvent(event);
  return event;
}

function element(tag: string): HTMLElement {
  const node = document.createElement(tag);
  document.body.append(node);
  return node;
}

describe('shortcutFor', () => {
  it('maps Space to toggle and Cmd+Enter or Ctrl+Enter to stop', () => {
    expect(shortcutFor(key({ key: ' ' }))).toBe('toggle');
    expect(shortcutFor(key({ key: 'Enter', metaKey: true }))).toBe('stop');
    expect(shortcutFor(key({ key: 'Enter', ctrlKey: true }))).toBe('stop');
  });

  it('ignores other keys, modified Space and a held key', () => {
    expect(shortcutFor(key({ key: 'Enter' }))).toBeNull();
    expect(shortcutFor(key({ key: 'a' }))).toBeNull();
    expect(shortcutFor(key({ key: ' ', metaKey: true }))).toBeNull();
    expect(shortcutFor(key({ key: ' ', shiftKey: true }))).toBeNull();
    expect(shortcutFor(key({ key: ' ', repeat: true }))).toBeNull();
    expect(shortcutFor(key({ key: 'Enter', metaKey: true, repeat: true }))).toBeNull();
  });

  it.each(['input', 'textarea', 'select', 'button'])('leaves Space alone in a %s', (tag) => {
    const target = element(tag);

    expect(shortcutFor(key({ key: ' ' }, target))).toBeNull();
    expect(shortcutFor(key({ key: 'Enter', metaKey: true }, target))).toBe('stop');
  });
});
