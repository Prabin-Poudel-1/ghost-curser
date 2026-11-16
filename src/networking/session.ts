import './session.css';
import { hostActive, stopHost } from './offscreen';
const update = () => {
  document.getElementById('host-status')!.textContent = hostActive()
    ? 'Networking is active. Return to your webpage to collaborate.'
    : 'No active connection. You can close this tab.';
};
document.addEventListener('ghostcursor-host-state', update);
document.getElementById('stop-session')!.addEventListener('click', () => {
  stopHost();
  update();
});
update();
