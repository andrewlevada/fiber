/**
 * RPC Transport Layer
 *
 * Hidden RPC layer for communication between content scripts and background
 */

// Types
export interface RpcRequest {
  id: string;
  method: string; // e.g., "tabs.query"
  args: unknown[];
}

export interface RpcResponse {
  id: string;
  result?: unknown;
  error?: { message: string; stack?: string };
}

export interface RpcClient {
  call(method: string, args: unknown[]): Promise<unknown>;
}

export interface RpcContext {
  sender: chrome.runtime.MessageSender;
}

export type RpcHandler = (...args: unknown[]) => unknown | Promise<unknown>;
export type RpcContextHandler = (
  ctx: RpcContext,
  ...args: unknown[]
) => unknown | Promise<unknown>;
export type RpcHandlers = Record<
  string,
  RpcHandler | RpcContextHandler | Record<string, unknown>
>;

const RPC_TIMEOUT_MS = 30_000;

/** Symbol to mark handlers that need RPC context (sender info) */
export const needsContext = Symbol("needsContext");

/** Mark a handler as needing RPC context (sender info) */
export function withContext(
  handler: RpcContextHandler,
): RpcContextHandler & { [needsContext]: true } {
  const wrapped = handler as RpcContextHandler & { [needsContext]: true };
  wrapped[needsContext] = true;
  return wrapped;
}

/**
 * Resolve nested handler paths like "tabs.query" -> handlers.tabs.query
 */
export function resolveHandler(
  handlers: Record<string, unknown>,
  method: string,
): RpcHandler | undefined {
  const parts = method.split(".");
  let current: unknown = handlers;

  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }

  return typeof current === "function" ? (current as RpcHandler) : undefined;
}

/**
 * Creates an RPC client for content script side.
 * Uses chrome.runtime.sendMessage to communicate with background.
 */
export function createRpcClient(): RpcClient {
  return {
    async call(method: string, args: unknown[]): Promise<unknown> {
      const id = crypto.randomUUID();
      const request: RpcRequest = { id, method, args };

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(
            new Error(
              `RPC timeout: ${method} did not respond within ${RPC_TIMEOUT_MS}ms`,
            ),
          );
        }, RPC_TIMEOUT_MS);
      });

      // Race the actual request against the timeout
      const response = await Promise.race([
        chrome.runtime.sendMessage(request) as Promise<RpcResponse>,
        timeoutPromise,
      ]);

      if (response.error) {
        const err = new Error(response.error.message);
        err.stack = response.error.stack;
        throw err;
      }

      return response.result;
    },
  };
}

/**
 * Creates an RPC server for background side.
 * Handles incoming messages and dispatches to appropriate handlers.
 */
export function createRpcServer(handlers: RpcHandlers): void {
  chrome.runtime.onMessage.addListener(
    (
      msg: RpcRequest,
      sender,
      sendResponse: (response: RpcResponse) => void,
    ) => {
      // Validate sender is from this extension - fail fast with clear error
      if (sender.id !== chrome.runtime.id) {
        sendResponse({
          id: msg.id,
          error: { message: "RPC rejected: invalid sender" },
        });
        return true;
      }

      // Validate message structure
      if (!msg.id || !msg.method || !Array.isArray(msg.args)) {
        sendResponse({
          id: msg.id ?? "",
          error: { message: "RPC rejected: invalid message format" },
        });
        return true;
      }

      const handler = resolveHandler(handlers, msg.method);
      if (!handler) {
        sendResponse({
          id: msg.id,
          error: {
            message:
              `Unknown method (or the Fiber does not support it yet): ${msg.method}`,
          },
        });
        return true;
      }

      // Check if handler needs context (sender info)
      const ctx: RpcContext = { sender };
      const callHandler = () =>
        (handler as { [needsContext]?: boolean })[needsContext]
          ? (handler as RpcContextHandler)(ctx, ...msg.args)
          : handler(...msg.args);

      Promise.resolve()
        .then(callHandler)
        .then((result) => sendResponse({ id: msg.id, result }))
        .catch((err) =>
          sendResponse({
            id: msg.id,
            error: {
              message: err instanceof Error ? err.message : String(err),
              stack: err instanceof Error ? err.stack : undefined,
            },
          })
        );

      return true; // async response
    },
  );
}
