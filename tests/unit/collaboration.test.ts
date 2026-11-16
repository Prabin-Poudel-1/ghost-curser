import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  decodeFeature,
  validAnchor,
  type FeatureMessage,
  type DomAnchor,
} from '../../src/networking/collaboration-protocol';
import { NoteStore } from '../../src/collaboration/notes';
import { LaserSampler } from '../../src/collaboration/laser';
import {
  createAnchor,
  resolveAnchor,
  sensitiveTarget,
} from '../../src/content/collaboration/anchors';
import { Effects } from '../../src/content/collaboration/effects';
import { Toolbar } from '../../src/content/collaboration/toolbar';
import { NoteView } from '../../src/content/collaboration/note-view';
const id = '11111111-1111-4111-8111-111111111111';
const anchor: DomAnchor = {
  v: 1,
  path: [{ tag: 'button', n: 0, count: 1 }],
  shape: [],
  offset: { x: 1, y: 0 },
};
const record = {
  id,
  rev: 1,
  created: 1000,
  updated: 1000,
  text: 'A plain note',
  anchor,
};
describe('bounded collaboration protocol', () => {
  it.each<FeatureMessage>([
    { v: 2, t: 'participant', sid: id, rev: 0, name: 'Ada', color: 2 },
    { v: 2, t: 'click', seq: 1, x: 0.3, y: 0.5 },
    { v: 2, t: 'laser_start', seq: 2, stroke: id, x: 0, y: 0 },
    { v: 2, t: 'laser_move', seq: 3, stroke: id, points: [{ x: 0.1, y: 0.2 }] },
    { v: 2, t: 'laser_end', seq: 4, stroke: id },
    { v: 2, t: 'laser_clear', seq: 5 },
    { v: 2, t: 'note_create', note: record },
    { v: 2, t: 'note_update', note: { ...record, rev: 2, text: 'Edited' } },
    { v: 2, t: 'note_delete', note: { id, rev: 3, deleted: true } },
    { v: 2, t: 'note_sync', note: record },
    { v: 2, t: 'note_sync', note: { id, rev: 3, deleted: true } },
  ])('round trips $t', (m) =>
    expect(decodeFeature(JSON.stringify(m))).toEqual(m),
  );
  it.each([
    { v: 2, t: 'click', seq: 1, x: 2, y: 0 },
    { v: 2, t: 'click', seq: 1, x: 0, y: 0, selector: '#private' },
    {
      v: 2,
      t: 'laser_move',
      seq: 1,
      stroke: id,
      points: Array.from({ length: 13 }, () => ({ x: 0, y: 0 })),
    },
    {
      v: 2,
      t: 'participant',
      sid: 'account@example.com',
      rev: 0,
      name: 'Ada',
      color: 0,
    },
    { v: 2, t: 'note_create', note: { ...record, text: 'x'.repeat(601) } },
    { v: 2, t: 'note_create', note: { ...record, text: 'bad\u202e' } },
    { v: 2, t: 'note_create', note: { ...record, owner: 'someone-else' } },
    { v: 2, t: 'note_delete', note: record },
    { v: 2, t: 'note_update', note: { id, rev: 2, deleted: true } },
    {
      v: 2,
      t: 'note_sync',
      note: { ...record, anchor: { ...anchor, selector: '#private' } },
    },
  ])('rejects malformed/untrusted messages', (m) =>
    expect(decodeFeature(JSON.stringify(m))).toBeNull(),
  );
  it('rejects non-JSON, UTF-8 oversize and private anchor fields', () => {
    expect(decodeFeature('x'.repeat(4097))).toBeNull();
    expect(decodeFeature(null)).toBeNull();
    expect(
      validAnchor({ ...anchor, path: [{ tag: ['button'], n: 0, count: 1 }] }),
    ).toBe(false);
    expect(validAnchor({ ...anchor, textQuote: 'private page contents' })).toBe(
      false,
    );
    expect(
      validAnchor({
        ...anchor,
        path: [{ tag: 'secret-value', n: 0, count: 1 }],
      }),
    ).toBe(false);
  });
});
describe('session-only author-owned notes', () => {
  it('creates edits deletes and synchronizes snapshots to a late joiner', () => {
    const a = new NoteStore(),
      b = new NoteStore();
    const n = a.create('ada', 'First', anchor, 1000);
    a.edit('ada', n.id, 'Second', 1100);
    for (const r of a.own('ada')) b.merge('ada', r);
    expect(b.all()[0]?.record).toMatchObject({ text: 'Second', rev: 2 });
    const deleted = a.delete('ada', n.id)!;
    b.merge('ada', deleted);
    expect(b.all()[0]?.record).toEqual(deleted);
    expect(b.merge('ada', n)).toBe(false);
    expect(b.merge('ada', { ...n, rev: 999 })).toBe(false);
  });
  it('isolates duplicate note IDs by authenticated author', () => {
    const s = new NoteStore();
    s.merge('a', record);
    s.merge('b', { id, rev: 100, deleted: true });
    expect(s.own('a')).toEqual([record]);
  });
  it('converges deterministically regardless of arrival order', () => {
    const a = new NoteStore(),
      b = new NoteStore();
    const x = { ...record, text: 'aaa' },
      y = { ...record, text: 'zzz' };
    a.merge('a', x);
    a.merge('a', y);
    b.merge('a', y);
    b.merge('a', x);
    expect(a.all()).toEqual(b.all());
  });
  it('bounds live records and tombstones and releases authors on departure', () => {
    const s = new NoteStore();
    for (let i = 0; i < 16; i++) {
      const n = s.create('a', 'note', anchor, 1000);
      s.delete('a', n.id);
    }
    expect(() => s.create('a', 'more', anchor)).toThrow('limit');
    expect(s.all()).toHaveLength(16);
    s.removeAuthor('a');
    expect(s.all()).toHaveLength(0);
    s.merge('a', record);
    s.clear();
    expect(s.all()).toHaveLength(0);
  });
});
describe('privacy-preserving structural anchors', () => {
  beforeEach(() => {
    document.body.innerHTML =
      '<main><button id="private-account-id" data-token="secret"><span>Private page words</span></button><p>Text</p></main>';
  });
  afterEach(() => document.body.replaceChildren());
  it('serializes only tag structure and offsets, without text, IDs or attributes', () => {
    const a = createAnchor(document.querySelector('button')!)!;
    expect(validAnchor(a)).toBe(true);
    for (const secret of ['private-account-id', 'secret', 'Private page words'])
      expect(JSON.stringify(a).includes(secret)).toBe(false);
    expect(resolveAnchor(a)).toBe(document.querySelector('button'));
  });
  it('recovers replacement nodes and ignores unrelated sibling insertions', () => {
    const old = document.querySelector('button')!;
    const a = createAnchor(old)!;
    const replacement = old.cloneNode(true) as HTMLElement;
    old.replaceWith(replacement);
    replacement.before(document.createElement('aside'));
    expect(resolveAnchor(a)).toBe(replacement);
  });
  it('orphan-falls back on ambiguous structural changes', () => {
    const old = document.querySelector('button')!;
    const a = createAnchor(old)!;
    old.before(old.cloneNode(true));
    expect(resolveAnchor(a)).toBeNull();
  });
  it('does not reattach a deleted sibling to the only survivor elsewhere', () => {
    document.body.innerHTML =
      '<main><button>First</button><button>Second</button></main><aside><button><span>Other</span></button></aside>';
    const first = document.querySelector('button')!;
    const a = createAnchor(first)!;
    first.remove();
    expect(resolveAnchor(a)).toBeNull();
  });
  it('recovers a unique child shape within its original parent after insertion', () => {
    const target = document.querySelector('button')!;
    const a = createAnchor(target)!;
    target.before(document.createElement('button'));
    expect(resolveAnchor(a)).toBe(target);
    target.parentElement!.remove();
    document.body.innerHTML =
      '<aside><button><span>Unrelated</span></button></aside>';
    expect(resolveAnchor(a)).toBeNull();
  });
  it('does not select or capture fields, form descendants, editable areas or custom shadow hosts', () => {
    document.body.innerHTML =
      '<form><button>Submit</button><input value="private"></form><div contenteditable>secret</div><private-widget></private-widget>';
    for (const el of document.body.querySelectorAll<HTMLElement>(
      'input,button,[contenteditable],private-widget',
    )) {
      expect(sensitiveTarget(el)).toBe(true);
      expect(createAnchor(el)).toBeNull();
    }
  });
});
describe('transient batching and resource cleanup', () => {
  let root: ShadowRoot;
  beforeEach(() => {
    vi.useFakeTimers();
    root = document.body
      .appendChild(document.createElement('div'))
      .attachShadow({ mode: 'open' });
  });
  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
  });
  it('throttles laser updates, caps batches, and cancels pending work', () => {
    const send = vi.fn();
    let seq = 0;
    const laser = new LaserSampler(send, () => seq++);
    laser.start({ x: 0, y: 0 });
    for (let i = 0; i < 50; i++) laser.move({ x: i / 100, y: 0.5 });
    expect(send).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(99);
    expect(send).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1]?.[0].points.length).toBeLessThanOrEqual(12);
    laser.move({ x: 0.5, y: 0.5 });
    laser.destroy();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('cleans up click animations and laser paths on expiry', () => {
    let now = 0;
    const effects = new Effects(root, () => now);
    effects.click('peer', { x: 0.5, y: 0.5 }, 1);
    effects.start('peer', id, { x: 0, y: 0 }, 1);
    effects.move('peer', id, [{ x: 0.5, y: 0.5 }]);
    vi.advanceTimersByTime(20);
    expect(root.querySelector('.ripple')).not.toBeNull();
    expect(root.querySelector('.laser')?.getAttribute('d')).toContain('L');
    now = 700;
    vi.advanceTimersByTime(20);
    expect(root.querySelector('.ripple')).toBeNull();
    now = 3100;
    vi.advanceTimersByTime(20);
    expect(effects.stats()).toMatchObject({ trails: 0, ripples: 0, frames: 0 });
    effects.destroy();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('respects reduced motion with a static ripple and prompt expiry', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    let now = 0;
    const effects = new Effects(root, () => now);
    try {
      effects.click('peer', { x: 0.5, y: 0.5 }, 0);
      vi.advanceTimersByTime(20);
      expect(root.querySelector('.ripple')?.getAttribute('r')).toBe('12');
      now = 200;
      vi.advanceTimersByTime(20);
      expect(root.querySelector('.ripple')?.getAttribute('r')).toBe('12');
      now = 351;
      vi.advanceTimersByTime(20);
      expect(root.querySelector('.ripple')).toBeNull();
    } finally {
      effects.destroy();
      vi.unstubAllGlobals();
    }
  });
  it('bounds strokes and points and clears only the requested author', () => {
    const effects = new Effects(root);
    for (let i = 0; i < 10; i++)
      effects.start('a', String(i), { x: 0, y: 0 }, 0);
    effects.start('b', id, { x: 0, y: 0 }, 1);
    effects.move(
      'b',
      id,
      Array.from({ length: 500 }, () => ({ x: 0.5, y: 0.5 })),
    );
    expect(effects.stats().trails).toBe(3);
    expect(effects.stats().points).toBe(122);
    effects.clear('a');
    expect(effects.stats().trails).toBe(1);
    effects.destroy();
    expect(root.querySelectorAll('svg')).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('supports tool switching, cursor visibility, keyboard movement and leave', () => {
    const actions = {
      tool: vi.fn(),
      clear: vi.fn(),
      visibility: vi.fn(),
      leave: vi.fn(),
    };
    const toolbar = new Toolbar(root, actions);
    root.querySelector<HTMLButtonElement>('[aria-label="Laser"]')!.click();
    expect(actions.tool).toHaveBeenLastCalledWith('laser');
    expect(
      root.querySelector('[aria-label="Laser"]')?.getAttribute('aria-pressed'),
    ).toBe('true');
    root
      .querySelector<HTMLButtonElement>('[aria-label="Hide remote cursors"]')!
      .click();
    expect(actions.visibility).toHaveBeenCalledWith(false);
    const position = toolbar.element.style.transform;
    root
      .querySelector('[aria-label="Move toolbar"]')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    expect(toolbar.element.style.transform).not.toBe(position);
    root
      .querySelector<HTMLButtonElement>('[aria-label="Leave session"]')!
      .click();
    expect(actions.leave).toHaveBeenCalledOnce();
    toolbar.destroy();
    expect(root.querySelector('.toolbar')).toBeNull();
  });
  it('renders note text safely, preserves remote ownership and disconnects observers', () => {
    const actions = { create: vi.fn(), edit: vi.fn(), delete: vi.fn() };
    const view = new NoteView(root, actions);
    view.render(
      [
        {
          owner: 'remote',
          record: { ...record, text: '<img src=x onerror=alert(1)>' },
        },
      ],
      'self',
      new Map([['remote', { id: 'remote', name: '<b>Ada</b>', color: 2 }]]),
    );
    vi.advanceTimersByTime(20);
    expect(root.querySelector('img')).toBeNull();
    expect(root.querySelector('.note-body')?.textContent).toContain('<img');
    expect(root.querySelector('[aria-label="Delete note"]')).toBeNull();
    expect(root.querySelector('.note-status')?.textContent).toContain(
      'unplaced',
    );
    view.render(
      [
        {
          owner: 'remote',
          record: { ...record, text: 'Same revision, deterministic winner' },
        },
      ],
      'self',
      new Map(),
    );
    expect(root.querySelector('.note-body')?.textContent).toBe(
      'Same revision, deterministic winner',
    );
    view.destroy();
    expect(view.stats()).toMatchObject({ cards: 0, frames: 0, observers: 0 });
    expect(vi.getTimerCount()).toBe(0);
  });
});
