import { COLORS } from '../../shared/constants';
import type { Point } from '../../shared/types';
import {
  LASER_LIFETIME_MS,
  MAX_LASER_POINTS,
} from '../../networking/collaboration-protocol';
interface Trail {
  owner: string;
  id: string;
  points: Point[];
  element: SVGPathElement;
  born: number;
  expires: number;
  dirty: boolean;
}
interface Ripple {
  owner: string;
  point: Point;
  element: SVGCircleElement;
  born: number;
}
const NS = 'http://www.w3.org/2000/svg';
export class Effects {
  readonly svg = document.createElementNS(NS, 'svg');
  private trails = new Map<string, Trail>();
  private ripples: Ripple[] = [];
  private frame = 0;
  constructor(
    root: ShadowRoot,
    private now: () => number = performance.now.bind(performance),
  ) {
    this.svg.classList.add('effects');
    this.svg.setAttribute('aria-hidden', 'true');
    root.append(this.svg);
  }
  click(owner: string, point: Point, color: number) {
    if (this.ripples.length >= 32) this.ripples.shift()?.element.remove();
    const element = document.createElementNS(NS, 'circle');
    element.classList.add('ripple');
    element.setAttribute('fill', 'none');
    element.setAttribute('stroke', COLORS[color] ?? COLORS[0]);
    element.setAttribute('stroke-width', '2');
    this.svg.append(element);
    this.ripples.push({ owner, point, element, born: this.now() });
    this.schedule();
  }
  start(owner: string, id: string, point: Point, color: number) {
    const key = owner + ':' + id;
    if (this.trails.has(key)) return;
    const own = [...this.trails.values()].filter((t) => t.owner === owner);
    if (own.length >= 2) {
      const oldest = own[0]!;
      this.remove(oldest);
    }
    if (this.trails.size >= 16) return;
    const element = document.createElementNS(NS, 'path');
    element.classList.add('laser');
    element.setAttribute('stroke', COLORS[color] ?? COLORS[0]);
    element.setAttribute('stroke-width', '3');
    element.setAttribute('stroke-linecap', 'round');
    element.setAttribute('stroke-linejoin', 'round');
    element.setAttribute('fill', 'none');
    this.svg.append(element);
    this.trails.set(key, {
      owner,
      id,
      points: [point],
      element,
      born: this.now(),
      expires: this.now() + LASER_LIFETIME_MS,
      dirty: true,
    });
    this.schedule();
  }
  move(owner: string, id: string, points: Point[]) {
    const trail = this.trails.get(owner + ':' + id);
    if (!trail) return;
    trail.points.push(
      ...points.slice(0, MAX_LASER_POINTS - trail.points.length),
    );
    trail.dirty = true;
    trail.expires = Math.min(trail.born + 6000, this.now() + LASER_LIFETIME_MS);
    this.schedule();
  }
  end(owner: string, id: string) {
    const t = this.trails.get(owner + ':' + id);
    if (t) t.expires = Math.min(t.expires, this.now() + LASER_LIFETIME_MS);
  }
  clear(owner?: string) {
    for (const trail of this.trails.values())
      if (!owner || trail.owner === owner) this.remove(trail);
    this.ripples = this.ripples.filter((r) => {
      if (!owner || r.owner === owner) {
        r.element.remove();
        return false;
      }
      return true;
    });
    if (!this.ripples.length && !this.trails.size) {
      cancelAnimationFrame(this.frame);
      this.frame = 0;
    }
  }
  private remove(t: Trail) {
    t.element.remove();
    this.trails.delete(t.owner + ':' + t.id);
  }
  resize() {
    for (const t of this.trails.values()) t.dirty = true;
    this.schedule();
  }
  private schedule() {
    if (!this.frame && (this.trails.size || this.ripples.length))
      this.frame = requestAnimationFrame(() => this.render());
  }
  private render() {
    this.frame = 0;
    const now = this.now();
    const reduced = window.matchMedia?.(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    this.svg.setAttribute('viewBox', `0 0 ${innerWidth} ${innerHeight}`);
    this.ripples = this.ripples.filter((r) => {
      const age = now - r.born;
      const life = reduced ? 350 : 650;
      if (age > life) {
        r.element.remove();
        return false;
      }
      r.element.setAttribute('cx', String(r.point.x * innerWidth));
      r.element.setAttribute('cy', String(r.point.y * innerHeight));
      r.element.setAttribute('r', String(reduced ? 12 : 5 + (24 * age) / life));
      r.element.style.opacity = String(reduced ? 0.8 : 1 - age / life);
      return true;
    });
    for (const trail of this.trails.values()) {
      if (now >= trail.expires) {
        this.remove(trail);
        continue;
      }
      if (trail.dirty) {
        trail.element.setAttribute(
          'd',
          trail.points
            .map(
              (p, i) =>
                `${i ? 'L' : 'M'}${(p.x * innerWidth).toFixed(1)},${(p.y * innerHeight).toFixed(1)}`,
            )
            .join(' '),
        );
        trail.dirty = false;
      }
      trail.element.style.opacity = String(
        reduced ? 1 : Math.min(1, (trail.expires - now) / 1000),
      );
    }
    this.schedule();
  }
  stats() {
    return {
      trails: this.trails.size,
      points: [...this.trails.values()].reduce(
        (n, t) => n + t.points.length,
        0,
      ),
      ripples: this.ripples.length,
      frames: this.frame ? 1 : 0,
    };
  }
  destroy() {
    this.clear();
    this.svg.remove();
  }
}
