/** A minimal external store for React: one value, partial updates, selector hooks. */
import { useSyncExternalStore } from "react";

export interface Store<T> {
  get(): T;
  set(patch: Partial<T> | ((s: T) => Partial<T>)): void;
  subscribe(fn: () => void): () => void;
  /** Reads a slice; the selector must return a primitive or a stable reference. */
  use<S>(select: (s: T) => S): S;
}

export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial;
  const subs = new Set<() => void>();
  const store: Store<T> = {
    get: () => state,
    set(patch) {
      const p = typeof patch === "function" ? patch(state) : patch;
      state = { ...state, ...p };
      for (const fn of [...subs]) fn();
    },
    subscribe(fn) {
      subs.add(fn);
      return () => void subs.delete(fn);
    },
    use: (select) => useSyncExternalStore(store.subscribe, () => select(state)),
  };
  return store;
}
