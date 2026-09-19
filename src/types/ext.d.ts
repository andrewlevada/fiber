export interface ExtApi {
  tabs: typeof chrome.tabs;
  storage: StorageApi;
  scripting: ScriptingApi;

  fetch: typeof fetch;
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
