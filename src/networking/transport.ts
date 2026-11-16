export interface TransportHandlers {
  ended?(): void;
  join(id: string): void;
  leave(id: string): void;
  message(raw: unknown, id: string): void;
  error(message: string, terminal?: boolean, recoverable?: boolean): void;
}
export interface Transport {
  send(raw: string, target?: string): Promise<void>;
  close(): Promise<void>;
}
export type TransportFactory = (
  page: string,
  secret: string,
  handlers: TransportHandlers,
) => Transport;

export type RoomTransportFactory = (
  topic: string,
  secret: string,
  handlers: TransportHandlers,
) => Transport;
