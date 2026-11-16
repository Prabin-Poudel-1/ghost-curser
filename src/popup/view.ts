import { COLORS } from '../shared/constants';
import type { SessionState } from '../shared/types';
export function viewState(state: SessionState) {
  return {
    inRoom: Boolean(state.invitation),
    label:
      state.status === 'connected'
        ? 'Connected'
        : state.status === 'connecting'
          ? 'Connecting'
          : 'Disconnected',
    detail: state.retryAt
      ? `Retry ${state.retryAttempt ?? 1} of 4 in ${Math.max(0, Math.ceil((state.retryAt - Date.now()) / 1000))} seconds…`
      : state.status === 'connected'
        ? 'Live cursors are connected peer to peer.'
        : 'Waiting for your people. Keep this webpage open.',
    retry: state.status !== 'connected',
  };
}
export function renderState(root: Document, state: SessionState) {
  const find = <T extends HTMLElement>(id: string) =>
    root.getElementById(id) as T;
  const view = viewState(state);
  find('setup').hidden = view.inRoom;
  find('session').hidden = !view.inRoom;
  find('status').textContent = view.label;
  find('status').dataset.state = state.status;
  find('connection-detail').textContent = view.detail;
  find<HTMLInputElement>('invitation').value = state.invitation ?? '';
  find('retry').hidden = !view.retry;
  find('error').hidden = !state.error;
  find('error').textContent = state.error ?? '';
  find('count').textContent =
    `${state.participants.length + (state.self ? 1 : 0)} / 8`;
  const roster = find('participants');
  roster.replaceChildren();
  for (const person of [
    ...(state.self ? [state.self] : []),
    ...state.participants,
  ]) {
    const li = root.createElement('li');
    const dot = root.createElement('span');
    dot.className = 'dot';
    dot.style.background = COLORS[person.color] ?? COLORS[0];
    const name = root.createElement('span');
    name.textContent = person.name;
    li.append(dot, name);
    if (person.id === 'self') {
      const you = root.createElement('span');
      you.className = 'you';
      you.textContent = 'you';
      li.append(you);
    }
    roster.append(li);
  }
}
