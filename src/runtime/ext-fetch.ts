import type { FetchFn, FetchResponse } from "../types/ext.d.ts";
import type { RpcClient } from "./rpc.ts";

interface FetchMetadata {
  id: string;
  ok: boolean;
  status: number;
  statusText: string;
  headers: Record<string, string>;
}

type BodyMode = "text" | "json" | "arrayBuffer" | "blob";

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
  signal?: undefined;
}

export function createFetchProxy(rpc: RpcClient): FetchFn {
  return async (
    input: string | URL,
    init?: RequestInit,
  ): Promise<FetchResponse> => {
    const url = input instanceof URL ? input.href : input;
    const serializedInit = serializeInit(init);

    const meta = await rpc.call("fetch", [
      url,
      serializedInit,
    ]) as FetchMetadata;

    return createResponseProxy(rpc, meta);
  };
}

function serializeInit(
  init?: RequestInit,
): SerializableRequestInit | undefined {
  if (!init) return undefined;

  const serialized: SerializableRequestInit = {};

  if (init.method) serialized.method = init.method;
  if (init.mode) serialized.mode = init.mode;
  if (init.credentials) serialized.credentials = init.credentials;
  if (init.cache) serialized.cache = init.cache;
  if (init.redirect) serialized.redirect = init.redirect;
  if (init.referrer) serialized.referrer = init.referrer;
  if (init.referrerPolicy) serialized.referrerPolicy = init.referrerPolicy;
  if (init.integrity) serialized.integrity = init.integrity;
  if (init.keepalive !== undefined) serialized.keepalive = init.keepalive;

  if (init.headers) {
    if (init.headers instanceof Headers) {
      serialized.headers = {};
      init.headers.forEach((value, key) => {
        serialized.headers![key] = value;
      });
    } else if (Array.isArray(init.headers)) {
      serialized.headers = {};
      for (const [key, value] of init.headers) {
        serialized.headers[key] = value;
      }
    } else {
      serialized.headers = init.headers as Record<string, string>;
    }
  }

  if (init.body !== undefined) {
    if (typeof init.body === "string") {
      serialized.body = init.body;
    } else {
      throw new Error("ext.fetch only supports string request bodies");
    }
  }

  if (init.signal) {
    console.warn("ext.fetch: AbortSignal is not supported and will be ignored");
  }

  return serialized;
}

function createResponseProxy(
  rpc: RpcClient,
  meta: FetchMetadata,
): FetchResponse {
  let bodyConsumed = false;

  const consumeBody = async <T>(
    mode: BodyMode,
    transform: (data: unknown) => T,
  ): Promise<T> => {
    if (bodyConsumed) {
      throw new Error("Body has already been consumed");
    }
    bodyConsumed = true;

    const result = await rpc.call("fetchBody", [meta.id, mode]);
    return transform(result);
  };

  return {
    get ok() {
      return meta.ok;
    },
    get status() {
      return meta.status;
    },
    get statusText() {
      return meta.statusText;
    },
    get headers() {
      return meta.headers;
    },

    text(): Promise<string> {
      return consumeBody("text", (data) => data as string);
    },

    json(): Promise<unknown> {
      return consumeBody("json", (data) => data);
    },

    arrayBuffer(): Promise<ArrayBuffer> {
      return consumeBody(
        "arrayBuffer",
        (data) => base64ToArrayBuffer(data as string),
      );
    },

    blob(): Promise<Blob> {
      return consumeBody("blob", (data) => {
        const { base64, type } = data as { base64: string; type: string };
        const buffer = base64ToArrayBuffer(base64);
        return new Blob([buffer], { type });
      });
    },
  };
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);

  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  return bytes.buffer;
}
