/**
 * Background Script
 *
 * Handles RPC calls from content scripts and provides access to Chrome APIs.
 * This script runs in the service worker context (MV3).
 */

import { createRpcServer, RpcHandlers } from "./rpc.ts";

// ============================================================================
// Fetch Response Cache
// ============================================================================

const RESPONSE_TTL_MS = 60_000; // 60 seconds

interface CachedResponse {
  response: Response;
  expiresAt: number;
}

/** Map of response ID to cached Response object */
const responseCache = new Map<string, CachedResponse>();

/** Set of response IDs that have had their body consumed */
const consumedResponses = new Set<string>();

/**
 * Clean up expired responses from the cache.
 * Called periodically and before cache operations.
 */
function cleanupExpiredResponses(): void {
  const now = Date.now();
  for (const [id, cached] of responseCache) {
    if (cached.expiresAt <= now) {
      responseCache.delete(id);
    }
  }
}

// Run cleanup every 30 seconds
setInterval(cleanupExpiredResponses, 30_000);

// ============================================================================
// Fetch Handlers
// ============================================================================

/** Serializable RequestInit received from content script */
interface SerializableRequestInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  mode?: RequestMode;
  credentials?: RequestCredentials;
  cache?: RequestCache;
  redirect?: RequestRedirect;
  referrer?: string;
  referrerPolicy?: ReferrerPolicy;
  integrity?: string;
  keepalive?: boolean;
}

/**
 * Convert ArrayBuffer to base64 string for RPC transport
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

type BodyMode = "text" | "json" | "arrayBuffer" | "blob";

/**
 * Perform fetch and cache the response.
 * Returns metadata that can be used to read the body later.
 *
 * RPC signature: fetch(url: string, init?: SerializableRequestInit)
 */
async function handleFetch(
  ...args: unknown[]
): Promise<{
  id: string;
  ok: boolean;
  status: number;
  statusText: string;
  headers: Record<string, string>;
}> {
  const [url, init] = args as [string, SerializableRequestInit | undefined];

  // Clean up expired responses before adding new ones
  cleanupExpiredResponses();

  // Perform the actual fetch
  const response = await fetch(url, init);

  // Generate unique ID for this response
  const id = crypto.randomUUID();

  // Cache the response with TTL
  responseCache.set(id, {
    response,
    expiresAt: Date.now() + RESPONSE_TTL_MS,
  });

  // Extract headers into plain object
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });

  return {
    id,
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    headers,
  };
}

/**
 * Read body from cached response.
 * The response is deleted from cache after reading (body can only be read once).
 *
 * RPC signature: fetchBody(id: string, mode: BodyMode)
 */
async function handleFetchBody(...args: unknown[]): Promise<unknown> {
  const [id, mode] = args as [string, BodyMode];

  // Check if body was already consumed
  if (consumedResponses.has(id)) {
    throw new Error("Response body has already been consumed");
  }

  // Get cached response
  const cached = responseCache.get(id);
  if (!cached) {
    throw new Error(
      "Response not found. It may have expired (60s TTL) or been consumed.",
    );
  }

  // Check if expired
  if (cached.expiresAt <= Date.now()) {
    responseCache.delete(id);
    throw new Error("Response has expired (60s TTL)");
  }

  // Mark as consumed and remove from cache
  consumedResponses.add(id);
  responseCache.delete(id);

  // Clean up consumed set after TTL to prevent memory leak
  setTimeout(() => consumedResponses.delete(id), RESPONSE_TTL_MS);

  const { response } = cached;

  // Read body based on mode
  switch (mode) {
    case "text":
      return response.text();

    case "json":
      return response.json();

    case "arrayBuffer": {
      const buffer = await response.arrayBuffer();
      return arrayBufferToBase64(buffer);
    }

    case "blob": {
      const blob = await response.blob();
      const buffer = await blob.arrayBuffer();
      return {
        base64: arrayBufferToBase64(buffer),
        type: blob.type,
      };
    }

    default:
      throw new Error(`Unknown body mode: ${mode}`);
  }
}

// ============================================================================
// RPC Server Setup
// ============================================================================

/**
 * Wrap Chrome API methods to preserve their `this` context.
 * Chrome API methods throw "Illegal invocation" if called without proper binding.
 */
function bindChromeMethods<T extends object>(obj: T): T {
  const bound: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    const value = (obj as Record<string, unknown>)[key];
    if (typeof value === "function") {
      bound[key] = value.bind(obj);
    } else if (typeof value === "object" && value !== null) {
      bound[key] = bindChromeMethods(value as object);
    } else {
      bound[key] = value;
    }
  }
  return bound as T;
}

/**
 * RPC handlers for Chrome API passthrough and fetch proxy.
 * Each namespace is exposed directly, allowing the RPC layer to resolve
 * nested methods like "tabs.query" -> handlers.tabs.query
 */
const handlers: RpcHandlers = {
  // Chrome API passthrough (bound to preserve context)
  tabs: bindChromeMethods(chrome.tabs),
  storage: {
    local: bindChromeMethods(chrome.storage.local),
    sync: bindChromeMethods(chrome.storage.sync),
    session: bindChromeMethods(chrome.storage.session),
  },

  // Fetch proxy handlers
  fetch: handleFetch,
  fetchBody: handleFetchBody,
};

createRpcServer(handlers);

// ============================================================================
// Action Click Handler
// ============================================================================

/**
 * When the extension icon is clicked, send a toggle message to the active tab.
 */
chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    chrome.tabs.sendMessage(tab.id, { type: "fiber:toggle-overlay" });
  }
});
