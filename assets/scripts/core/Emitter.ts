/** 极简事件分发，不依赖 cc，方便逻辑层在 Node 里跑测试 */
export type Listener<T> = (payload: T) => void;

export class Emitter<E extends object> {
  private listeners: { [K in keyof E]?: Listener<E[K]>[] } = {};

  on<K extends keyof E>(event: K, fn: Listener<E[K]>): () => void {
    const list = (this.listeners[event] ??= []);
    list.push(fn);
    return () => this.off(event, fn);
  }

  off<K extends keyof E>(event: K, fn: Listener<E[K]>): void {
    const list = this.listeners[event];
    if (!list) return;
    const i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  }

  emit<K extends keyof E>(event: K, payload: E[K]): void {
    const list = this.listeners[event];
    if (!list) return;
    for (const fn of [...list]) fn(payload);
  }
}
