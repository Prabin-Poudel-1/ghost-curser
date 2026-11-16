import { randomId } from '../shared/security';
import {
  MAX_NOTES_PER_AUTHOR,
  type NoteRecord,
  type DomAnchor,
  type LiveNote,
  validNoteText,
} from '../networking/collaboration-protocol';
export interface OwnedNote {
  owner: string;
  record: NoteRecord;
}
// Author-only, monotonic registers. Tombstones count against the per-session quota.
export class NoteStore {
  private authors = new Map<string, Map<string, NoteRecord>>();
  merge(owner: string, record: NoteRecord): boolean {
    let records = this.authors.get(owner);
    if (!records) {
      if (this.authors.size >= 8) return false;
      records = new Map();
      this.authors.set(owner, records);
    }
    const old = records.get(record.id);
    if (!old && records.size >= MAX_NOTES_PER_AUTHOR) return false;
    if (old) {
      if (record.rev < old.rev) return false;
      if (record.rev === old.rev) {
        if ('deleted' in old) return false;
        if (
          !('deleted' in record) &&
          JSON.stringify(record) <= JSON.stringify(old)
        )
          return false;
      }
      // A deleted immutable ID is never resurrected, even with a higher revision.
      if ('deleted' in old) return false;
    }
    records.set(record.id, structuredClone(record));
    return true;
  }
  create(
    owner: string,
    text: string,
    anchor: DomAnchor,
    now = Date.now(),
  ): LiveNote {
    if (!validNoteText(text))
      throw new Error('Write a plain-text note of 1–600 characters.');
    const record = {
      id: randomId(),
      rev: 1,
      created: now,
      updated: now,
      text,
      anchor,
    };
    if (!this.merge(owner, record))
      throw new Error(
        'This session has reached its limit of 16 note IDs per author. Start a new room for more notes.',
      );
    return record;
  }
  edit(owner: string, id: string, text: string, now = Date.now()): LiveNote {
    const old = this.authors.get(owner)?.get(id);
    if (!old || 'deleted' in old || !validNoteText(text))
      throw new Error(
        'This note cannot be edited. Use 1–600 plain-text characters.',
      );
    const record = {
      ...old,
      rev: old.rev + 1,
      text,
      updated: Math.max(now, old.updated),
    };
    this.merge(owner, record);
    return record;
  }
  delete(owner: string, id: string): NoteRecord | null {
    const old = this.authors.get(owner)?.get(id);
    if (!old || 'deleted' in old) return null;
    const record = { id, rev: old.rev + 1, deleted: true as const };
    this.merge(owner, record);
    return record;
  }
  own(owner: string): NoteRecord[] {
    return [...(this.authors.get(owner)?.values() ?? [])];
  }
  all(): OwnedNote[] {
    return [...this.authors].flatMap(([owner, records]) =>
      [...records.values()].map((record) => ({ owner, record })),
    );
  }
  removeAuthor(owner: string) {
    this.authors.delete(owner);
  }
  clear() {
    this.authors.clear();
  }
}
