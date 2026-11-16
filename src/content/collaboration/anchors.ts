import { TAGS, type DomAnchor } from '../../networking/collaboration-protocol';
export function extensionTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    (target.closest('[data-ghostcursor]') !== null ||
      target.getRootNode() instanceof ShadowRoot)
  );
}
export function sensitiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement) || extensionTarget(target)) return true;
  for (
    let element: Element | null = target;
    element;
    element = element.parentElement
  )
    if (element.localName.includes('-') || element.shadowRoot) return true;
  // Conservative: whole forms/editable regions and embedded documents are excluded.
  return !!target.closest(
    'input,textarea,select,form,[contenteditable]:not([contenteditable="false"]),[role="textbox"],iframe,object,embed',
  );
}
const shape = (element: Element) =>
  Array.from(element.children)
    .slice(0, 8)
    .map((e) => e.localName);
export function anchorTarget(element: HTMLElement): HTMLElement {
  return element.closest<HTMLElement>('button,a,summary') ?? element;
}
export function createAnchor(element: HTMLElement): DomAnchor | null {
  element = anchorTarget(element);
  if (sensitiveTarget(element) || element === document.body) return null;
  const path: DomAnchor['path'] = [];
  let current: Element | null = element;
  while (current && current !== document.body) {
    if (path.length >= 16 || !TAGS.has(current.localName)) return null;
    const parent: Element | null = current.parentElement;
    if (!parent) return null;
    const siblings = Array.from(parent.children).filter(
      (e) => e.localName === current!.localName && !extensionTarget(e),
    );
    if (siblings.length > 1024) return null;
    path.unshift({
      tag: current.localName,
      n: siblings.indexOf(current),
      count: siblings.length,
    });
    current = parent;
  }
  const children = shape(element);
  if (current !== document.body || children.some((t) => !TAGS.has(t)))
    return null;
  return { v: 1, path, shape: children, offset: { x: 1, y: 0 } };
}
export function resolveAnchor(
  anchor: DomAnchor,
  root: HTMLElement = document.body,
): HTMLElement | null {
  let current: Element = root;
  const matches = (e: Element): e is HTMLElement =>
    e instanceof HTMLElement &&
    !sensitiveTarget(e) &&
    JSON.stringify(shape(e)) === JSON.stringify(anchor.shape);
  for (let index = 0; index < anchor.path.length; index++) {
    const step = anchor.path[index]!;
    const siblings = Array.from(current.children).filter(
      (e) => e.localName === step.tag && !extensionTarget(e),
    );
    if (siblings.length !== step.count || !siblings[step.n]) {
      // Only recover a formerly unique final child after insertion, within its
      // resolved parent. A global search can silently attach a deleted note's
      // anchor to an unrelated surviving element. Deletions fail closed.
      if (
        index !== anchor.path.length - 1 ||
        step.count !== 1 ||
        siblings.length <= step.count ||
        siblings.length > 250
      )
        return null;
      const matching = siblings.filter(matches);
      return matching.length === 1 ? matching[0]! : null;
    }
    current = siblings[step.n]!;
  }
  return matches(current) ? current : null;
}
