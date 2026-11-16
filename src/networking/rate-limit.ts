// Fixed windows are intentionally simple and bounded. Rejected input consumes a
// slot so malformed-message floods do not get a free parsing/IPC path.
export class PeerRateLimit {
  private peers = new Map<string, { start: number; count: number }>();
  constructor(
    private limit = 60,
    private maxPeers = 7,
  ) {}
  add(id: string) {
    if (this.peers.size < this.maxPeers && !this.peers.has(id))
      this.peers.set(id, { start: 0, count: 0 });
  }
  allow(id: string, now = Date.now()) {
    const p = this.peers.get(id);
    if (!p) return false;
    if (now - p.start >= 1000) {
      p.start = now;
      p.count = 0;
    }
    return ++p.count <= this.limit;
  }
  remove(id: string) {
    this.peers.delete(id);
  }
  clear() {
    this.peers.clear();
  }
}
