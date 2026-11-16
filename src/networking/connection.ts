import { MAX_AUTO_RETRIES, retryDelay } from './retry';
import { randomId } from '../shared/security';
import {
  CONNECT_TIMEOUT_MS,
  HEARTBEAT_MS,
  MAX_PARTICIPANTS,
  PEER_TIMEOUT_MS,
  COLORS,
} from '../shared/constants';
import { parseInvitation, pageIdentity, validName } from '../shared/security';
import {
  emptyState,
  type Participant,
  type Point,
  type SessionState,
} from '../shared/types';
import { encodeMessage, type Message } from './protocol';
import {
  decodeWireMessage,
  decodeFeature,
  type FeatureMessage,
} from './collaboration-protocol';
import type { Transport, TransportFactory } from './transport';
interface Peer {
  participant?: Participant;
  boundSession?: string;
  incompatible?: boolean;
  seen: number;
  seq: number;
  window: number;
  count: number;
  profileRev: number;
  featureSeq: number;
}
export interface SessionEvents {
  state(state: SessionState): void;
  cursor(id: string, point: Point, participant: Participant): void;
  hide(id: string): void;
  remove(id: string): void;
  end?(): void;
  beforeRetry?(): Promise<void>;
  feature?(message: FeatureMessage, participant: Participant): void;
}
export class Connection {
  private state: SessionState = emptyState();
  private transport?: Transport;
  private peers = new Map<string, Peer>();
  private timer?: ReturnType<typeof setInterval>;
  private generation = 0;
  private started = 0;
  private heartbeat = 0;
  private sequence = 0;
  private sending = false;
  private page = '';
  private profileRevision = 0;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private retryAttempts = 0;
  private restarting = false;
  private stableSince = 0;

  constructor(
    private factory: TransportFactory,
    private events: SessionEvents,
    private now: () => number = Date.now,
  ) {}
  snapshot(): SessionState {
    return { ...this.state, participants: [...this.state.participants] };
  }
  private emit() {
    this.state.participants = [...this.peers.values()].flatMap((p) =>
      p.participant ? [p.participant] : [],
    );
    this.events.state(this.snapshot());
  }
  async start(
    invitation: string,
    name: string,
    color: number,
    url: string,
    preserveIdentity = false,
  ): Promise<void> {
    parseInvitation(invitation);
    const sessionId = preserveIdentity ? this.state.self?.sessionId : undefined;
    if (!preserveIdentity) {
      this.profileRevision = 0;
      this.retryAttempts = 0;
    }
    clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    const generation = ++this.generation;
    const closing = this.dispose();
    this.page = pageIdentity(url);
    this.state = {
      status: 'connecting',
      invitation,
      self: {
        id: 'self',
        name,
        color,
        sessionId: sessionId ?? randomId(),
      },
      participants: [],
    };
    this.started = this.now();
    this.heartbeat = this.now();
    this.sequence = 0;
    this.emit();
    try {
      await closing;
      if (generation !== this.generation) return;
      const current = () => generation === this.generation;
      this.transport = this.factory(this.page, invitation, {
        join: (id) => {
          if (current()) this.join(id);
        },
        leave: (id) => {
          if (current()) this.remove(id);
        },
        message: (raw, id) => {
          if (current()) this.receive(raw, id);
        },
        error: (message, terminal, recoverable) => {
          if (current()) this.fail(message, terminal, recoverable);
        },
        ended: () => {
          if (current()) {
            this.leave();
            this.events.end?.();
          }
        },
      });
      this.timer = setInterval(() => this.tick(), 1000);
    } catch {
      if (generation === this.generation)
        this.fail('Could not start the private session. Leave and try again.');
    }
  }
  private join(id: string) {
    if (this.peers.has(id) || this.peers.size >= MAX_PARTICIPANTS - 1) return;
    this.peers.set(id, {
      seen: this.now(),
      seq: -1,
      window: this.now(),
      count: 0,
      profileRev: -1,
      featureSeq: -1,
    });
    this.hello(id);
  }
  private hello(id?: string) {
    const self = this.state.self;
    if (self) this.send({ v: 1, t: 'compat', min: 1, max: 2 }, id);
    if (self)
      this.send({ v: 1, t: 'hello', name: self.name, color: self.color }, id);
    if (self?.sessionId)
      this.send(
        {
          v: 2,
          t: 'participant',
          sid: self.sessionId,
          rev: this.profileRevision,
          name: self.name,
          color: self.color,
        },
        id,
      );
  }
  private send(message: Message | FeatureMessage, target?: string) {
    const generation = this.generation;
    void this.transport?.send(JSON.stringify(message), target).catch(() => {
      if (generation === this.generation)
        this.fail(
          'A peer connection was interrupted. Discovery continues; retry if it does not recover.',
        );
    });
  }
  private receive(raw: unknown, id: string) {
    const peer = this.peers.get(id);
    if (!peer) return;
    const now = this.now();
    if (now - peer.window >= 1000) {
      peer.window = now;
      peer.count = 0;
    }
    if (++peer.count > 60) return;
    const message = decodeWireMessage(raw);
    if (!message) return;
    if (message.v === 1 && message.t === 'compat') {
      peer.incompatible = message.min > 2 || message.max < 1;
      if (peer.incompatible) {
        peer.participant = undefined;
        this.events.remove(id);
        this.state.error =
          'Incompatible GhostCursor protocol. Ask this participant to update their extension.';
        if (![...this.peers.values()].some((p) => p.participant))
          this.state.status = 'disconnected';
        this.emit();
      }
      return;
    }
    if (peer.incompatible) return;
    if (message.v === 2) {
      if (!peer.participant) return;
      if (message.t === 'participant') {
        if (
          message.sid === this.state.self?.sessionId ||
          [...this.peers.values()].some(
            (p) => p !== peer && p.boundSession === message.sid,
          )
        )
          return;
        if (peer.boundSession && peer.boundSession !== message.sid) return;
        if (peer.participant.sessionId && message.rev <= peer.profileRev)
          return;
        peer.boundSession = message.sid;
        peer.seen = now;
        peer.profileRev = message.rev;
        peer.participant = {
          ...peer.participant,
          sessionId: message.sid,
          name: message.name,
        };
        this.emit();
        this.events.feature?.(message, peer.participant);
        return;
      }
      if (!peer.participant.sessionId) return;
      if ('seq' in message) {
        if (message.seq <= peer.featureSeq) return;
        peer.featureSeq = message.seq;
      }
      peer.seen = now;
      this.events.feature?.(message, peer.participant);
      return;
    }
    if (message.t === 'bye') {
      this.remove(id);
      return;
    }
    if (message.t === 'hello') {
      peer.seen = now;
      clearTimeout(this.retryTimer);
      this.retryTimer = undefined;
      delete this.state.retryAt;
      if (!this.stableSince) this.stableSince = now;
      if (!peer.participant) {
        const occupied = new Set([
          this.state.self?.color,
          ...[...this.peers.values()].map((p) => p.participant?.color),
        ]);
        const color = occupied.has(message.color)
          ? COLORS.findIndex((_, i) => !occupied.has(i))
          : message.color;
        peer.participant = {
          id,
          name: message.name,
          color: Math.max(0, color),
        };
      }
      this.state.status = 'connected';
      delete this.state.error;
      this.emit();
      return;
    }
    if (!peer.participant) return;
    peer.seen = now;
    if (message.t === 'hide') this.events.hide(id);
    if (message.t === 'cursor' && message.seq > peer.seq) {
      peer.seq = message.seq;
      this.events.cursor(id, message, peer.participant);
    }
  }
  private remove(id: string) {
    if (!this.peers.delete(id)) return;
    this.events.remove(id);
    if (![...this.peers.values()].some((p) => p.participant)) {
      this.stableSince = 0;
      this.state.status = 'connecting';
      this.started = this.now();
      this.state.error =
        'No peers connected. Waiting for a participant to return.';
    }
    this.emit();
  }
  private fail(message: string, terminal = false, recoverable = false) {
    if (terminal) {
      ++this.generation;
      this.dispose();
      this.state.status = 'disconnected';
    }
    this.stableSince = 0;
    this.state.error = message;
    if (recoverable) this.scheduleRetry();
    if (!this.state.participants.length) this.state.status = 'disconnected';
    this.emit();
  }
  private scheduleRetry() {
    if (this.retryTimer || this.restarting || !this.state.invitation) return;
    if (this.retryAttempts >= MAX_AUTO_RETRIES) {
      this.state.error =
        'Automatic recovery stopped after 4 attempts. Check your network and choose Retry connection.';
      return;
    }
    const delay = retryDelay(this.retryAttempts++);
    this.state.retryAt = this.now() + delay;
    this.state.retryAttempt = this.retryAttempts;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      void this.restart(false);
    }, delay);
  }
  private async restart(manual: boolean) {
    if (this.restarting) return;
    const { invitation, self } = this.state;
    if (!invitation || !self) return;
    this.restarting = true;
    const generation = this.generation;
    if (manual) this.retryAttempts = 0;
    try {
      await this.events.beforeRetry?.();
      if (generation !== this.generation) return;
      await this.start(invitation, self.name, self.color, this.page, true);
    } catch {
      this.state.error =
        'Could not restore the extension networking context. Reopen the popup and retry.';
      this.emit();
    } finally {
      this.restarting = false;
    }
  }
  private tick() {
    const now = this.now();
    if (this.stableSince && now - this.stableSince > 60000)
      this.retryAttempts = 0;
    for (const [id, peer] of this.peers) {
      if (now - peer.seen > PEER_TIMEOUT_MS && peer.participant) {
        peer.participant = undefined;
        this.events.remove(id);
        if (![...this.peers.values()].some((p) => p.participant)) {
          this.state.status = 'connecting';
          this.started = now;
          this.state.error =
            'Peer presence timed out. Waiting for reconnection.';
        }
        this.emit();
      }
    }
    if (now - this.heartbeat >= HEARTBEAT_MS) {
      this.heartbeat = now;
      this.hello(); // Also repairs a lost initial hello.
      this.send({ v: 1, t: 'beat' });
    }
    if (
      !this.state.participants.length &&
      now - this.started > CONNECT_TIMEOUT_MS &&
      this.state.status === 'connecting'
    ) {
      this.fail(
        'No peer connected yet. Check the invitation and matching page. Signaling or direct WebRTC may be blocked; retry or try another network.',
        false,
        this.retryAttempts > 0,
      );
    }
  }
  cursor(point: Point) {
    if (!this.transport || !this.state.participants.length || this.sending)
      return;
    this.sending = true;
    const generation = this.generation;
    void this.transport
      .send(
        encodeMessage({ v: 1, t: 'cursor', seq: this.sequence++, ...point }),
      )
      .catch(() => {
        if (generation === this.generation)
          this.fail('Cursor delivery failed.', false, true);
      })
      .finally(() => {
        if (generation === this.generation) this.sending = false;
      });
  }
  rename(name: string) {
    if (!validName(name) || !this.state.self) return;
    this.state.self = { ...this.state.self, name };
    this.profileRevision++;
    this.hello();
    this.emit();
  }
  async sendFeature(message: FeatureMessage, target?: string): Promise<void> {
    if (!decodeFeature(JSON.stringify(message)))
      throw new Error('Invalid collaboration message');
    const transport = this.transport;
    if (!transport) return;
    const recipients = [...this.peers]
      .filter(
        ([id, peer]) =>
          peer.participant?.sessionId && (!target || id === target),
      )
      .map(([id]) => id);
    await Promise.all(
      recipients.map((id) => transport.send(JSON.stringify(message), id)),
    );
  }
  hide() {
    this.send({ v: 1, t: 'hide' });
  }
  async retry() {
    await this.restart(true);
  }
  leave() {
    clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    this.retryAttempts = 0;
    this.stableSince = 0;
    this.send({ v: 1, t: 'bye' });
    ++this.generation;
    this.dispose();
    this.page = '';
    this.state = emptyState();
    this.emit();
  }
  private dispose() {
    clearInterval(this.timer);
    this.timer = undefined;
    const transport = this.transport;
    this.transport = undefined;
    const closed = transport?.close().catch(() => {});
    for (const id of this.peers.keys()) this.events.remove(id);
    this.peers.clear();
    this.sending = false;
    return closed;
  }
}
