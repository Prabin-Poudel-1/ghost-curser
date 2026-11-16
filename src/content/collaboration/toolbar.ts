export type Tool = 'cursor' | 'laser' | 'note';
export interface ToolbarActions {
  tool(tool: Tool): void;
  clear(): void;
  visibility(visible: boolean): void;
  leave(): void;
}
const paths = {
  cursor: 'm4 3 15 10-7 1-3 7Z',
  laser: 'm4 20 8-8m3-7 1-3m3 7 3-1m-7 7 2 2M5 5l3 3m-6 5h3',
  note: 'M5 3h14v12l-6 6H5Zm8 18v-6h6M8 7h8M8 11h5',
  clear: 'm4 14 8-10 8 7-8 10H9ZM9 21h12M8 10l8 7',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12m7 0a3 3 0 1 0 6 0 3 3 0 1 0-6 0',
  leave: 'M10 4H4v16h6m4-12 4 4-4 4m-6-4h12',
  grip: 'M8 6h1m6 0h1M8 12h1m6 0h1M8 18h1m6 0h1',
};
function icon(key: keyof typeof paths) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(svg.namespaceURI, 'path');
  path.setAttribute('d', paths[key]);
  svg.append(path);
  return svg;
}
let remembered: { x: number; y: number } | undefined; // Page lifetime only; never stored in host-page storage.
export class Toolbar {
  readonly element = document.createElement('div');
  readonly hint = document.createElement('div');
  private abort = new AbortController();
  private buttons = new Map<Tool, HTMLButtonElement>();
  private visible = true;
  private position = { x: 0, y: 0 };
  constructor(
    root: ShadowRoot,
    private actions: ToolbarActions,
  ) {
    this.element.className = 'toolbar';
    this.element.setAttribute('role', 'toolbar');
    this.element.setAttribute('aria-label', 'GhostCursor collaboration');
    const grip = this.button('Move toolbar', 'grip');
    grip.classList.add('grip');
    this.element.append(grip);
    const separator = () => {
      const line = document.createElement('span');
      line.className = 'separator';
      this.element.append(line);
    };
    separator();
    for (const [tool, label] of [
      ['cursor', 'Navigate'],
      ['laser', 'Laser'],
      ['note', 'Sticky note'],
    ] as const) {
      const b = this.button(label, tool);
      b.dataset.tool = tool;
      this.buttons.set(tool, b);
      b.addEventListener('click', () => this.setTool(tool), {
        signal: this.abort.signal,
      });
      this.element.append(b);
    }
    separator();
    const clear = this.button('Clear temporary drawings', 'clear');
    clear.addEventListener('click', actions.clear, {
      signal: this.abort.signal,
    });
    this.element.append(clear);
    const eye = this.button('Hide remote cursors', 'eye');
    eye.setAttribute('aria-pressed', 'false');
    eye.addEventListener(
      'click',
      () => {
        this.visible = !this.visible;
        eye.setAttribute(
          'aria-label',
          this.visible ? 'Hide remote cursors' : 'Show remote cursors',
        );
        eye.title = eye.getAttribute('aria-label')!;
        eye.setAttribute('aria-pressed', String(!this.visible));
        actions.visibility(this.visible);
      },
      { signal: this.abort.signal },
    );
    this.element.append(eye);
    separator();
    const leave = this.button('Leave session', 'leave');
    leave.classList.add('leave');
    leave.addEventListener('click', actions.leave, {
      signal: this.abort.signal,
    });
    this.element.append(leave);
    this.hint.className = 'tool-hint';
    this.hint.setAttribute('role', 'status');
    root.append(this.element, this.hint);
    this.position = remembered ?? {
      x: (innerWidth - 342) / 2,
      y: innerHeight - 80,
    };
    this.place();
    this.setTool('cursor');
    let drag: { x: number; y: number; px: number; py: number } | undefined;
    grip.addEventListener(
      'pointerdown',
      (e) => {
        if (e.button !== 0) return;
        drag = { ...this.position, px: e.clientX, py: e.clientY };
        grip.setPointerCapture(e.pointerId);
        e.preventDefault();
      },
      { signal: this.abort.signal },
    );
    grip.addEventListener(
      'pointermove',
      (e) => {
        if (drag) {
          this.position = {
            x: drag.x + e.clientX - drag.px,
            y: drag.y + e.clientY - drag.py,
          };
          this.place();
        }
      },
      { signal: this.abort.signal },
    );
    grip.addEventListener(
      'pointerup',
      () => {
        drag = undefined;
        remembered = { ...this.position };
      },
      { signal: this.abort.signal },
    );
    grip.addEventListener(
      'pointercancel',
      () => {
        drag = undefined;
      },
      { signal: this.abort.signal },
    );
    grip.addEventListener(
      'keydown',
      (e) => {
        const delta: Record<string, [number, number]> = {
          ArrowLeft: [-16, 0],
          ArrowRight: [16, 0],
          ArrowUp: [0, -16],
          ArrowDown: [0, 16],
        };
        const change = delta[e.key];
        if (change) {
          e.preventDefault();
          this.position.x += change[0];
          this.position.y += change[1];
          this.place();
          remembered = { ...this.position };
        }
      },
      { signal: this.abort.signal },
    );
    window.addEventListener('resize', () => this.place(), {
      signal: this.abort.signal,
    });
  }
  private button(label: string, key: keyof typeof paths) {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-label', label);
    b.title = label;
    b.append(icon(key));
    return b;
  }
  setTool(tool: Tool) {
    for (const [key, b] of this.buttons)
      b.setAttribute('aria-pressed', String(tool === key));
    this.hint.textContent =
      tool === 'laser'
        ? 'Hold and move to draw · Esc to exit'
        : tool === 'note'
          ? 'Select an element · or hover + Enter · Esc to exit'
          : '';
    this.hint.hidden = tool === 'cursor';
    this.actions.tool(tool);
  }
  private place() {
    this.position.x = Math.max(
      8,
      Math.min(
        this.position.x,
        innerWidth - Math.min(342, innerWidth - 16) - 8,
      ),
    );
    this.position.y = Math.max(8, Math.min(this.position.y, innerHeight - 62));
    this.element.style.transform = `translate(${this.position.x}px,${this.position.y}px)`;
    this.hint.style.left = `${this.position.x}px`;
    this.hint.style.top = `${Math.max(8, this.position.y - 34)}px`;
  }
  destroy() {
    this.abort.abort();
    this.element.remove();
    this.hint.remove();
  }
}
