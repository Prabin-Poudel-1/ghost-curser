import type { OwnedNote } from '../../collaboration/notes';
import type {
  LiveNote,
  DomAnchor,
} from '../../networking/collaboration-protocol';
import type { Participant } from '../../shared/types';
import { COLORS } from '../../shared/constants';
import { resolveAnchor, sensitiveTarget } from './anchors';
interface Card {
  element: HTMLDivElement;
  note: LiveNote;
  owner: string;
  target: HTMLElement | null;
  author: HTMLSpanElement;
  time: HTMLTimeElement;
  body: HTMLDivElement;
  status: HTMLDivElement;
}
export interface NoteActions {
  create(text: string, anchor: DomAnchor): void;
  edit(id: string, text: string): void;
  delete(id: string): void;
}
export class NoteView {
  private destroyed = false;
  private cards = new Map<string, Card>();
  private frame = 0;
  private abort = new AbortController();
  private mutation: MutationObserver;
  private resize: ResizeObserver | undefined;
  private orphans = document.createElement('div');
  private draft: HTMLDivElement | undefined;
  constructor(
    private root: ShadowRoot,
    private actions: NoteActions,
  ) {
    this.orphans.className = 'orphans';
    this.orphans.setAttribute('aria-label', 'Unplaced notes');
    root.append(this.orphans);
    this.mutation = new MutationObserver(() => this.schedule());
    this.mutation.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden'],
    });
    if (typeof ResizeObserver !== 'undefined') {
      this.resize = new ResizeObserver(() => this.schedule());
      this.resize.observe(document.body);
    }
    document.addEventListener('scroll', () => this.schedule(), {
      capture: true,
      passive: true,
      signal: this.abort.signal,
    });
    window.addEventListener('resize', () => this.schedule(), {
      signal: this.abort.signal,
    });
  }
  render(notes: OwnedNote[], self: string, people: Map<string, Participant>) {
    const live = new Set<string>();
    for (const { owner, record } of notes) {
      if ('deleted' in record) continue;
      const key = owner + ':' + record.id;
      live.add(key);
      let card = this.cards.get(key);
      if (!card) {
        const element = document.createElement('div');
        element.className = 'note-card';
        element.dataset.note = record.id;
        element.dataset.owner = owner;
        const head = document.createElement('div');
        head.className = 'note-head';
        const author = document.createElement('span');
        author.className = 'note-author';
        const time = document.createElement('time');
        head.append(author, time);
        const body = document.createElement('div');
        body.className = 'note-body';
        const status = document.createElement('div');
        status.className = 'note-status';
        element.append(head, body, status);
        card = {
          element,
          note: record,
          owner,
          target: null,
          author,
          time,
          body,
          status,
        };
        this.cards.set(key, card);
        this.root.append(element);
        if (owner === self) {
          const controls = document.createElement('div');
          controls.className = 'note-actions';
          const edit = this.button('Edit note', 'Edit');
          edit.addEventListener('click', () =>
            this.editor(card!.element, card!.note.text, (text) =>
              this.actions.edit(record.id, text),
            ),
          );
          const remove = this.button('Delete note', 'Delete');
          remove.addEventListener('click', () =>
            this.actions.delete(record.id),
          );
          controls.append(edit, remove);
          element.append(controls);
        }
        body.textContent = record.text;
      }
      if (card.note !== record) {
        if (
          JSON.stringify(card.note.anchor) !== JSON.stringify(record.anchor)
        ) {
          if (card.target) this.resize?.unobserve(card.target);
          card.target = null;
        }
        card.body.textContent = record.text;
        card.element.querySelector('.note-editor')?.remove();
        card.body.hidden = false;
        card.note = record;
      }
      const person = people.get(owner);
      card.author.textContent =
        (person?.name ?? 'Participant') + (owner === self ? ' · you' : '');
      card.element.style.setProperty(
        '--color',
        COLORS[person?.color ?? 0] ?? COLORS[0],
      );
      card.time.dateTime = new Date(record.created).toISOString();
      card.time.textContent = new Date(record.created).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
    }
    for (const [key, card] of this.cards)
      if (!live.has(key)) {
        if (card.target) this.resize?.unobserve(card.target);
        card.element.remove();
        this.cards.delete(key);
      }
    this.schedule();
  }
  private button(label: string, text: string) {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-label', label);
    b.textContent = text;
    return b;
  }
  private editor(
    element: HTMLElement,
    text: string,
    save: (text: string) => void,
  ) {
    if (element.querySelector('.note-editor')) return;
    const form = document.createElement('div');
    form.className = 'note-editor';
    const textarea = document.createElement('textarea');
    textarea.maxLength = 600;
    textarea.setAttribute('aria-label', 'Note text');
    textarea.value = text;
    const error = document.createElement('div');
    error.className = 'note-error';
    error.setAttribute('role', 'alert');
    const actions = document.createElement('div');
    actions.className = 'note-actions';
    const submit = this.button('Save note', 'Share note');
    const cancel = this.button('Cancel note', 'Cancel');
    submit.addEventListener('click', () => {
      try {
        save(textarea.value.trim());
        form.remove();
      } catch (e) {
        error.textContent =
          e instanceof Error ? e.message : 'Could not save note.';
      }
    });
    cancel.addEventListener('click', () => {
      if (element === this.draft) this.cancelDraft();
      else {
        form.remove();
        const body = element.querySelector<HTMLElement>('.note-body');
        if (body) body.hidden = false;
      }
    });
    actions.append(cancel, submit);
    form.append(textarea, error, actions);
    element.append(form);
    const body = element.querySelector<HTMLElement>('.note-body');
    if (body) body.hidden = true;
    textarea.focus();
  }
  create(anchor: DomAnchor, target: HTMLElement) {
    this.cancelDraft();
    const draft = document.createElement('div');
    draft.className = 'draft-card';
    const title = document.createElement('p');
    title.className = 'draft-title';
    title.textContent = 'Leave a thought';
    draft.append(title);
    this.root.append(draft);
    this.draft = draft;
    const box = target.getBoundingClientRect();
    draft.style.left = `${Math.max(12, Math.min(box.right + 12, innerWidth - 242))}px`;
    draft.style.top = `${Math.max(12, Math.min(box.top, innerHeight - 240))}px`;
    this.editor(draft, '', (text) => {
      this.actions.create(text, anchor);
      this.cancelDraft();
    });
  }
  cancelDraft() {
    this.draft?.remove();
    this.draft = undefined;
  }
  private schedule() {
    if (!this.frame && this.cards.size)
      this.frame = requestAnimationFrame(() => this.position());
  }
  private position() {
    this.frame = 0;
    for (const card of this.cards.values()) {
      if (!card.target?.isConnected || sensitiveTarget(card.target)) {
        if (card.target) this.resize?.unobserve(card.target);
        card.target = resolveAnchor(card.note.anchor);
        if (card.target) this.resize?.observe(card.target);
      }
      if (!card.target) {
        card.status.textContent = 'Target unavailable · unplaced note';
        card.element.hidden = false;
        if (card.element.parentNode !== this.orphans)
          this.orphans.append(card.element);
        continue;
      }
      card.status.textContent = '';
      if (card.element.parentNode !== this.root) this.root.append(card.element);
      const box = card.target.getBoundingClientRect();
      const visible =
        box.width > 0 &&
        box.height > 0 &&
        box.bottom > 0 &&
        box.top < innerHeight &&
        box.right > 0 &&
        box.left < innerWidth;
      card.element.hidden = !visible;
      card.element.style.left = `${Math.max(12, Math.min(box.left + box.width * card.note.anchor.offset.x + 12, innerWidth - 242))}px`;
      card.element.style.top = `${Math.max(12, Math.min(box.top + box.height * card.note.anchor.offset.y, innerHeight - 200))}px`;
    }
  }
  stats() {
    return {
      cards: this.cards.size,
      frames: this.frame ? 1 : 0,
      observers: this.destroyed ? 0 : 1 + (this.resize ? 1 : 0),
    };
  }
  destroy() {
    this.destroyed = true;
    this.abort.abort();
    this.mutation.disconnect();
    this.resize?.disconnect();
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.cancelDraft();
    for (const c of this.cards.values()) c.element.remove();
    this.cards.clear();
    this.orphans.remove();
  }
}
