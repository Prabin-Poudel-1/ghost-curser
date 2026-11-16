import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { CursorOverlay } from '../../src/content/overlay';
describe('isolated cursor rendering', () => {
  let overlay: CursorOverlay;
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: [
        'setTimeout',
        'clearTimeout',
        'requestAnimationFrame',
        'cancelAnimationFrame',
      ],
    });
    overlay = new CursorOverlay();
  });
  afterEach(() => {
    overlay.destroy();
    vi.useRealTimers();
  });
  it('renders an SVG cursor and treats participant names as text', () => {
    overlay.move(
      'p',
      { x: 0.5, y: 0.5 },
      { id: 'p', name: '<img src=x>', color: 0 },
    );
    vi.advanceTimersByTime(20);
    expect(overlay.shadow.querySelector('svg')).not.toBeNull();
    expect(overlay.shadow.querySelector('img')).toBeNull();
    expect(overlay.shadow.querySelector('.label')?.textContent).toBe(
      '<img src=x>',
    );
    expect(overlay.host.style.pointerEvents).toBe('none');
    expect(
      overlay.shadow.querySelector<HTMLElement>('.cursor')?.style.transform,
    ).toContain('translate3d');
  });
  it('hides inactive cursors, revives on movement, and removes disconnected peers', () => {
    const p = { id: 'p', name: 'Ada', color: 0 };
    overlay.move('p', { x: 0, y: 0 }, p);
    vi.advanceTimersByTime(6100);
    expect(overlay.shadow.querySelector<HTMLElement>('.cursor')?.hidden).toBe(
      true,
    );
    overlay.move('p', { x: 1, y: 1 }, p);
    expect(overlay.shadow.querySelector<HTMLElement>('.cursor')?.hidden).toBe(
      false,
    );
    overlay.remove('p');
    expect(overlay.shadow.querySelector('.cursor')).toBeNull();
  });
  it('removes all DOM and scheduled work on destruction', () => {
    overlay.move('p', { x: 0, y: 0 }, { id: 'p', name: 'Ada', color: 0 });
    overlay.destroy();
    expect(document.querySelector('[data-ghostcursor]')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
});
