import { Connection } from '../../networking/connection';
import { NoteStore } from '../../collaboration/notes';
import { LaserSampler } from '../../collaboration/laser';
import type {
  FeatureMessage,
  DomAnchor,
} from '../../networking/collaboration-protocol';
import type { Participant, SessionState } from '../../shared/types';
import { normalize } from '../../networking/protocol';
import { CursorOverlay } from '../overlay';
import { Effects } from './effects';
import { Toolbar, type Tool } from './toolbar';
import { NoteView } from './note-view';
import {
  createAnchor,
  anchorTarget,
  extensionTarget,
  sensitiveTarget,
} from './anchors';
import { styles } from './styles';
export class Collaboration {
  readonly host = document.createElement('div');
  readonly shadow: ShadowRoot;
  readonly store = new NoteStore();
  readonly effects: Effects;
  readonly toolbar: Toolbar;
  readonly notes: NoteView;
  private abort = new AbortController();
  private tool: Tool = 'cursor';
  private sequence = 0;
  private lastClick = -Infinity;
  private sampler: LaserSampler;
  private localStroke: string | undefined;
  private people = new Map<string, Participant>();
  private peerOwners = new Map<string, string>();
  private synced = new Set<string>();
  private target: HTMLElement | null = null;
  private highlight = document.createElement('div');
  private toast = document.createElement('div');
  private toastTimer: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;
  private noteQueue = Promise.resolve();
  private queued = 0;
  constructor(
    private connection: Connection,
    private cursors: CursorOverlay,
    leave: () => void,
  ) {
    this.host.dataset.ghostcursor = 'collaboration';
    this.host.style.cssText =
      'all:initial!important;position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;pointer-events:none!important;z-index:2147483646!important;';
    this.shadow = this.host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = styles;
    this.shadow.append(style);
    document.documentElement.append(this.host);
    this.effects = new Effects(this.shadow);
    this.highlight.className = 'target-highlight';
    this.highlight.hidden = true;
    this.toast.className = 'toast';
    this.toast.hidden = true;
    this.toast.setAttribute('role', 'status');
    this.shadow.append(this.highlight, this.toast);
    this.sampler = new LaserSampler(
      (m) => this.localTransient(m),
      () => this.sequence++,
    );
    this.notes = new NoteView(this.shadow, {
      create: (text, anchor) => this.create(text, anchor),
      edit: (id, text) => this.edit(id, text),
      delete: (id) => this.delete(id),
    });
    this.toolbar = new Toolbar(this.shadow, {
      tool: (t) => {
        this.sampler.end();
        this.tool = t;
        this.highlight.hidden = true;
        this.target = null;
      },
      clear: () => {
        this.sampler.clear();
        this.localStroke = undefined;
        this.effects.clear();
        this.send({ v: 2, t: 'laser_clear', seq: this.sequence++ });
      },
      visibility: (v) => this.cursors.setVisible(v),
      leave,
    });
    const options = { signal: this.abort.signal, passive: true };
    window.addEventListener(
      'pointerdown',
      (e) => {
        if (
          !e.isTrusted ||
          this.tool !== 'laser' ||
          e.button !== 0 ||
          sensitiveTarget(e.target)
        )
          return;
        const p = normalize(e.clientX, e.clientY, innerWidth, innerHeight);
        if (p) this.sampler.start(p);
      },
      options,
    );
    window.addEventListener(
      'pointermove',
      (e) => {
        if (!e.isTrusted) return;
        const safe = !sensitiveTarget(e.target);
        if (this.tool === 'laser') {
          if (!safe || !(e.buttons & 1)) {
            this.sampler.end();
            return;
          }
          const p = normalize(e.clientX, e.clientY, innerWidth, innerHeight);
          if (p) {
            this.sampler.move(p);
            const self = this.self();
            if (self?.sessionId && this.localStroke)
              this.effects.move(self.sessionId, this.localStroke, [p]);
          }
        }
        if (this.tool === 'note') {
          this.target =
            safe && e.target instanceof HTMLElement
              ? anchorTarget(e.target)
              : null;
          this.highlight.hidden = !this.target;
          if (this.target) {
            const r = this.target.getBoundingClientRect();
            Object.assign(this.highlight.style, {
              left: r.left + 'px',
              top: r.top + 'px',
              width: r.width + 'px',
              height: r.height + 'px',
            });
          }
        }
      },
      options,
    );
    window.addEventListener('pointerup', () => this.sampler.end(), options);
    window.addEventListener('pointercancel', () => this.sampler.end(), options);
    window.addEventListener('blur', () => this.sampler.end(), options);
    document.addEventListener(
      'visibilitychange',
      () => {
        if (document.hidden) {
          this.sampler.end();
          this.effects.clear();
        }
      },
      options,
    );
    window.addEventListener(
      'click',
      (e) => {
        if (!e.isTrusted || sensitiveTarget(e.target)) return;
        if (this.tool === 'note' && e.target instanceof HTMLElement) {
          this.select(e.target);
          return;
        }
        if (this.tool !== 'cursor' || performance.now() - this.lastClick < 200)
          return;
        this.lastClick = performance.now();
        const p = normalize(e.clientX, e.clientY, innerWidth, innerHeight);
        if (p)
          this.localTransient({ v: 2, t: 'click', seq: this.sequence++, ...p });
      },
      options,
    );
    window.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Escape') {
          this.toolbar.setTool('cursor');
          this.notes.cancelDraft();
        }
        if (
          e.key === 'Enter' &&
          this.tool === 'note' &&
          this.target &&
          !extensionTarget(e.target) &&
          !sensitiveTarget(e.target)
        ) {
          e.preventDefault();
          this.select(this.target);
        }
      },
      { signal: this.abort.signal },
    );
    window.addEventListener('resize', () => this.effects.resize(), options);
  }
  private self() {
    return this.connection.snapshot().self;
  }
  private owner() {
    const sid = this.self()?.sessionId;
    if (!sid) throw new Error('Wait for the room to start.');
    return sid;
  }
  state(state: SessionState) {
    if (state.self?.sessionId)
      this.people.set(state.self.sessionId, state.self);
    for (const p of state.participants)
      if (p.sessionId) this.people.set(p.sessionId, p);
    this.renderNotes();
  }
  private renderNotes() {
    const self = this.self();
    if (self?.sessionId) this.people.set(self.sessionId, self);
    this.notes.render(this.store.all(), self?.sessionId ?? '', this.people);
  }
  private select(target: HTMLElement) {
    target = anchorTarget(target);
    const anchor = createAnchor(target);
    if (!anchor) {
      this.notice(
        'This element cannot be annotated safely. Choose a non-form element.',
      );
      return;
    }
    this.toolbar.setTool('cursor');
    this.notes.create(anchor, target);
  }
  private create(text: string, anchor: DomAnchor) {
    const note = this.store.create(this.owner(), text, anchor);
    this.renderNotes();
    this.enqueue({ v: 2, t: 'note_create', note });
  }
  private edit(id: string, text: string) {
    const note = this.store.edit(this.owner(), id, text);
    this.renderNotes();
    this.enqueue({ v: 2, t: 'note_update', note });
  }
  private delete(id: string) {
    const note = this.store.delete(this.owner(), id);
    if (note && 'deleted' in note) {
      this.renderNotes();
      this.enqueue({ v: 2, t: 'note_delete', note });
    }
  }
  private send(message: FeatureMessage, target?: string) {
    if (!this.disposed)
      void this.connection
        .sendFeature(message, target)
        .catch(() =>
          this.notice(
            'A collaboration update could not be delivered. Retry the connection.',
          ),
        );
  }
  private enqueue(message: FeatureMessage, target?: string) {
    if (this.queued >= 128) {
      this.notice(
        'Too many pending note updates. Wait for the network, then retry.',
      );
      return;
    }
    this.queued++;
    this.noteQueue = this.noteQueue
      .then(async () => {
        if (!this.disposed) await this.connection.sendFeature(message, target);
      })
      .catch(() =>
        this.notice(
          'A note update could not be delivered. Retry to synchronize.',
        ),
      )
      .finally(() => {
        this.queued--;
      });
  }
  private localTransient(message: FeatureMessage) {
    const self = this.self();
    if (!self?.sessionId) return;
    if (message.t === 'laser_start') this.localStroke = message.stroke;
    if (message.t !== 'laser_move') this.paint(message, self, self.sessionId);
    if (message.t === 'laser_end') this.localStroke = undefined;
    this.send(message);
  }
  private paint(message: FeatureMessage, person: Participant, owner: string) {
    if (message.t === 'click') this.effects.click(owner, message, person.color);
    if (message.t === 'laser_start')
      this.effects.start(owner, message.stroke, message, person.color);
    if (message.t === 'laser_move')
      this.effects.move(owner, message.stroke, message.points);
    if (message.t === 'laser_end') this.effects.end(owner, message.stroke);
    if (message.t === 'laser_clear') this.effects.clear(owner);
  }
  receive(message: FeatureMessage, person: Participant) {
    const owner = person.sessionId;
    if (!owner) return;
    this.people.set(owner, person);
    this.peerOwners.set(person.id, owner);
    if (message.t === 'participant') {
      this.renderNotes();
      if (!this.synced.has(person.id)) {
        this.synced.add(person.id);
        for (const note of this.store.own(this.owner()))
          this.enqueue({ v: 2, t: 'note_sync', note }, person.id);
      }
      return;
    }
    if (message.t.startsWith('note_') && 'note' in message) {
      if (this.store.merge(owner, message.note)) this.renderNotes();
      return;
    }
    if (
      message.t === 'click' &&
      sensitiveTarget(
        document.elementFromPoint(
          message.x * innerWidth,
          message.y * innerHeight,
        ),
      )
    )
      return;
    if (!document.hidden) this.paint(message, person, owner);
  }
  remove(peer: string) {
    const owner = this.peerOwners.get(peer);
    if (owner) {
      const name = this.people.get(owner)?.name ?? 'A participant';
      this.notice(`${name} left the session.`);
      this.store.removeAuthor(owner);
      this.effects.clear(owner);
      this.people.delete(owner);
    }
    this.peerOwners.delete(peer);
    this.synced.delete(peer);
    this.renderNotes();
  }
  private notice(text: string) {
    if (this.disposed) return;
    this.toast.textContent = text;
    this.toast.hidden = false;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.toast.hidden = true;
    }, 5000);
  }
  stats() {
    return {
      ...this.effects.stats(),
      ...this.notes.stats(),
      notes: this.store.all().length,
    };
  }
  destroy() {
    this.disposed = true;
    this.abort.abort();
    this.sampler.destroy();
    this.localStroke = undefined;
    this.toolbar.destroy();
    this.effects.destroy();
    this.notes.destroy();
    this.store.clear();
    this.people.clear();
    this.peerOwners.clear();
    this.synced.clear();
    clearTimeout(this.toastTimer);
    this.host.remove();
  }
}
