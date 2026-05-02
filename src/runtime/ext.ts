/**
 * Chrome API Proxy
 *
 * Exposes `ext` object that proxies all Chrome APIs through RPC.
 * Used in content scripts to access chrome.* APIs via background.
 */

import type { ExtApi } from "../types/ext.d.ts";
import { createRpcClient } from "./rpc.ts";
import { createFetchProxy } from "./ext-fetch.ts";

const rpc = createRpcClient();

/**
 * Creates a recursive proxy that builds method paths.
 * e.g., ext.tabs.query(...) -> rpc.call("tabs.query", [...])
 */
function createApiProxy(path: string[] = []): unknown {
  const emptyTarget = () => {};

  return new Proxy(emptyTarget, {
    get(_, prop: string) {
      // Ignore Symbol properties (like Symbol.toStringTag, Symbol.iterator)
      if (typeof prop === "symbol") return undefined;

      // We extend the chrome API with a ext.fetch
      if (path.length === 0 && prop === "fetch") {
        return createFetchProxy(rpc);
      }

      // Special case: ext.scripting.executeInMainWorld needs to stringify the function
      if (
        path.length === 1 && path[0] === "scripting" &&
        prop === "executeInMainWorld"
      ) {
        return (func: (...args: unknown[]) => unknown, args: unknown[]) => {
          // Convert function to string before sending over RPC
          const funcString = func.toString();
          return rpc.call("scripting.executeInMainWorld", [funcString, args]);
        };
      }

      return createApiProxy([...path, prop]);
    },

    apply(_, __, args: unknown[]) {
      const method = path.join(".");
      return rpc.call(method, args);
    },
  });
}

export const ext = createApiProxy() as ExtApi;
