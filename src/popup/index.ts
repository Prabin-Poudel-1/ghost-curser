import './style.css';
import { COLORS } from '../shared/constants';
import {
  generateInvitation,
  parseInvitation,
  validName,
} from '../shared/security';
import { emptyState, type Command, type Response } from '../shared/types';
import { renderState } from './view';
const find = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
let tabId: number | undefined;
let busy = false;
let localError: string | undefined;
let revision = 0;
let selected = crypto.getRandomValues(new Uint8Array(1))[0]! % COLORS.length;
let state = emptyState();
function error(message: string) {
  localError = message;
  find('error').hidden = false;
  find('error').textContent = message;
}
async function request(command: Command) {
  if (tabId === undefined)
    throw new Error(
      'No webpage selected. Open a webpage and click the GhostCursor toolbar icon.',
    );
  const response = (await chrome.runtime.sendMessage({
    channel: 'ghostcursor',
    tabId,
    command,
  })) as Response;
  if (!response?.ok)
    throw new Error(
      response?.error ??
        'The extension is unavailable. Reload it and try again.',
    );
  return response.state;
}
function render() {
  renderState(document, state);
  if (localError) error(localError);
}
async function act(command: Command) {
  if (busy) return;
  busy = true;
  revision++;
  localError = undefined;
  document
    .querySelectorAll<HTMLButtonElement>('button')
    .forEach((b) => (b.disabled = true));
  try {
    state = await request(command);
    render();
  } catch (e) {
    error(
      e instanceof Error ? e.message : 'Something went wrong. Please retry.',
    );
  } finally {
    busy = false;
    document
      .querySelectorAll<HTMLButtonElement>('button')
      .forEach((b) => (b.disabled = false));
  }
}
function start(create: boolean) {
  localError = undefined;
  const name = find<HTMLInputElement>('name').value.trim();
  if (!validName(name)) {
    error('Use a display name of 1–24 characters without control characters.');
    return;
  }
  try {
    const invitation = create
      ? generateInvitation()
      : parseInvitation(find<HTMLInputElement>('join-code').value);
    void act({ type: 'start', invitation, name, color: selected });
  } catch (e) {
    error((e as Error).message);
  }
}
const colorNames = [
  'Periwinkle',
  'Mint',
  'Apricot',
  'Rose',
  'Sky',
  'Lemon',
  'Sage',
  'Lilac',
];
COLORS.forEach((color, i) => {
  const button = document.createElement('button');
  button.className = 'swatch';
  button.type = 'button';
  button.setAttribute('aria-label', colorNames[i]!);
  button.setAttribute('aria-pressed', String(selected === i));
  button.style.setProperty('--swatch', color);
  button.append(document.createElement('span'));
  button.addEventListener('click', () => {
    selected = i;
    document
      .querySelectorAll('.swatch')
      .forEach((b, j) => b.setAttribute('aria-pressed', String(i === j)));
  });
  find('colors').append(button);
});
find('create').addEventListener('click', () => start(true));
find('join').addEventListener('click', () => start(false));
find('join-code').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') start(false);
});
find('leave').addEventListener('click', () => void act({ type: 'leave' }));
find('retry').addEventListener('click', () => void act({ type: 'retry' }));
find('copy').addEventListener('click', () => {
  if (!state.invitation) return;
  void navigator.clipboard
    .writeText(state.invitation)
    .then(() => {
      find('copy').textContent = 'Copied';
      setTimeout(() => {
        find('copy').textContent = 'Copy invitation';
      }, 1500);
    })
    .catch(() =>
      error(
        'Clipboard access was denied. Select the invitation above and copy it manually.',
      ),
    );
});
async function poll() {
  if (busy || tabId === undefined) return;
  const version = revision;
  try {
    const next = await request({ type: 'state' });
    if (!busy && version === revision) {
      state = next;
      render();
    }
  } catch (e) {
    error(
      e instanceof Error ? e.message : 'Cannot read the current page session.',
    );
  }
}
async function initialize() {
  try {
    // Local test builds alone can target a fixture tab from a full-page popup.
    const testTab = __TEST_BUILD__
      ? new URLSearchParams(location.search).get('tab')
      : null;
    tabId = testTab
      ? Number(testTab)
      : (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
    await poll();
  } catch {
    error(
      'Could not access the active tab. Reopen GhostCursor from the toolbar.',
    );
  }
}
render();
void initialize();
const polling = setInterval(() => void poll(), 1000);
window.addEventListener('pagehide', () => clearInterval(polling), {
  once: true,
});
