import { ext, overlay } from 'fiber-extension';
import { html } from 'lit';

// Content scripts run in isolated context - use custom events to communicate with page
// Listen for test commands from the page and respond via custom events
window.addEventListener('fiber-test-command', async (e) => {
  const { command, args, id } = (e as CustomEvent).detail;
  let result: unknown;
  let error: string | undefined;

  try {
    switch (command) {
      case 'testRpc':
        result = await ext.tabs.query({ active: true, currentWindow: true });
        break;
      case 'testStorage':
        await ext.storage.local.set({ testKey: 'testValue' });
        result = await ext.storage.local.get('testKey');
        await ext.storage.local.remove('testKey');
        break;
      case 'testFetch': {
        const response = await ext.fetch(args[0] as string);
        result = {
          ok: response.ok,
          status: response.status,
          body: await response.text(),
        };
        break;
      }
      case 'attachOverlay':
        overlay.attach(html`
          <div data-testid="fiber-overlay-content" style="
            position: absolute;
            top: 20px;
            right: 20px;
            padding: 16px;
            background: white;
            border: 1px solid #ccc;
            border-radius: 8px;
          ">
            <h2>Fiber Overlay Test</h2>
            <button data-testid="overlay-button">Click Me</button>
          </div>
        `);
        result = true;
        break;
      case 'detachOverlay':
        overlay.detach();
        result = true;
        break;
      default:
        error = `Unknown command: ${command}`;
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  window.dispatchEvent(new CustomEvent('fiber-test-response', {
    detail: { id, result, error }
  }));
});

document.documentElement.setAttribute('data-fiber-loaded', 'true');
