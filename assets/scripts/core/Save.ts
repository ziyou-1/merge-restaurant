import { SAVE_KEY } from '../config/GameConfig';
import { GameState } from './GameState';
import type { GameJSON, GameOptions } from './GameState';

/** 存储抽象：cc 的 sys.localStorage 和 wx 的同步存储都满足这个形状 */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function saveGame(game: GameState, store: KeyValueStore): void {
  writeSaveJSON(store, game.toJSON());
}

export function writeSaveJSON(store: KeyValueStore, data: GameJSON): void {
  store.setItem(SAVE_KEY, JSON.stringify(data));
}

/** 只读出原始 JSON（云端比新旧用），没有 / 损坏返回 null */
export function readSaveJSON(store: KeyValueStore): GameJSON | null {
  const raw = store.getItem(SAVE_KEY);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as GameJSON;
    return data && data.v === 1 ? data : null;
  } catch {
    return null;
  }
}

/** 没存档或存档损坏返回 null */
export function loadGame(store: KeyValueStore, opts: GameOptions = {}): GameState | null {
  const data = readSaveJSON(store);
  return data ? GameState.fromJSON(data, opts) : null;
}

export function clearSave(store: KeyValueStore): void {
  store.removeItem(SAVE_KEY);
}

/** 内存版，测试和浏览器无存储时兜底 */
export class MemoryStore implements KeyValueStore {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}
