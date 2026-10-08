import { MAX_LEVEL, ORDER, orderReward } from '../config/GameConfig';
import type { Board } from './Board';

export interface OrderReq {
  chain: string;
  level: number;
}

export interface Order {
  id: number;
  customer: string;
  reqs: OrderReq[];
  coins: number;
  xp: number;
}

export interface OrdersJSON {
  nextId: number;
  orders: Order[];
  skipReadyAt?: number;
}

/** 顾客订单：随机生成、判断可交付、交付时从棋盘扣物品 */
export class Orders {
  orders: Order[] = [];
  private nextId = 1;
  /** 下次可以换单的时间戳 */
  skipReadyAt = 0;

  /** 生成一张订单。要求的等级随玩家等级放宽，偏向低等级 */
  generate(playerLevel: number, unlockedChains: string[], rng: () => number = Math.random): Order {
    const maxLevel = Math.min(MAX_LEVEL, ORDER.maxLevel, Math.max(ORDER.minLevel, 1 + playerLevel));
    const reqCount = Math.min(ORDER.maxRequirements, rng() < 0.4 ? 2 : 1);
    const reqs: OrderReq[] = [];
    for (let i = 0; i < reqCount; i++) {
      const chain = unlockedChains[Math.floor(rng() * unlockedChains.length)];
      // 用平方偏向低等级：level = min + floor(span * r^2)
      const span = maxLevel - ORDER.minLevel + 1;
      const r = rng();
      const level = ORDER.minLevel + Math.floor(span * r * r);
      reqs.push({ chain, level: Math.min(maxLevel, level) });
    }
    const reward = orderReward(reqs.map((r) => r.level), playerLevel);
    const customer = ORDER.customers[Math.floor(rng() * ORDER.customers.length)];
    const order: Order = { id: this.nextId++, customer, reqs, coins: reward.coins, xp: reward.xp };
    return order;
  }

  /** 把订单槽补满 */
  fill(playerLevel: number, unlockedChains: string[], rng: () => number = Math.random): Order[] {
    const added: Order[] = [];
    while (this.orders.length < ORDER.slots) {
      const o = this.generate(playerLevel, unlockedChains, rng);
      this.orders.push(o);
      added.push(o);
    }
    return added;
  }

  get(id: number): Order | undefined {
    return this.orders.find((o) => o.id === id);
  }

  /** 棋盘上是否凑齐了这张订单的所有要求 */
  canFulfill(order: Order, board: Board): boolean {
    return board.hasItems(order.reqs.map((r) => ({ ...r, count: 1 })));
  }

  /** 交付：从棋盘移除对应物品，订单出列。返回移除的格子下标，失败返回 null */
  fulfill(id: number, board: Board): { order: Order; removed: number[] } | null {
    const order = this.get(id);
    if (!order) return null;
    const removed = board.takeItems(order.reqs.map((r) => ({ ...r, count: 1 })));
    if (!removed) return null;
    this.orders = this.orders.filter((o) => o.id !== id);
    return { order, removed };
  }

  /** 存档时间戳来自未来（改过时间 / 换机 / 云档）：剩余冷却最多算一个完整冷却，和体力、充能的保护一致 */
  private clampSkip(now: number): void {
    const max = ORDER.skipCooldownSeconds * 1000;
    if (this.skipReadyAt - now > max) this.skipReadyAt = now + max;
  }

  canSkip(now: number): boolean {
    this.clampSkip(now);
    return now >= this.skipReadyAt;
  }

  /** 距离可以换单还有几秒 */
  skipWaitSeconds(now: number): number {
    this.clampSkip(now);
    return Math.max(0, Math.ceil((this.skipReadyAt - now) / 1000));
  }

  /** 换一单：把这张换成新的，进入冷却。冷却中返回 null */
  skip(id: number, now: number, playerLevel: number, unlockedChains: string[], rng: () => number = Math.random): Order | null {
    if (!this.canSkip(now)) return null;
    const i = this.orders.findIndex((o) => o.id === id);
    if (i < 0) return null;
    const fresh = this.generate(playerLevel, unlockedChains, rng);
    this.orders[i] = fresh;
    this.skipReadyAt = now + ORDER.skipCooldownSeconds * 1000;
    return fresh;
  }

  toJSON(): OrdersJSON {
    return {
      nextId: this.nextId,
      orders: this.orders.map((o) => ({ ...o, reqs: o.reqs.map((r) => ({ ...r })) })),
      skipReadyAt: this.skipReadyAt,
    };
  }

  static fromJSON(d: OrdersJSON): Orders {
    const o = new Orders();
    o.nextId = d.nextId;
    o.orders = d.orders.map((x) => ({ ...x, reqs: x.reqs.map((r) => ({ ...r })) }));
    o.skipReadyAt = d.skipReadyAt ?? 0;
    return o;
  }
}
