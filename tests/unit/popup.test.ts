import { readFileSync } from 'node:fs';
import { beforeEach, describe, it, expect } from 'vitest';
import { renderState, viewState } from '../../src/popup/view';
import { emptyState } from '../../src/shared/types';
describe('popup state transitions', () => {
  beforeEach(() => {
    document.documentElement.innerHTML = readFileSync(
      'src/popup/index.html',
      'utf8',
    );
  });
  it('shows setup when disconnected without an invitation', () => {
    renderState(document, emptyState());
    expect(document.getElementById('setup')?.hidden).toBe(false);
    expect(document.getElementById('session')?.hidden).toBe(true);
  });
  it('keeps the invitation available during connection and recoverable failures', () => {
    const state = {
      ...emptyState(),
      invitation: 'gc1_test',
      status: 'connecting' as const,
    };
    renderState(document, state);
    expect(document.getElementById('status')?.textContent).toBe('Connecting');
    expect(document.getElementById('setup')?.hidden).toBe(true);
    renderState(document, {
      ...state,
      status: 'disconnected',
      error: 'Network failed',
    });
    expect(document.getElementById('retry')?.hidden).toBe(false);
    expect(document.getElementById('error')?.textContent).toBe(
      'Network failed',
    );
  });
  it('renders participants safely and returns to setup after leave', () => {
    renderState(document, {
      status: 'connected',
      invitation: 'gc1_test',
      self: { id: 'self', name: 'Ada', color: 0 },
      participants: [{ id: 'peer', name: '<img src=x>', color: 1 }],
    });
    expect(document.querySelectorAll('#participants li')).toHaveLength(2);
    expect(document.querySelector('#participants img')).toBeNull();
    expect(document.getElementById('status')?.textContent).toBe('Connected');
    renderState(document, emptyState());
    expect(document.querySelectorAll('#participants li')).toHaveLength(0);
    expect(viewState(emptyState()).inRoom).toBe(false);
  });
});
