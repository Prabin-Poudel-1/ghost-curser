export interface Point {
  x: number;
  y: number;
}
export interface Participant {
  id: string;
  name: string;
  color: number;
  sessionId?: string;
}
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';
export interface SessionState {
  status: ConnectionStatus;
  invitation?: string;
  self?: Participant;
  participants: Participant[];
  error?: string;
  retryAt?: number;
  retryAttempt?: number;
}
export const emptyState = (): SessionState => ({
  status: 'disconnected',
  participants: [],
});
export type Command =
  | { type: 'state' }
  | { type: 'leave' }
  | { type: 'retry' }
  | { type: 'rename'; name: string }
  | { type: 'start'; invitation: string; name: string; color: number };
export type Response =
  { ok: true; state: SessionState } | { ok: false; error: string };
