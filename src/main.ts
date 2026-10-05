import { App } from './app';
import { registerServiceWorker } from './utils/service-worker';

// Register service worker for offline functionality
registerServiceWorker();

// Initialize app
const app = new App();
app.init();
