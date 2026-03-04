/**
 * Chrome API Proxy
 *
 * Exposes `ext` object that proxies all Chrome APIs through RPC.
 * Used in content scripts to access chrome.* APIs via background.
 */

import type { ExtApi } from '../types/ext';
import { createRpcClient } from './rpc';
import { createFetchProxy } from './ext-fetch';

const rpc = createRpcClient();

/**
 * Creates a recursive proxy that builds method paths.
 * e.g., ext.tabs.query(...) -> rpc.call("tabs.query", [...])
 */
function createApiProxy(path: string[] = []): unknown {
  return new Proxy(() => {}, {
    get(_, prop: string) {
      // Ignore Symbol properties (like Symbol.toStringTag, Symbol.iterator)
      if (typeof prop === 'symbol') return undefined;

      // Special case: ext.fetch returns a fetch-like function
      if (path.length === 0 && prop === 'fetch') {
        return createFetchProxy(rpc);
      }

      return createApiProxy([...path, prop]);
    },

    apply(_, __, args: unknown[]) {
      const method = path.join('.');
      return rpc.call(method, args);
    }
  });
}

export const ext = createApiProxy() as ExtApi;
