import { COLORS, CURSOR_IDLE_MS } from '../../shared/constants';
import type { Participant, Point } from '../../shared/types';
interface Cursor {
  element: HTMLDivElement;
  current: Point;
  target: Point;
  visible: boolean;
  expiry: ReturnType<typeof setTimeout>;
}
export class CursorOverlay {
  readonly host: HTMLDivElement;
  readonly shadow: ShadowRoot;
  private cursors = new Map<string, Cursor>();
  private frame = 0;
  constructor() {
    this.host = document.createElement('div');
    this.host.dataset.ghostcursor = 'overlay';
    this.host.setAttribute('aria-hidden', 'true');
    this.host.style.cssText =
      'all:initial!important;position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;pointer-events:none!important;z-index:2147483647!important;overflow:hidden!important;';
    this.shadow = this.host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `:host{pointer-events:none}*{box-sizing:border-box;pointer-events:none!important}.cursor{position:absolute;left:0;top:0;will-change:transform;color:var(--color);font:600 12px/1.3 system-ui,sans-serif}.cursor[hidden]{display:none}.cursor svg{display:block;filter:drop-shadow(0 1px 2px #0006)}.label{position:absolute;top:20px;left:14px;padding:4px 8px;border-radius:4px 9px 9px 9px;background:var(--color);color:#18191f;white-space:nowrap;max-width:180px;overflow:hidden;text-overflow:ellipsis;box-shadow:0 2px 8px #0002}`;
    this.shadow.append(style);
    document.documentElement.append(this.host);
  }
  move(id: string, point: Point, participant: Participant) {
    let cursor = this.cursors.get(id);
    if (!cursor) {
      const element = document.createElement('div');
      element.className = 'cursor';
      element.dataset.peer = id;
      element.style.setProperty(
        '--color',
        COLORS[participant.color] ?? COLORS[0],
      );
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', '24');
      svg.setAttribute('height', '28');
      svg.setAttribute('viewBox', '0 0 24 28');
      const path = document.createElementNS(svg.namespaceURI, 'path');
      path.setAttribute('d', 'M2 2 L20 15 L12 17 L8 25 Z');
      path.setAttribute('fill', 'currentColor');
      path.setAttribute('stroke', '#202127');
      path.setAttribute('stroke-width', '1.5');
      svg.append(path);
      const label = document.createElement('span');
      label.className = 'label';
      label.textContent = participant.name;
      element.append(svg, label);
      this.shadow.append(element);
      cursor = {
        element,
        current: { ...point },
        target: { ...point },
        visible: true,
        expiry: setTimeout(() => this.hide(id), CURSOR_IDLE_MS),
      };
      this.cursors.set(id, cursor);
    }
    cursor.element.style.setProperty(
      '--color',
      COLORS[participant.color] ?? COLORS[0],
    );
    cursor.element.querySelector('.label')!.textContent = participant.name;
    cursor.target = { ...point };
    cursor.visible = true;
    cursor.element.hidden = false;
    clearTimeout(cursor.expiry);
    cursor.expiry = setTimeout(() => this.hide(id), CURSOR_IDLE_MS);
    this.schedule();
  }
  private schedule() {
    if (!this.frame) this.frame = requestAnimationFrame(() => this.render());
  }
  private render() {
    this.frame = 0;
    let moving = false;
    const reduced = window.matchMedia?.(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    for (const cursor of this.cursors.values()) {
      if (!cursor.visible) continue;
      const { current, target, element } = cursor;
      const dx = target.x - current.x,
        dy = target.y - current.y;
      const settled = reduced || Math.abs(dx) + Math.abs(dy) < 0.0005;
      current.x = settled ? target.x : current.x + dx * 0.4;
      current.y = settled ? target.y : current.y + dy * 0.4;
      element.style.transform = `translate3d(${Math.min(current.x * innerWidth, innerWidth - 24)}px,${Math.min(current.y * innerHeight, innerHeight - 28)}px,0)`;
      moving ||= !settled;
    }
    if (moving) this.schedule();
  }
  setVisible(visible: boolean) {
    this.host.style.setProperty(
      'visibility',
      visible ? 'visible' : 'hidden',
      'important',
    );
  }
  resize() {
    this.schedule();
  }
  hide(id: string) {
    const cursor = this.cursors.get(id);
    if (cursor) {
      cursor.visible = false;
      cursor.element.hidden = true;
      clearTimeout(cursor.expiry);
    }
  }
  hideAll() {
    for (const id of this.cursors.keys()) this.hide(id);
  }
  remove(id: string) {
    const cursor = this.cursors.get(id);
    if (cursor) {
      clearTimeout(cursor.expiry);
      cursor.element.remove();
      this.cursors.delete(id);
    }
  }
  destroy() {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    for (const id of this.cursors.keys()) this.remove(id);
    this.host.remove();
  }
}
