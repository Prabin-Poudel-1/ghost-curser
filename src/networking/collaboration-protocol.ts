import { validName, validColor } from '../shared/security';
import { decodeMessage, type Message } from './protocol';
import type { Point } from '../shared/types';
export const FEATURE_MAX_BYTES = 4096;
export const MAX_NOTES_PER_AUTHOR = 16;
export const MAX_NOTE_TEXT = 600;
export const MAX_LASER_POINTS = 120;
export const LASER_BATCH_POINTS = 12;
export const LASER_LIFETIME_MS = 3000;
export const TAGS = new Set(
  'body div section article main nav header footer aside button a span p h1 h2 h3 h4 h5 h6 ul ol li img svg path figure figcaption table thead tbody tr td th dl dt dd label strong em small b i code pre blockquote details summary video canvas hr br'.split(
    ' ',
  ),
);
export interface AnchorStep {
  tag: string;
  n: number;
  count: number;
}
export interface DomAnchor {
  v: 1;
  path: AnchorStep[];
  shape: string[];
  offset: Point;
}
export interface LiveNote {
  id: string;
  rev: number;
  created: number;
  updated: number;
  text: string;
  anchor: DomAnchor;
}
export interface DeletedNote {
  id: string;
  rev: number;
  deleted: true;
}
export type NoteRecord = LiveNote | DeletedNote;
export type FeatureMessage =
  | {
      v: 2;
      t: 'participant';
      sid: string;
      rev: number;
      name: string;
      color: number;
    }
  | { v: 2; t: 'click'; seq: number; x: number; y: number }
  | {
      v: 2;
      t: 'laser_start';
      seq: number;
      stroke: string;
      x: number;
      y: number;
    }
  | { v: 2; t: 'laser_move'; seq: number; stroke: string; points: Point[] }
  | { v: 2; t: 'laser_end'; seq: number; stroke: string }
  | { v: 2; t: 'laser_clear'; seq: number }
  | { v: 2; t: 'note_create' | 'note_update'; note: LiveNote }
  | { v: 2; t: 'note_delete'; note: DeletedNote }
  | { v: 2; t: 'note_sync'; note: NoteRecord };
export const isUuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
    value,
  );
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const keys = (v: Record<string, unknown>, allowed: string) =>
  Object.keys(v).sort().join(',') === allowed.split(',').sort().join(',');
const integer = (v: unknown, max = 1_000_000_000): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= max;
const unit = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
const point = (v: unknown): v is Point =>
  object(v) && keys(v, 'x,y') && unit(v.x) && unit(v.y);
export const validNoteText = (v: unknown): v is string =>
  typeof v === 'string' &&
  v.trim().length > 0 &&
  v.length <= MAX_NOTE_TEXT &&
  !/[\p{C}]/u.test(v.replaceAll('\n', '').replaceAll('\t', ''));
export function validAnchor(v: unknown): v is DomAnchor {
  return (
    object(v) &&
    keys(v, 'v,path,shape,offset') &&
    v.v === 1 &&
    point(v.offset) &&
    Array.isArray(v.path) &&
    v.path.length > 0 &&
    v.path.length <= 16 &&
    v.path.every(
      (s) =>
        object(s) &&
        keys(s, 'tag,n,count') &&
        typeof s.tag === 'string' &&
        TAGS.has(s.tag) &&
        integer(s.n, 1023) &&
        integer(s.count, 1024) &&
        s.count > 0 &&
        s.n < s.count,
    ) &&
    Array.isArray(v.shape) &&
    v.shape.length <= 8 &&
    v.shape.every((t) => typeof t === 'string' && TAGS.has(t))
  );
}
export function validRecord(v: unknown): v is NoteRecord {
  if (!object(v) || !isUuid(v.id) || !integer(v.rev) || v.rev < 1) return false;
  if (v.deleted === true) return keys(v, 'id,rev,deleted');
  return (
    keys(v, 'id,rev,created,updated,text,anchor') &&
    integer(v.created, 4_102_444_800_000) &&
    integer(v.updated, 4_102_444_800_000) &&
    v.created > 0 &&
    v.updated >= v.created &&
    validNoteText(v.text) &&
    validAnchor(v.anchor)
  );
}
export function decodeFeature(raw: unknown): FeatureMessage | null {
  if (
    typeof raw !== 'string' ||
    raw.length > FEATURE_MAX_BYTES ||
    new TextEncoder().encode(raw).byteLength > FEATURE_MAX_BYTES
  )
    return null;
  try {
    const d: unknown = JSON.parse(raw);
    if (!object(d) || d.v !== 2) return null;
    if (
      d.t === 'participant' &&
      keys(d, 'v,t,sid,rev,name,color') &&
      isUuid(d.sid) &&
      integer(d.rev) &&
      validName(d.name) &&
      validColor(d.color)
    )
      return d as FeatureMessage;
    if (
      d.t === 'note_create' ||
      d.t === 'note_update' ||
      d.t === 'note_sync' ||
      d.t === 'note_delete'
    ) {
      if (!keys(d, 'v,t,note') || !validRecord(d.note)) return null;
      const deleted = 'deleted' in d.note;
      if (d.t === 'note_delete' ? !deleted : d.t !== 'note_sync' && deleted)
        return null;
      return d as FeatureMessage;
    }
    if (!integer(d.seq)) return null;
    if (d.t === 'click' && keys(d, 'v,t,seq,x,y') && unit(d.x) && unit(d.y))
      return d as FeatureMessage;
    if (d.t === 'laser_clear' && keys(d, 'v,t,seq')) return d as FeatureMessage;
    if (!isUuid(d.stroke)) return null;
    if (
      d.t === 'laser_start' &&
      keys(d, 'v,t,seq,stroke,x,y') &&
      unit(d.x) &&
      unit(d.y)
    )
      return d as FeatureMessage;
    if (d.t === 'laser_end' && keys(d, 'v,t,seq,stroke'))
      return d as FeatureMessage;
    if (
      d.t === 'laser_move' &&
      keys(d, 'v,t,seq,stroke,points') &&
      Array.isArray(d.points) &&
      d.points.length > 0 &&
      d.points.length <= LASER_BATCH_POINTS &&
      d.points.every(point)
    )
      return d as FeatureMessage;
  } catch {
    /* Never trust a peer's JSON. */
  }
  return null;
}
export const decodeWireMessage = (
  raw: unknown,
): Message | FeatureMessage | null => decodeMessage(raw) ?? decodeFeature(raw);
