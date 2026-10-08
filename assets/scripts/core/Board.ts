import { BOARD_COLS, BOARD_ROWS, GENERATOR, MAX_LEVEL } from '../config/GameConfig';

export type ItemKind = 'item' | 'generator';

export interface BoardItem {
  id: number;
  kind: ItemKind;
  chain: string;
  /** 普通物品 1..MAX_LEVEL；生成器固定 0 */
  level: number;
  /** 生成器剩余点击次数 */
  charges?: number;
  /** 生成器上次结算恢复的时间戳(ms) */
  lastRechargeTs?: number;
}

/** 对棋盘物品的需求（订单、装修任务共用） */
export interface ItemReq {
  chain: string;
  level: number;
  count: number;
}

export type MoveResult =
  | { type: 'none' }
  | { type: 'move'; item: BoardItem; from: number; to: number }
  | { type: 'swap'; a: BoardItem; b: BoardItem; from: number; to: number }
  | { type: 'merge'; from: number; to: number; consumed: BoardItem; target: BoardItem; result: BoardItem };

export type SpawnResult =
  | { ok: true; item: BoardItem; from: number; to: number }
  | { ok: false; reason: 'not-generator' | 'no-charges' | 'board-full' };

export interface BoardJSON {
  cols: number;
  rows: number;
  nextId: number;
  cells: (BoardItem | null)[];
}

/**
 * 纯逻辑棋盘：格子、物品、生成器、合成规则。不依赖 cc。
 * 格子下标 idx = y * cols + x，x 向右，y 向下（第 0 行在最上面）。
 */
export class Board {
  readonly cols: number;
  readonly rows: number;
  private cells: (BoardItem | null)[];
  private nextId = 1;

  constructor(cols = BOARD_COLS, rows = BOARD_ROWS) {
    this.cols = cols;
    this.rows = rows;
    this.cells = new Array(cols * rows).fill(null);
  }

  // ---------- 坐标 ----------
  index(x: number, y: number): number {
    return y * this.cols + x;
  }

  coords(idx: number): { x: number; y: number } {
    return { x: idx % this.cols, y: Math.floor(idx / this.cols) };
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.cols && y < this.rows;
  }

  get size(): number {
    return this.cells.length;
  }

  // ---------- 读取 ----------
  get(idx: number): BoardItem | null {
    return this.cells[idx] ?? null;
  }

  /** 所有非空格子 */
  entries(): { idx: number; item: BoardItem }[] {
    const out: { idx: number; item: BoardItem }[] = [];
    this.cells.forEach((item, idx) => {
      if (item) out.push({ idx, item });
    });
    return out;
  }

  emptyCount(): number {
    return this.cells.filter((c) => c === null).length;
  }

  isFull(): boolean {
    return this.emptyCount() === 0;
  }

  /** 找出满足 chain/level 的普通物品下标 */
  find(chain: string, level: number): number[] {
    const out: number[] = [];
    this.cells.forEach((item, idx) => {
      if (item && item.kind === 'item' && item.chain === chain && item.level === level) out.push(idx);
    });
    return out;
  }

  count(chain: string, level: number): number {
    return this.find(chain, level).length;
  }

  /** 棋盘上是否凑齐了一组需求（同种需求按数量累加） */
  hasItems(reqs: ItemReq[]): boolean {
    const need = new Map<string, number>();
    for (const r of reqs) {
      const k = `${r.chain}:${r.level}`;
      need.set(k, (need.get(k) ?? 0) + r.count);
    }
    for (const [k, n] of need) {
      const [chain, level] = k.split(':');
      if (this.count(chain, Number(level)) < n) return false;
    }
    return true;
  }

  /** 按需求从棋盘拿走物品，返回拿走的格子下标；凑不齐时什么都不动并返回 null */
  takeItems(reqs: ItemReq[]): number[] | null {
    if (!this.hasItems(reqs)) return null;
    const removed: number[] = [];
    for (const r of reqs) {
      for (let i = 0; i < r.count; i++) {
        const idx = this.find(r.chain, r.level).find((c) => !removed.includes(c));
        if (idx === undefined) return null; // hasItems 已保证不会走到
        this.removeAt(idx);
        removed.push(idx);
      }
    }
    return removed;
  }

  // ---------- 写入 ----------
  set(idx: number, item: BoardItem | null): void {
    this.cells[idx] = item;
  }

  removeAt(idx: number): BoardItem | null {
    const item = this.cells[idx];
    this.cells[idx] = null;
    return item;
  }

  createItem(chain: string, level: number): BoardItem {
    return { id: this.nextId++, kind: 'item', chain, level };
  }

  createGenerator(chain: string, now: number): BoardItem {
    return { id: this.nextId++, kind: 'generator', chain, level: 0, charges: GENERATOR.maxCharges, lastRechargeTs: now };
  }

  /** 放到指定格（必须为空），返回是否成功 */
  place(idx: number, item: BoardItem): boolean {
    if (this.cells[idx]) return false;
    this.cells[idx] = item;
    return true;
  }

  /** 放到离 fromIdx 最近的空格；没有空格返回 -1 */
  placeNear(fromIdx: number, item: BoardItem): number {
    const idx = this.nearestEmpty(fromIdx);
    if (idx < 0) return -1;
    this.cells[idx] = item;
    return idx;
  }

  /** 以欧氏距离找最近空格，距离相同优先上方/左方（稳定、可预测） */
  nearestEmpty(fromIdx: number): number {
    const from = this.coords(fromIdx);
    let best = -1;
    let bestDist = Infinity;
    for (let idx = 0; idx < this.cells.length; idx++) {
      if (this.cells[idx]) continue;
      const c = this.coords(idx);
      const dx = c.x - from.x;
      const dy = c.y - from.y;
      const d = dx * dx + dy * dy;
      if (d < bestDist) {
        bestDist = d;
        best = idx;
      }
    }
    return best;
  }

  // ---------- 合成 ----------
  canMerge(a: BoardItem | null, b: BoardItem | null): boolean {
    if (!a || !b || a === b) return false;
    if (a.kind !== 'item' || b.kind !== 'item') return false;
    if (a.chain !== b.chain || a.level !== b.level) return false;
    return a.level < MAX_LEVEL;
  }

  /**
   * 把 from 格的物品拖到 to 格：
   *  - to 为空 → 移动
   *  - 可合成 → 合成，结果留在 to，from 清空
   *  - 否则 → 交换
   */
  move(from: number, to: number): MoveResult {
    if (from === to) return { type: 'none' };
    const a = this.cells[from];
    if (!a) return { type: 'none' };
    const b = this.cells[to];

    if (!b) {
      this.cells[to] = a;
      this.cells[from] = null;
      return { type: 'move', item: a, from, to };
    }

    if (this.canMerge(a, b)) {
      const result = this.createItem(a.chain, a.level + 1);
      this.cells[to] = result;
      this.cells[from] = null;
      return { type: 'merge', from, to, consumed: a, target: b, result };
    }

    this.cells[to] = a;
    this.cells[from] = b;
    return { type: 'swap', a, b, from, to };
  }

  // ---------- 生成器 ----------
  /** 结算生成器的充能恢复，返回是否有变化 */
  tickGenerators(now: number): boolean {
    let changed = false;
    const ms = GENERATOR.rechargeSeconds * 1000;
    for (const item of this.cells) {
      if (!item || item.kind !== 'generator') continue;
      const charges = item.charges ?? 0;
      let last = item.lastRechargeTs ?? now;
      if (last > now) item.lastRechargeTs = last = now; // 时间戳来自未来：当作现在
      if (charges >= GENERATOR.maxCharges) {
        item.lastRechargeTs = now;
        continue;
      }
      const gained = Math.floor((now - last) / ms);
      if (gained <= 0) continue;
      item.charges = Math.min(GENERATOR.maxCharges, charges + gained);
      item.lastRechargeTs = item.charges >= GENERATOR.maxCharges ? now : last + gained * ms;
      changed = true;
    }
    return changed;
  }

  /** 距离下一次充能恢复还有几秒（满了返回 0） */
  generatorRechargeIn(item: BoardItem, now: number): number {
    if ((item.charges ?? 0) >= GENERATOR.maxCharges) return 0;
    const ms = GENERATOR.rechargeSeconds * 1000;
    const elapsed = Math.max(0, now - (item.lastRechargeTs ?? now));
    return Math.max(0, Math.ceil((ms - (elapsed % ms)) / 1000));
  }

  /**
   * 点击生成器：消耗 1 次充能，在最近空格生成一个低级物品。
   * 体力扣除由上层负责（这里不关心体力）。
   */
  spawn(genIdx: number, now: number, rng: () => number = Math.random): SpawnResult {
    const gen = this.cells[genIdx];
    if (!gen || gen.kind !== 'generator') return { ok: false, reason: 'not-generator' };
    this.tickGenerators(now);
    if ((gen.charges ?? 0) <= 0) return { ok: false, reason: 'no-charges' };
    const to = this.nearestEmpty(genIdx);
    if (to < 0) return { ok: false, reason: 'board-full' };

    const level = rng() < GENERATOR.level2Chance ? 2 : 1;
    const item = this.createItem(gen.chain, level);
    this.cells[to] = item;
    if (gen.charges === GENERATOR.maxCharges) gen.lastRechargeTs = now; // 从满开始计时
    gen.charges = (gen.charges ?? 0) - 1;
    return { ok: true, item, from: genIdx, to };
  }

  // ---------- 存档 ----------
  toJSON(): BoardJSON {
    return { cols: this.cols, rows: this.rows, nextId: this.nextId, cells: this.cells.map((c) => (c ? { ...c } : null)) };
  }

  static fromJSON(data: BoardJSON): Board {
    const b = new Board(data.cols, data.rows);
    b.nextId = data.nextId;
    for (let i = 0; i < b.cells.length; i++) {
      const c = data.cells[i];
      b.cells[i] = c ? { ...c } : null;
    }
    return b;
  }
}
