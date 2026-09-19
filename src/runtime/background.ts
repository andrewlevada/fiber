import {
  createRpcServer,
  type RpcContext,
  RpcHandlers,
  withContext,
} from "./rpc.ts";

const RESPONSE_TTL_MS = 60_000;

interface CachedResponse {
  response: Response;
  expiresAt: number;
}

const responseCache = new Map<string, CachedResponse>();

const consumedResponses = new Set<string>();

function cleanupExpiredResponses(): void {
  const now = Date.now();
  for (const [id, cached] of responseCache) {
    if (cached.expiresAt <= now) {
      responseCache.delete(id);
    }
  }
}

setInterval(cleanupExpiredResponses, 30_000);

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

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

type BodyMode = "text" | "json" | "arrayBuffer" | "blob";

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

  cleanupExpiredResponses();

  const response = await fetch(url, init);

  const id = crypto.randomUUID();

  responseCache.set(id, {
    response,
    expiresAt: Date.now() + RESPONSE_TTL_MS,
  });

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

async function handleFetchBody(...args: unknown[]): Promise<unknown> {
  const [id, mode] = args as [string, BodyMode];

  if (consumedResponses.has(id)) {
    throw new Error("Response body has already been consumed");
  }

  const cached = responseCache.get(id);
  if (!cached) {
    throw new Error(
      "Response not found. It may have expired (60s TTL) or been consumed.",
    );
  }

  if (cached.expiresAt <= Date.now()) {
    responseCache.delete(id);
    throw new Error("Response has expired (60s TTL)");
  }

  consumedResponses.add(id);
  responseCache.delete(id);

  setTimeout(() => consumedResponses.delete(id), RESPONSE_TTL_MS);

  const { response } = cached;

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

const handleExecuteInMainWorld = withContext(
  async (ctx: RpcContext, ...rpcArgs: unknown[]): Promise<unknown> => {
    const [func, args] = rpcArgs as [string, unknown[]];
    const tabId = ctx.sender.tab?.id;

    if (!tabId) {
      throw new Error("Cannot determine tab ID from sender");
    }

    const executeWithTrustedTypes = (
      funcString: string,
      funcArgs: unknown[],
    ) => {
      const w = window as Window & {
        trustedTypes?: {
          createPolicy: (
            name: string,
            rules: Record<string, (input: string) => string>,
          ) => { createScript: (input: string) => unknown };
        };
        __fiberTTPolicy?: { createScript: (input: string) => unknown };
      };

      if (w.trustedTypes && !w.__fiberTTPolicy) {
        try {
          w.__fiberTTPolicy = w.trustedTypes.createPolicy("fiber-extension", {
            createScript: (input: string) => input,
          });
        } catch {
          // A page policy or CSP may prevent Fiber from creating its policy.
        }
      }

      try {
        const code = `(${funcString}).apply(null, ${JSON.stringify(funcArgs)})`;
        if (w.__fiberTTPolicy) {
          const trustedCode = w.__fiberTTPolicy.createScript(code);
          return (0, eval)(trustedCode as string);
        } else {
          return (0, eval)(code);
        }
      } catch (e) {
        throw new Error(
          `Failed to execute in main world: ${
            e instanceof Error ? e.message : String(e)
          }`,
        );
      }
    };

    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: executeWithTrustedTypes as () => unknown,
      args: [func, args],
    });

    return results[0]?.result;
  },
);

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

const handlers: RpcHandlers = {
  tabs: bindChromeMethods(chrome.tabs),
  storage: {
    local: bindChromeMethods(chrome.storage.local),
    sync: bindChromeMethods(chrome.storage.sync),
    session: bindChromeMethods(chrome.storage.session),
  },
  scripting: {
    executeInMainWorld: handleExecuteInMainWorld,
  },

  fetch: handleFetch,
  fetchBody: handleFetchBody,
};

createRpcServer(handlers);

const CSP_RELAX_RULE_ID = 1;

async function setupCspRelaxation(): Promise<void> {
  if (!chrome.declarativeNetRequest?.updateDynamicRules) {
    return;
  }
  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [CSP_RELAX_RULE_ID],
      addRules: [
        {
          id: CSP_RELAX_RULE_ID,
          priority: 1,
          action: {
            type:
              "modifyHeaders" as chrome.declarativeNetRequest.RuleActionType,
            responseHeaders: [
              {
                header: "content-security-policy",
                operation:
                  "remove" as chrome.declarativeNetRequest.HeaderOperation,
              },
              {
                header: "content-security-policy-report-only",
                operation:
                  "remove" as chrome.declarativeNetRequest.HeaderOperation,
              },
            ],
          },
          condition: {
            urlFilter: "*",
            resourceTypes: [
              "main_frame",
              "sub_frame",
            ] as chrome.declarativeNetRequest.ResourceType[],
          },
        },
      ],
    });
  } catch (e) {
    console.error("[fiber] Failed to register CSP relaxation rule:", e);
  }
}

setupCspRelaxation();

chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    chrome.tabs.sendMessage(tab.id, { type: "fiber:toggle-overlay" });
  }
});
