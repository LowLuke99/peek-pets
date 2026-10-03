import { App } from './app.js';

const app = new App();
app.start();

// Exposed for the end-to-end test harness and on-device debugging.
window.peek = app;
