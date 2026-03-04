/**
 * TypeScript Definitions for ext API
 *
 * These types mirror Chrome API types but ensure all methods return Promise.
 * This is because all Chrome API calls go through RPC in content scripts.
 */

// ============================================================================
// Tabs API
// ============================================================================

export interface Tab {
  id?: number;
  index: number;
  windowId: number;
  openerTabId?: number;
  highlighted: boolean;
  active: boolean;
  pinned: boolean;
  audible?: boolean;
  discarded: boolean;
  autoDiscardable: boolean;
  mutedInfo?: MutedInfo;
  url?: string;
  pendingUrl?: string;
  title?: string;
  favIconUrl?: string;
  status?: TabStatus;
  incognito: boolean;
  width?: number;
  height?: number;
  sessionId?: string;
  groupId: number;
  lastAccessed?: number;
}

export type TabStatus = 'unloaded' | 'loading' | 'complete';

export interface MutedInfo {
  muted: boolean;
  reason?: MutedInfoReason;
  extensionId?: string;
}

export type MutedInfoReason = 'user' | 'capture' | 'extension';

export interface QueryInfo {
  active?: boolean;
  audible?: boolean;
  autoDiscardable?: boolean;
  currentWindow?: boolean;
  discarded?: boolean;
  groupId?: number;
  highlighted?: boolean;
  index?: number;
  lastFocusedWindow?: boolean;
  muted?: boolean;
  pinned?: boolean;
  status?: TabStatus;
  title?: string;
  url?: string | string[];
  windowId?: number;
  windowType?: WindowType;
}

export type WindowType = 'normal' | 'popup' | 'panel' | 'app' | 'devtools';

export interface CreateProperties {
  windowId?: number;
  index?: number;
  url?: string;
  active?: boolean;
  pinned?: boolean;
  openerTabId?: number;
}

export interface UpdateProperties {
  url?: string;
  active?: boolean;
  highlighted?: boolean;
  pinned?: boolean;
  muted?: boolean;
  openerTabId?: number;
  autoDiscardable?: boolean;
}

export interface MoveProperties {
  windowId?: number;
  index: number;
}

export interface ReloadProperties {
  bypassCache?: boolean;
}

export interface TabsApi {
  query(queryInfo: QueryInfo): Promise<Tab[]>;
  get(tabId: number): Promise<Tab>;
  getCurrent(): Promise<Tab | undefined>;
  create(createProperties: CreateProperties): Promise<Tab>;
  update(tabId: number, updateProperties: UpdateProperties): Promise<Tab | undefined>;
  update(updateProperties: UpdateProperties): Promise<Tab | undefined>;
  move(tabIds: number | number[], moveProperties: MoveProperties): Promise<Tab | Tab[]>;
  reload(tabId?: number, reloadProperties?: ReloadProperties): Promise<void>;
  remove(tabIds: number | number[]): Promise<void>;
  duplicate(tabId: number): Promise<Tab | undefined>;
  discard(tabId?: number): Promise<Tab | undefined>;
  goBack(tabId?: number): Promise<void>;
  goForward(tabId?: number): Promise<void>;
}

// ============================================================================
// Storage API
// ============================================================================

export interface StorageArea {
  get(keys?: string | string[] | Record<string, unknown> | null): Promise<Record<string, unknown>>;
  getBytesInUse(keys?: string | string[] | null): Promise<number>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
  clear(): Promise<void>;
}

export interface StorageChange {
  oldValue?: unknown;
  newValue?: unknown;
}

export interface StorageApi {
  local: StorageArea;
  sync: StorageArea;
  session: StorageArea;
  managed: Pick<StorageArea, 'get' | 'getBytesInUse'>;
}

// ============================================================================
// Fetch Proxy Types
// ============================================================================

/**
 * Response handle returned by ext.fetch.
 * Body methods trigger RPC calls to consume the cached response in background.
 *
 * Important behavior:
 * - Body can only be consumed once (standard fetch behavior)
 * - Response is cached in background for 60 seconds
 * - ArrayBuffer and Blob are base64-encoded for RPC transport
 * - AbortSignal is not supported (will be ignored with a warning)
 */
export interface FetchResponse {
  /** True if status is in the 200-299 range */
  readonly ok: boolean;
  /** HTTP status code */
  readonly status: number;
  /** HTTP status text (e.g., "OK", "Not Found") */
  readonly statusText: string;
  /** Response headers as a plain object */
  readonly headers: Record<string, string>;

  /**
   * Read body as text. Can only be called once.
   * @throws Error if body was already consumed or response expired
   */
  text(): Promise<string>;

  /**
   * Read body as JSON. Can only be called once.
   * @throws Error if body was already consumed, response expired, or JSON is invalid
   */
  json(): Promise<unknown>;

  /**
   * Read body as ArrayBuffer. Can only be called once.
   * Note: Data is base64-encoded during transport and decoded on client.
   * @throws Error if body was already consumed or response expired
   */
  arrayBuffer(): Promise<ArrayBuffer>;

  /**
   * Read body as Blob. Can only be called once.
   * Note: Data is base64-encoded during transport and decoded on client.
   * @throws Error if body was already consumed or response expired
   */
  blob(): Promise<Blob>;
}

/**
 * Fetch function type for ext.fetch.
 * Similar to global fetch() but executes in the background script.
 *
 * Limitations:
 * - Only string request bodies are supported
 * - AbortSignal is not supported
 * - Response body can only be read once
 * - Response expires after 60 seconds if not consumed
 */
export type FetchFn = (
  input: string | URL,
  init?: RequestInit
) => Promise<FetchResponse>;

// ============================================================================
// Main ext API
// ============================================================================

export interface ExtApi {
  tabs: TabsApi;
  storage: StorageApi;

  /**
   * Fetch API proxy that executes in the background script.
   * Useful for bypassing CORS restrictions in content scripts.
   *
   * Note: Response body can only be read once (standard fetch behavior).
   */
  fetch: FetchFn;
}
