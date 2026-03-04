/**
 * Fetch Proxy for Content Scripts
 *
 * Provides a fetch-like API that executes requests in the background script,
 * bypassing CORS restrictions. Response bodies are cached in background and
 * streamed back via RPC when consumed.
 */

import type { FetchResponse, FetchFn } from '../types/ext';
import type { RpcClient } from './rpc';

/** Metadata returned from background after initiating fetch */
interface FetchMetadata {
  id: string;
  ok: boolean;
  status: number;
  statusText: string;
  headers: Record<string, string>;
}

/** Body read modes supported by fetchBody RPC */
type BodyMode = 'text' | 'json' | 'arrayBuffer' | 'blob';

/** Serializable RequestInit for RPC transport */
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
  signal?: undefined; // Cannot serialize AbortSignal
}

/**
 * Convert RequestInit to a serializable format for RPC transport.
 * Headers are normalized to a plain object, body to string.
 */
function serializeInit(init?: RequestInit): SerializableRequestInit | undefined {
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

  // Normalize headers to plain object
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

  // Serialize body to string (only string bodies supported for now)
  if (init.body !== undefined) {
    if (typeof init.body === 'string') {
      serialized.body = init.body;
    } else {
      throw new Error('ext.fetch only supports string request bodies');
    }
  }

  // AbortSignal cannot be serialized
  if (init.signal) {
    console.warn('ext.fetch: AbortSignal is not supported and will be ignored');
  }

  return serialized;
}

/**
 * Decode base64-encoded binary data back to ArrayBuffer
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Creates a Response proxy that lazily fetches body via RPC.
 */
function createResponseProxy(rpc: RpcClient, meta: FetchMetadata): FetchResponse {
  let bodyConsumed = false;

  const consumeBody = async <T>(mode: BodyMode, transform: (data: unknown) => T): Promise<T> => {
    if (bodyConsumed) {
      throw new Error('Body has already been consumed');
    }
    bodyConsumed = true;

    const result = await rpc.call('fetchBody', [meta.id, mode]);
    return transform(result);
  };

  return {
    get ok() { return meta.ok; },
    get status() { return meta.status; },
    get statusText() { return meta.statusText; },
    get headers() { return meta.headers; },

    text(): Promise<string> {
      return consumeBody('text', data => data as string);
    },

    json(): Promise<unknown> {
      return consumeBody('json', data => data);
    },

    arrayBuffer(): Promise<ArrayBuffer> {
      return consumeBody('arrayBuffer', data => base64ToArrayBuffer(data as string));
    },

    blob(): Promise<Blob> {
      return consumeBody('blob', data => {
        const { base64, type } = data as { base64: string; type: string };
        const buffer = base64ToArrayBuffer(base64);
        return new Blob([buffer], { type });
      });
    }
  };
}

/**
 * Creates a fetch proxy that executes requests in the background script.
 */
export function createFetchProxy(rpc: RpcClient): FetchFn {
  return async (input: string | URL, init?: RequestInit): Promise<FetchResponse> => {
    const url = input instanceof URL ? input.href : input;
    const serializedInit = serializeInit(init);

    const meta = await rpc.call('fetch', [url, serializedInit]) as FetchMetadata;
    return createResponseProxy(rpc, meta);
  };
}
