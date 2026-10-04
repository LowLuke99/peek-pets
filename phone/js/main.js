import { App } from './app.js';

const app = new App();
app.start();

// Exposed for the end-to-end test harness and on-device debugging.
window.peek = app;

// The installed app (HTTPS) keeps an offline copy so the pet opens without the PC.
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => { /* offline copy is a bonus */ });
  // Whenever the PC is reachable, let the worker pick up new versions of the pet.
  app.onConnected = () => navigator.serviceWorker.controller?.postMessage('refresh');
}
