import type { RpcClient } from "./rpc.ts";

interface FetchMetadata {
  id: string;
  ok: boolean;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  redirected: boolean;
  type: ResponseType;
  url: string;
}

export function createFetchProxy(rpc: RpcClient): typeof fetch {
  const proxy = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = input instanceof Request
      ? input.url
      : input instanceof URL
      ? input.href
      : input;
    const serializedInit = serializeInit(init);

    const meta = await rpc.call("fetch", [
      url,
      serializedInit,
    ]) as FetchMetadata;

    return createResponseProxy(rpc, meta) as unknown as Response;
  };

  return proxy;
}

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

type BodyMode = "text" | "json" | "arrayBuffer" | "blob" | "bytes" | "formData";

function createResponseProxy(
  rpc: RpcClient,
  meta: FetchMetadata,
): Awaited<ReturnType<typeof fetch>> {
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

  return new class {
    readonly ok = meta.ok;
    readonly status = meta.status;
    readonly statusText = meta.statusText;
    readonly headers = new Headers(meta.headers);
    readonly redirected = meta.redirected;
    readonly type = meta.type;
    readonly url = meta.url;
    readonly body = null;

    get bodyUsed(): boolean {
      return bodyConsumed;
    }

    text(): Promise<string> {
      return consumeBody("text", (data) => data as string);
    }

    // deno-lint-ignore no-explicit-any
    json(): Promise<any> {
      return consumeBody("json", (data) => data);
    }

    arrayBuffer(): Promise<ArrayBuffer> {
      return consumeBody(
        "arrayBuffer",
        (data) => base64ToArrayBuffer(data as string),
      );
    }

    blob(): Promise<Blob> {
      return consumeBody("blob", (data) => {
        const { base64, type } = data as { base64: string; type: string };
        const buffer = base64ToArrayBuffer(base64);

        return new Blob([buffer], { type });
      });
    }

    bytes(): Promise<Uint8Array<ArrayBuffer>> {
      return consumeBody(
        "bytes",
        (data) => new Uint8Array(base64ToArrayBuffer(data as string)),
      );
    }

    formData(): Promise<FormData> {
      return consumeBody("formData", (data) => {
        const formData = new FormData();

        for (
          const entry of data as Array<{
            name: string;
            value: string | { base64: string; name: string; type: string };
          }>
        ) {
          if (typeof entry.value === "string") {
            formData.append(entry.name, entry.value);
          } else {
            const file = new File(
              [base64ToArrayBuffer(entry.value.base64)],
              entry.value.name,
              { type: entry.value.type },
            );
            formData.append(entry.name, file);
          }
        }

        return formData;
      });
    }

    clone(): Response {
      if (bodyConsumed) {
        throw new TypeError("Response body has already been consumed");
      }

      return createResponseProxy(rpc, meta);
    }
  }();
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);

  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  return bytes.buffer;
}
