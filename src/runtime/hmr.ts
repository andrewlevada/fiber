/**
 * HMR Client for Content Scripts (Dev Only)
 *
 * Connects to Vite dev server via WebSocket to receive change notifications.
 * On update, resets overlay state and requests background to re-inject content script.
 *
 * Note: This module is tree-shaken in production builds as it's only imported
 * via the virtual:fiber/content module when FIBER_DEV=true.
 */

import { __hmrReset as resetOverlay } from './overlay';

/**
 * Initialize HMR connection to Vite dev server.
 *
 * @param serverUrl - WebSocket URL of Vite dev server (e.g., 'ws://localhost:5173')
 */
export function initHmr(serverUrl: string): void {
  const ws = new WebSocket(serverUrl);

  ws.onopen = () => {
    console.log('[fiber] HMR connected');
  };

  ws.onmessage = (event) => {
    let msg: { type: string };
    try {
      msg = JSON.parse(event.data);
    } catch {
      return; // Ignore non-JSON messages
    }

    // Vite sends 'update' messages when files change
    if (msg.type !== 'update') return;

    console.log('[fiber] Update detected, reloading...');

    // 1. Reset overlay (triggers Lit disconnectedCallback for cleanup)
    resetOverlay();

    // 2. Request background to re-inject content script
    chrome.runtime.sendMessage({ type: 'fiber:hmr-reload' });
  };

  ws.onerror = () => {
    console.warn('[fiber] HMR WebSocket error - live reload unavailable');
  };

  ws.onclose = () => {
    console.warn('[fiber] HMR connection closed');
  };
}
