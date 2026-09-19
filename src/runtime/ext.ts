import type { ExtApi } from "../types/ext.d.ts";
import { createFetchProxy } from "./ext-fetch.ts";
import { createRpcClient } from "./rpc.ts";

export const ext = createApiProxy() as ExtApi;

const rpc = createRpcClient();

function createApiProxy(path: string[] = []): unknown {
  const emptyTarget = () => {};

  return new Proxy(emptyTarget, {
    get(_, prop: string) {
      if (typeof prop === "symbol") return undefined;

      if (path.length === 0 && prop === "fetch") {
        return createFetchProxy(rpc);
      }

      if (
        path.length === 1 && path[0] === "scripting" &&
        prop === "executeInMainWorld"
      ) {
        return (func: (...args: unknown[]) => unknown, args: unknown[]) => {
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
