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

export type TabStatus = "unloaded" | "loading" | "complete";

export interface MutedInfo {
  muted: boolean;
  reason?: MutedInfoReason;
  extensionId?: string;
}

export type MutedInfoReason = "user" | "capture" | "extension";

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

export type WindowType = "normal" | "popup" | "panel" | "app" | "devtools";

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
  update(
    tabId: number,
    updateProperties: UpdateProperties,
  ): Promise<Tab | undefined>;
  update(updateProperties: UpdateProperties): Promise<Tab | undefined>;
  move(
    tabIds: number | number[],
    moveProperties: MoveProperties,
  ): Promise<Tab | Tab[]>;
  reload(tabId?: number, reloadProperties?: ReloadProperties): Promise<void>;
  remove(tabIds: number | number[]): Promise<void>;
  duplicate(tabId: number): Promise<Tab | undefined>;
  discard(tabId?: number): Promise<Tab | undefined>;
  goBack(tabId?: number): Promise<void>;
  goForward(tabId?: number): Promise<void>;
}

// deno-lint-ignore no-empty-interface
export interface FiberStorageLocal {}
// deno-lint-ignore no-empty-interface
export interface FiberStorageSync {}
// deno-lint-ignore no-empty-interface
export interface FiberStorageSession {}

export interface StorageAreaFor<S extends object> {
  get(): Promise<Partial<S>>;
  get<K extends keyof S & string>(key: K): Promise<Pick<Partial<S>, K>>;
  get<K extends keyof S & string>(keys: K[]): Promise<Pick<Partial<S>, K>>;
  get(defaults: Partial<S>): Promise<Partial<S>>;
  getBytesInUse(
    keys?: (keyof S & string) | (keyof S & string)[] | null,
  ): Promise<number>;
  set(items: Partial<S>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
  clear(): Promise<void>;
}

export interface StorageChange {
  oldValue?: unknown;
  newValue?: unknown;
}

export interface StorageApi {
  local: StorageAreaFor<FiberStorageLocal>;
  sync: StorageAreaFor<FiberStorageSync>;
  session: StorageAreaFor<FiberStorageSession>;
  managed: Pick<StorageAreaFor<FiberStorageLocal>, "get" | "getBytesInUse">;
}

export interface ScriptingApi {
  executeInMainWorld<T, A extends unknown[]>(
    func: (...args: A) => T,
    args: A,
  ): Promise<T>;
}

export interface FetchResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly statusText: string;
  readonly headers: Record<string, string>;

  text(): Promise<string>;

  json(): Promise<unknown>;

  arrayBuffer(): Promise<ArrayBuffer>;

  blob(): Promise<Blob>;
}

export type FetchFn = (
  input: string | URL,
  init?: RequestInit,
) => Promise<FetchResponse>;

export interface ExtApi {
  tabs: TabsApi;
  storage: StorageApi;
  scripting: ScriptingApi;

  fetch: FetchFn;
}
