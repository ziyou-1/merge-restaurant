import { ENERGY, LEVEL_UNLOCKS, LEVEL_UP_REWARD, SHARE, itemName, mergeXp, sellPrice } from '../config/GameConfig';
import type { DailyReward } from '../config/GameConfig';
import { Daily, dayKey } from './Daily';
import type { DailyJSON } from './Daily';
import { Board } from './Board';
import { findTask } from '../config/Decor';
import type { StoryLine, TaskRef } from '../config/Decor';
import { Decor } from './Decor';
import type { DecorJSON } from './Decor';
import type { BoardItem, BoardJSON, MoveResult } from './Board';
import { Emitter } from './Emitter';
import { Energy } from './Energy';
import type { EnergyJSON } from './Energy';
import { Orders } from './Orders';
import type { Order, OrdersJSON } from './Orders';
import { Player } from './Player';
import type { PlayerJSON } from './Player';

export interface GameEvents {
  /** 任何会影响 UI 的状态变化，视图层收到后全量刷新 */
  change: undefined;
  /** 定时结算了体力 / 生成器充能：只改数字，不动棋盘 / 订单 / 装修，视图不用重建（Hud 和棋盘每秒自己刷） */
  tick: undefined;
  toast: string;
  merge: { from: number; to: number; result: BoardItem };
  spawn: { from: number; to: number; item: BoardItem };
  levelup: number;
  delivered: { order: Order; removed: number[] };
  /** 装修任务完成 */
  taskDone: TaskRef;
  /** 需要播放的剧情 */
  story: StoryLine[];
  /** 签到领到了 */
  dailyClaimed: { day: number; reward: DailyReward };
}

export interface GameJSON {
  v: number;
  savedAt: number;
  board: BoardJSON;
  energy: EnergyJSON;
  player: PlayerJSON;
  orders: OrdersJSON;
  unlocked: string[];
  pendingGenerators: string[];
  decor?: DecorJSON;
  daily?: DailyJSON;
  share?: { day: string; count: number };
  /** 新手引导做到第几步；老存档没这个字段视为已完成 */
  tutorial?: number;
}

export interface GameOptions {
  /** 时间源，方便测试和以后换成服务端时间 */
  now?: () => number;
  rng?: () => number;
}

/** 生成器优先摆放的格子（列, 行），放满后退回离中心最近的空格 */
const GENERATOR_SLOTS: [number, number][] = [
  [1, 3],
  [3, 3],
  [5, 3],
  [2, 5],
  [4, 5],
];

/**
 * 游戏状态总控：把棋盘、体力、订单、玩家串起来，是 UI 唯一需要打交道的对象。
 * 不依赖 cc，可在 Node 里直接跑。
 */
export class GameState {
  board: Board;
  energy: Energy;
  player: Player;
  orders: Orders;
  decor: Decor;
  daily = new Daily();
  /** 今天分享了几次（有奖励的） */
  shareDay = '';
  shareCount = 0;
  /** 新手引导步骤，见 ui/Tutorial.ts；TUTORIAL_DONE 表示做完 */
  tutorialStep = 0;
  unlocked: string[] = [];
  /** 棋盘满了没地方放的生成器，等有空位再放 */
  pendingGenerators: string[] = [];

  readonly events = new Emitter<GameEvents>();
  now: () => number;
  rng: () => number;

  constructor(opts: GameOptions = {}) {
    this.now = opts.now ?? (() => Date.now());
    this.rng = opts.rng ?? Math.random;
    const t = this.now();
    this.board = new Board();
    this.energy = new Energy(ENERGY.initial, t);
    this.player = new Player();
    this.orders = new Orders();
    this.decor = new Decor();
  }

  /** 新档：放初始生成器 + 几个教学物品 + 补满订单 */
  static newGame(opts: GameOptions = {}): GameState {
    const g = new GameState(opts);
    g.applyUnlocks(1);
    // 教学物品：两个 1 级面点放在一起，玩家一拖就能体会合成
    const b = g.board;
    b.place(b.index(2, 2), b.createItem('bread', 1));
    b.place(b.index(3, 2), b.createItem('bread', 1));
    b.place(b.index(4, 2), b.createItem('drink', 1));
    g.orders.fill(g.player.level, g.unlocked, g.rng);
    return g;
  }

  // ---------- 时间推进 ----------
  /** 每秒调一次即可：结算体力和生成器恢复 */
  tick(): boolean {
    const t = this.now();
    const a = this.energy.tick(t);
    const b = this.board.tickGenerators(t);
    if (a || b) this.events.emit('tick', undefined);
    return a || b;
  }

  // ---------- 玩家操作 ----------
  /** 点击生成器 */
  spawn(idx: number): boolean {
    const gen = this.board.get(idx);
    if (!gen || gen.kind !== 'generator') return false;
    const t = this.now();
    this.energy.tick(t);
    if (!this.energy.canAfford(ENERGY.spawnCost)) {
      this.events.emit('toast', '体力不足，看广告或等待恢复');
      return false;
    }
    const res = this.board.spawn(idx, t, this.rng);
    if (!res.ok) {
      if (res.reason === 'no-charges') this.events.emit('toast', '生成器还在恢复中');
      else if (res.reason === 'board-full') this.events.emit('toast', '棋盘满了，先合成或出售一些');
      return false;
    }
    this.energy.consume(ENERGY.spawnCost, t);
    this.events.emit('spawn', { from: res.from, to: res.to, item: res.item });
    this.emitChange();
    return true;
  }

  /** 拖拽落下 */
  drop(from: number, to: number): MoveResult {
    const res = this.board.move(from, to);
    if (res.type === 'merge') {
      this.events.emit('merge', { from: res.from, to: res.to, result: res.result });
      this.addXp(mergeXp(res.result.level));
      this.tryPlacePending();
    }
    if (res.type !== 'none') this.emitChange();
    return res;
  }

  /** 出售普通物品，返回得到的金币；不能卖返回 0 */
  sell(idx: number): number {
    const item = this.board.get(idx);
    if (!item || item.kind !== 'item') return 0;
    const price = sellPrice(item.level);
    this.board.removeAt(idx);
    this.player.addCoins(price);
    this.events.emit('toast', '出售 ' + itemName(item.chain, item.level) + ' +' + price + ' 金币');
    this.tryPlacePending();
    this.emitChange();
    return price;
  }

  /** 换一单（有冷却） */
  skipOrder(orderId: number): boolean {
    const t = this.now();
    if (!this.orders.canSkip(t)) {
      const s = this.orders.skipWaitSeconds(t);
      this.events.emit('toast', `${Math.ceil(s / 60)} 分钟后才能再换单`);
      return false;
    }
    const fresh = this.orders.skip(orderId, t, this.player.level, this.unlocked, this.rng);
    if (!fresh) return false;
    this.emitChange();
    return true;
  }

  /** 新手引导推进（只增不减） */
  setTutorialStep(step: number): void {
    if (step <= this.tutorialStep) return;
    this.tutorialStep = step;
    this.emitChange();
  }

  /** 交付订单 */
  deliver(orderId: number): boolean {
    const r = this.orders.fulfill(orderId, this.board);
    if (!r) {
      this.events.emit('toast', '还没凑齐订单需要的东西');
      return false;
    }
    this.player.addCoins(r.order.coins);
    this.events.emit('delivered', r);
    this.addXp(r.order.xp);
    this.orders.fill(this.player.level, this.unlocked, this.rng);
    this.tryPlacePending();
    this.emitChange();
    return true;
  }

  // ---------- 签到 / 分享 ----------
  claimDaily(): DailyReward | null {
    const t = this.now();
    const reward = this.daily.claim(t);
    if (!reward) return null;
    if (reward.coins) this.player.addCoins(reward.coins);
    if (reward.energy) this.energy.add(reward.energy);
    this.events.emit('dailyClaimed', { day: this.daily.todayIndex(t), reward });
    this.emitChange();
    return reward;
  }

  /** 今天还剩几次有奖励的分享 */
  shareLeft(): number {
    const today = dayKey(this.now());
    return today === this.shareDay ? Math.max(0, SHARE.perDay - this.shareCount) : SHARE.perDay;
  }

  /** 分享成功后发奖；超过每日次数返回 false */
  rewardShare(): boolean {
    if (this.shareLeft() <= 0) return false;
    const today = dayKey(this.now());
    if (this.shareDay !== today) {
      this.shareDay = today;
      this.shareCount = 0;
    }
    this.shareCount += 1;
    this.energy.add(SHARE.energy);
    this.events.emit('toast', `分享成功，体力 +${SHARE.energy}`);
    this.emitChange();
    return true;
  }

  /** 看完广告补体力 */
  refillEnergy(n = ENERGY.adRefill): void {
    this.energy.add(n);
    this.events.emit('toast', '体力 +' + n);
    this.emitChange();
  }

  /** 做装修任务：扣金币、从棋盘拿菜、记进度、发奖励 / 解锁 / 剧情 */
  completeTask(taskId: string): boolean {
    const ref = findTask(taskId);
    if (!ref || !this.decor.isCurrent(taskId)) return false;
    const task = ref.task;
    const check = this.decor.check(task, this.player.coins, this.board);
    if (!check.ok) {
      this.events.emit('toast', !check.coinsOk ? '金币不够' : '棋盘上还没凑齐要交的菜');
      return false;
    }
    this.board.takeItems(task.items);
    this.player.spend(task.coins);
    this.decor.markDone(taskId);
    this.events.emit('taskDone', ref);
    this.addXp(task.xp);
    if (task.unlockChain) this.unlockChain(task.unlockChain);
    if (task.story && task.story.length) this.events.emit('story', task.story);
    // 这一步让新区域开放了？播它的引子
    for (const area of this.decor.areasUnlockedBy(taskId)) {
      if (area.intro && area.intro.length) this.events.emit('story', area.intro);
    }
    this.tryPlacePending();
    this.emitChange();
    return true;
  }

  // ---------- 内部 ----------
  private addXp(n: number): void {
    const ups = this.player.addXp(n);
    for (let i = 0; i < ups; i++) {
      const lv = this.player.level - ups + i + 1;
      this.applyUnlocks(lv);
      // 升级奖励：体力 + 金币
      this.energy.add(LEVEL_UP_REWARD.energy);
      this.player.addCoins(LEVEL_UP_REWARD.coinsPerLevel * lv);
      this.events.emit('levelup', lv);
    }
  }

  private applyUnlocks(level: number): void {
    for (const chain of LEVEL_UNLOCKS[level] ?? []) this.unlockChain(chain);
  }

  /** 解锁一条合成链并往棋盘放它的生成器；已解锁则什么都不做 */
  unlockChain(chain: string): boolean {
    if (this.unlocked.includes(chain)) return false;
    this.unlocked.push(chain);
    this.placeGenerator(chain);
    return true;
  }

  private placeGenerator(chain: string): void {
    const b = this.board;
    const gen = b.createGenerator(chain, this.now());
    for (const [x, y] of GENERATOR_SLOTS) {
      if (b.place(b.index(x, y), gen)) return;
    }
    const center = b.index(Math.floor(b.cols / 2), Math.floor(b.rows / 2));
    if (b.placeNear(center, gen) < 0) this.pendingGenerators.push(chain);
  }

  private tryPlacePending(): void {
    while (this.pendingGenerators.length && !this.board.isFull()) {
      const chain = this.pendingGenerators.shift() as string;
      this.placeGenerator(chain);
    }
  }

  private emitChange(): void {
    this.events.emit('change', undefined);
  }

  // ---------- 存档 ----------
  toJSON(): GameJSON {
    return {
      v: 1,
      savedAt: this.now(),
      board: this.board.toJSON(),
      energy: this.energy.toJSON(),
      player: this.player.toJSON(),
      orders: this.orders.toJSON(),
      unlocked: [...this.unlocked],
      pendingGenerators: [...this.pendingGenerators],
      decor: this.decor.toJSON(),
      daily: this.daily.toJSON(),
      share: { day: this.shareDay, count: this.shareCount },
      tutorial: this.tutorialStep,
    };
  }

  static fromJSON(d: GameJSON, opts: GameOptions = {}): GameState {
    const g = new GameState(opts);
    g.board = Board.fromJSON(d.board);
    g.energy = Energy.fromJSON(d.energy);
    g.player = Player.fromJSON(d.player);
    g.orders = Orders.fromJSON(d.orders);
    g.unlocked = [...d.unlocked];
    g.pendingGenerators = [...(d.pendingGenerators ?? [])];
    g.decor = Decor.fromJSON(d.decor);
    g.daily = Daily.fromJSON(d.daily);
    g.shareDay = d.share?.day ?? '';
    g.shareCount = d.share?.count ?? 0;
    g.tutorialStep = d.tutorial ?? 99; // 老存档：当作已做完
    // 读档后立刻把离线期间的恢复结算掉
    g.tick();
    return g;
  }
}
