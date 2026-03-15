/**
 * HMR Client for Content Scripts (Dev Only)
 *
 * Connects to Vite dev server via WebSocket to receive change notifications.
 * On update, reloads the extension and refreshes the page.
 *
 * Note: This module is tree-shaken in production builds as it's only imported
 * via the virtual:fiber/content module when FIBER_DEV=true.
 */

/**
 * Initialize HMR connection to Vite dev server.
 *
 * @param serverUrl - WebSocket URL of Vite dev server (e.g., 'ws://localhost:5173')
 */
export function initHmr(serverUrl: string): void {
  const ws = new WebSocket(serverUrl);

  ws.onopen = () => {
    console.log("[fiber] HMR connected");
  };

  ws.onmessage = (event) => {
    let msg: { type: string };
    try {
      msg = JSON.parse(event.data);
    } catch {
      return; // Ignore non-JSON messages
    }

    // Vite sends 'update' messages when files change
    if (msg.type !== "update") return;

    console.log("[fiber] Update detected, reloading extension...");

    // Request background to reload extension, then refresh page
    chrome.runtime.sendMessage({ type: "fiber:ext-reload" });

    // Give extension time to reload, then refresh page to get new content script
    setTimeout(() => location.reload(), 300);
  };

  ws.onerror = () => {
    console.warn("[fiber] HMR WebSocket error - live reload unavailable");
  };

  ws.onclose = () => {
    console.warn("[fiber] HMR connection closed");
  };
}
