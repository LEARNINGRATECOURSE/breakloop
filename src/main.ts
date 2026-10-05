import { App } from './app';
import { registerServiceWorker } from './utils/service-worker';

// Register service worker for offline functionality
void registerServiceWorker();

// Initialize app
const app = new App();
app.init().catch((error) => {
  console.error('BreakLoop failed to start:', error);
  const container = document.getElementById('app');
  if (container) {
    container.innerHTML = `
      <div class="app-error" role="alert">
        <h1>Something went wrong</h1>
        <p>BreakLoop couldn't start. Try reloading the page.</p>
      </div>
    `;
  }
});
