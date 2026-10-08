/**
 * 纯逻辑测试：node --import ./tests/register.mjs tests/core.test.ts
 * 不依赖 Cocos。用固定时间源和固定随机数，结果可复现。
 */
import assert from 'node:assert/strict';
import { Board } from '../assets/scripts/core/Board';
import { Energy } from '../assets/scripts/core/Energy';
import { Orders } from '../assets/scripts/core/Orders';
import { GameState } from '../assets/scripts/core/GameState';
import { MemoryStore, saveGame, loadGame, clearSave } from '../assets/scripts/core/Save';
import { ENERGY, GENERATOR, MAX_LEVEL, ORDER, LEVEL_XP } from '../assets/scripts/config/GameConfig';
import { AREAS, AREA_MAP, CHAPTERS, findTask, areasOfChapter } from '../assets/scripts/config/Decor';
import { CHAIN_MAP } from '../assets/scripts/config/GameConfig';
import { Decor } from '../assets/scripts/core/Decor';
import { newerSave } from '../assets/scripts/platform/CloudSave';
import { Daily, dayKey } from '../assets/scripts/core/Daily';
import { DAILY_REWARDS, SHARE, LEVEL_UP_REWARD } from '../assets/scripts/config/GameConfig';

let passed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log('  ok  ' + name);
  } catch (e) {
    console.log('  FAIL ' + name);
    throw e;
  }
}

/** 可控时钟 */
function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

/** 固定随机序列 */
function seq(values: number[]) {
  let i = 0;
  return () => values[i++ % values.length];
}

console.log('Board');
test('拖到空格 = 移动', () => {
  const b = new Board(3, 3);
  const a = b.createItem('bread', 1);
  b.place(0, a);
  const r = b.move(0, 4);
  assert.equal(r.type, 'move');
  assert.equal(b.get(0), null);
  assert.equal(b.get(4), a);
});

test('同链同级 = 合成，结果留在目标格', () => {
  const b = new Board(3, 3);
  b.place(0, b.createItem('bread', 2));
  b.place(1, b.createItem('bread', 2));
  const r = b.move(0, 1);
  assert.equal(r.type, 'merge');
  assert.equal(b.get(0), null);
  assert.equal(b.get(1)?.level, 3);
  assert.equal(b.get(1)?.chain, 'bread');
});

test('不同链或不同级 = 交换', () => {
  const b = new Board(3, 3);
  const x = b.createItem('bread', 2);
  const y = b.createItem('drink', 2);
  b.place(0, x);
  b.place(1, y);
  assert.equal(b.move(0, 1).type, 'swap');
  assert.equal(b.get(0), y);
  assert.equal(b.get(1), x);
  const z = b.createItem('bread', 3);
  b.place(2, z);
  assert.equal(b.move(1, 2).type, 'swap'); // bread2 vs bread3
});

test('满级不能再合，生成器不能合', () => {
  const b = new Board(3, 3);
  b.place(0, b.createItem('bread', MAX_LEVEL));
  b.place(1, b.createItem('bread', MAX_LEVEL));
  assert.equal(b.move(0, 1).type, 'swap');
  const g1 = b.createGenerator('bread', 0);
  const g2 = b.createGenerator('bread', 0);
  b.place(3, g1);
  b.place(4, g2);
  assert.equal(b.move(3, 4).type, 'swap');
});

test('生成器：扣充能、放最近空格、满了失败', () => {
  const b = new Board(2, 2);
  const gen = b.createGenerator('veg', 0);
  b.place(0, gen);
  const r1 = b.spawn(0, 0, () => 0.99); // 不触发 2 级
  assert.equal(r1.ok, true);
  if (r1.ok) {
    assert.equal(r1.item.level, 1);
    assert.equal(r1.to, 1); // 距离相同优先下标小的
  }
  assert.equal(gen.charges, GENERATOR.maxCharges - 1);
  const r2 = b.spawn(0, 0, () => 0.0); // 触发 2 级
  assert.equal(r2.ok && r2.item.level, 2);
  b.spawn(0, 0);
  assert.equal(b.isFull(), true);
  const r4 = b.spawn(0, 0);
  assert.equal(r4.ok === false && r4.reason, 'board-full');
});

test('生成器充能按时间恢复', () => {
  const b = new Board(4, 4);
  const gen = b.createGenerator('veg', 0);
  b.place(0, gen);
  for (let i = 0; i < GENERATOR.maxCharges; i++) b.spawn(0, 0);
  assert.equal(gen.charges, 0);
  const r = b.spawn(0, 0);
  assert.equal(r.ok === false && r.reason, 'no-charges');
  const ms = GENERATOR.rechargeSeconds * 1000;
  b.tickGenerators(ms * 2 + 10);
  assert.equal(gen.charges, 2);
  assert.equal(b.generatorRechargeIn(gen, ms * 2 + 10), GENERATOR.rechargeSeconds);
  b.tickGenerators(ms * 1000);
  assert.equal(gen.charges, GENERATOR.maxCharges);
});

test('存档往返一致', () => {
  const b = new Board(3, 3);
  b.place(0, b.createItem('bread', 3));
  b.place(4, b.createGenerator('veg', 123));
  const b2 = Board.fromJSON(JSON.parse(JSON.stringify(b.toJSON())));
  assert.deepEqual(b2.toJSON(), b.toJSON());
});

console.log('Energy');
test('体力消耗与按时间恢复', () => {
  const ms = ENERGY.regenSeconds * 1000;
  const e = new Energy(ENERGY.max, 0);
  assert.equal(e.tick(ms * 5), false); // 满的不涨
  assert.equal(e.consume(3, ms * 5), true);
  assert.equal(e.value, ENERGY.max - 3);
  assert.equal(e.tick(ms * 5 + ms - 1), false);
  assert.equal(e.tick(ms * 6), true);
  assert.equal(e.value, ENERGY.max - 2);
  assert.equal(e.secondsToNext(ms * 6), ENERGY.regenSeconds);
  e.tick(ms * 100);
  assert.equal(e.value, ENERGY.max);
  assert.equal(e.consume(999, ms * 100), false);
});

console.log('Orders');
test('订单等级在范围内且只用已解锁链', () => {
  const o = new Orders();
  for (let i = 0; i < 200; i++) {
    const order = o.generate(1, ['bread', 'drink'], Math.random);
    assert.ok(order.reqs.length >= 1 && order.reqs.length <= ORDER.maxRequirements);
    for (const r of order.reqs) {
      assert.ok(['bread', 'drink'].includes(r.chain));
      assert.ok(r.level >= ORDER.minLevel && r.level <= 2, 'lv=' + r.level);
    }
    assert.ok(order.coins > 0 && order.xp > 0);
  }
  const hi = o.generate(99, ['veg'], () => 0.999);
  assert.equal(hi.reqs[0].level, ORDER.maxLevel);
});

test('交付会从棋盘扣掉对应物品并出列', () => {
  const o = new Orders();
  o.fill(1, ['bread'], seq([0.5, 0.1, 0.5, 0.5, 0.1, 0.5, 0.5, 0.1, 0.5]));
  assert.equal(o.orders.length, ORDER.slots);
  const order = o.orders[0];
  const b = new Board(3, 3);
  assert.equal(o.canFulfill(order, b), false);
  order.reqs.forEach((r, i) => b.place(i, b.createItem(r.chain, r.level)));
  assert.equal(o.canFulfill(order, b), true);
  const res = o.fulfill(order.id, b);
  assert.ok(res);
  assert.equal(res.removed.length, order.reqs.length);
  assert.equal(b.emptyCount(), 9);
  assert.equal(o.orders.length, ORDER.slots - 1);
});

console.log('GameState');
test('新档：3 个生成器 + 教学物品 + 满订单', () => {
  const c = clock();
  const g = GameState.newGame({ now: c.now, rng: () => 0.5 });
  const gens = g.board.entries().filter((e) => e.item.kind === 'generator');
  assert.equal(gens.length, 3);
  assert.deepEqual(g.unlocked, ['bread', 'drink', 'veg']);
  assert.equal(g.orders.orders.length, ORDER.slots);
  assert.equal(g.energy.value, ENERGY.initial);
});

test('点生成器扣体力，体力不足会拒绝', () => {
  const c = clock();
  const g = GameState.newGame({ now: c.now, rng: () => 0.5 });
  const toasts: string[] = [];
  g.events.on('toast', (t) => toasts.push(t));
  const genIdx = g.board.entries().find((e) => e.item.kind === 'generator')!.idx;
  assert.equal(g.spawn(genIdx), true);
  assert.equal(g.energy.value, ENERGY.initial - ENERGY.spawnCost);
  g.energy.value = 0;
  assert.equal(g.spawn(genIdx), false);
  assert.ok(toasts.some((t) => t.includes('体力')));
});

test('合成给经验，攒够会升级（肉类不再由等级解锁）', () => {
  const c = clock();
  const g = GameState.newGame({ now: c.now, rng: () => 0.5 });
  const b = g.board;
  const ups: number[] = [];
  g.events.on('levelup', (lv) => ups.push(lv));
  // 教学物品 (2,2)+(3,2) 是两个 1 级面点
  const r = g.drop(b.index(2, 2), b.index(3, 2));
  assert.equal(r.type, 'merge');
  assert.equal(g.player.xp, 2);
  // 直接把 xp 灌到升级
  g.player.xp = LEVEL_XP[0] - 1;
  b.place(b.index(0, 0), b.createItem('veg', 1));
  b.place(b.index(1, 0), b.createItem('veg', 1));
  g.drop(b.index(0, 0), b.index(1, 0));
  assert.equal(g.player.level, 2);
  assert.deepEqual(ups, [2]);
  assert.equal(g.unlocked.includes('meat'), false);
  assert.equal(b.entries().filter((e) => e.item.kind === 'generator').length, 3);
});

test('交付订单加金币、补新订单', () => {
  const c = clock();
  const g = GameState.newGame({ now: c.now, rng: () => 0.5 });
  const order = g.orders.orders[0];
  const b = g.board;
  let idx = 0;
  for (const r of order.reqs) {
    while (b.get(idx)) idx++;
    b.place(idx, b.createItem(r.chain, r.level));
  }
  assert.equal(g.deliver(order.id), true);
  assert.equal(g.player.coins, order.coins);
  assert.equal(g.orders.orders.length, ORDER.slots);
  assert.equal(g.orders.get(order.id), undefined);
  assert.equal(g.deliver(order.id), false);
});

test('出售普通物品得金币，生成器不能卖', () => {
  const c = clock();
  const g = GameState.newGame({ now: c.now, rng: () => 0.5 });
  const b = g.board;
  const genIdx = b.entries().find((e) => e.item.kind === 'generator')!.idx;
  assert.equal(g.sell(genIdx), 0);
  assert.ok(g.sell(b.index(2, 2)) > 0);
  assert.equal(b.get(b.index(2, 2)), null);
});

test('存档 → 读档 → 离线恢复结算', () => {
  const c = clock();
  const g = GameState.newGame({ now: c.now, rng: () => 0.5 });
  const genIdx = g.board.entries().find((e) => e.item.kind === 'generator')!.idx;
  g.spawn(genIdx);
  g.spawn(genIdx);
  const store = new MemoryStore();
  saveGame(g, store);
  c.advance(ENERGY.regenSeconds * 1000 * 1000); // 离线很久
  const g2 = loadGame(store, { now: c.now, rng: () => 0.5 });
  assert.ok(g2);
  assert.equal(g2.energy.value, ENERGY.max);
  assert.equal(g2.board.get(genIdx)?.charges, GENERATOR.maxCharges);
  assert.equal(g2.board.entries().length, g.board.entries().length);
  assert.deepEqual(g2.orders.toJSON(), g.orders.toJSON());
  clearSave(store);
  assert.equal(loadGame(store), null);
  store.setItem('merge-restaurant-save-v1', '{broken');
  assert.equal(loadGame(store), null);
});

console.log('Decor');
test('配置自洽：任务 id 唯一、requires 指向存在的任务、物品链存在', () => {
  const ids = new Set<string>();
  for (const area of AREAS) {
    if (area.requires) assert.ok(findTask(area.requires), area.id + ' requires ' + area.requires);
    for (const t of area.tasks) {
      assert.ok(!ids.has(t.id), 'dup ' + t.id);
      ids.add(t.id);
      for (const r of t.items) {
        assert.ok(r.level >= 1 && r.level <= MAX_LEVEL && r.count >= 1);
        assert.ok(CHAIN_MAP[r.chain], 'unknown chain ' + r.chain + ' in ' + t.id);
      }
      if (t.unlockChain) assert.ok(CHAIN_MAP[t.unlockChain], 'unknown unlockChain ' + t.unlockChain);
    }
    assert.ok(CHAPTERS.some((c) => c.id === area.chapter), area.id + ' chapter');
  }
  // 每章 5 个区域，餐厅页 3×2 网格刚好放下（5 区域 + 1 信息格）
  for (const c of CHAPTERS) assert.equal(areasOfChapter(c.id).length, 5, 'chapter ' + c.id);
  // 任务要交的链必须在做到那一步之前能解锁到：这里只做粗检查——链要么初始就有，要么被某个任务解锁
  const unlockable = new Set(['bread', 'drink', 'veg']);
  for (const a of AREAS) for (const t of a.tasks) if (t.unlockChain) unlockable.add(t.unlockChain);
  for (const a of AREAS) for (const t of a.tasks) for (const r of t.items) assert.ok(unlockable.has(r.chain), r.chain);
});

test('第二章：做完花园秋千才开露台，并播引子剧情；咖啡角解锁咖啡链', () => {
  const c = clock();
  const g = GameState.newGame({ now: c.now, rng: () => 0.5 });
  const d = g.decor;
  assert.equal(d.isChapterUnlocked(2), false);
  assert.equal(d.latestChapter(), 1);
  // 把第一章除 garden-3 外全做完（直接记账）
  for (const a of areasOfChapter(1)) for (const t of a.tasks) if (t.id !== 'garden-3') d.markDone(t.id);
  assert.equal(d.isChapterUnlocked(2), false);
  assert.deepEqual(d.currentTasks(2), []);
  const stories: string[][] = [];
  g.events.on('story', (lines) => stories.push(lines.map((l) => l.speaker)));
  const b = g.board;
  g.player.coins = 100000;
  b.place(b.nearestEmpty(0), b.createItem('dessert', 3));
  b.place(b.nearestEmpty(0), b.createItem('drink', 4));
  assert.equal(g.completeTask('garden-3'), true);
  assert.equal(d.isChapterUnlocked(2), true);
  assert.equal(d.latestChapter(), 2);
  assert.equal(d.isChapterFinished(1), true);
  // 先播 garden-3 自己的剧情，再播露台引子
  assert.deepEqual(stories, [['隔壁老王', '小美'], ['美食博主', '小美']]);
  assert.deepEqual(d.currentTasks(2).map((t) => t.task.id), ['terrace-1']);
  // 露台第一步 → 咖啡角开放 → 咖啡机解锁咖啡链
  b.place(b.nearestEmpty(0), b.createItem('bread', 4));
  b.place(b.nearestEmpty(0), b.createItem('bread', 4));
  assert.equal(g.completeTask('terrace-1'), true);
  assert.ok(d.isAreaUnlocked(AREA_MAP.coffee));
  assert.equal(g.unlocked.includes('coffee'), false);
  b.place(b.nearestEmpty(0), b.createItem('dessert', 3));
  b.place(b.nearestEmpty(0), b.createItem('dessert', 3));
  assert.equal(g.completeTask('coffee-1'), true);
  assert.ok(g.unlocked.includes('coffee'));
  assert.ok(b.entries().some((e) => e.item.kind === 'generator' && e.item.chain === 'coffee'));
  assert.deepEqual(d.chapterProgress(2), { done: 2, total: 17 });
});

test('区域按 requires 开放，任务按顺序', () => {
  const d = new Decor();
  const cur = d.currentTasks().map((t) => t.task.id);
  assert.deepEqual(cur, ['facade-1']); // 其他区域都要先做门面第一步
  assert.equal(d.isCurrent('facade-2'), false);
  d.markDone('facade-1');
  assert.deepEqual(d.currentTasks().map((t) => t.task.id), ['facade-2', 'hall-1']);
  assert.equal(d.areaLevel('facade'), 1);
  assert.equal(d.isAreaUnlocked(AREA_MAP.kitchen), false);
  d.markDone('hall-1');
  assert.equal(d.isAreaUnlocked(AREA_MAP.kitchen), true);
});

test('完成任务：扣金币、扣菜、给经验、解锁生成器、发剧情', () => {
  const c = clock();
  const g = GameState.newGame({ now: c.now, rng: () => 0.5 });
  const stories: number[] = [];
  g.events.on('story', (lines) => stories.push(lines.length));
  // facade-1 只要 20 金币
  assert.equal(g.completeTask('facade-1'), false); // 没钱
  g.player.coins = 100;
  assert.equal(g.completeTask('facade-1'), true);
  assert.equal(g.player.coins, 80);
  assert.equal(g.player.xp, 10);
  assert.equal(g.decor.isDone('facade-1'), true);
  assert.equal(stories.length, 1);
  assert.equal(g.completeTask('facade-1'), false); // 不能重复做
  // hall-1 要 40 金币 + 面粉×1，kitchen-1 要 80 金币 + 嫩芽×2 并解锁肉类
  const b = g.board;
  assert.equal(g.completeTask('hall-1'), false); // 缺面粉
  b.place(b.nearestEmpty(0), b.createItem('bread', 2));
  assert.equal(g.completeTask('hall-1'), true);
  assert.equal(b.count('bread', 2), 0);
  g.player.coins = 500;
  b.place(b.nearestEmpty(0), b.createItem('veg', 2));
  b.place(b.nearestEmpty(0), b.createItem('veg', 2));
  const gensBefore = b.entries().filter((e) => e.item.kind === 'generator').length;
  assert.equal(g.completeTask('kitchen-1'), true);
  assert.ok(g.unlocked.includes('meat'));
  assert.equal(b.entries().filter((e) => e.item.kind === 'generator').length, gensBefore + 1);
  assert.equal(g.decor.doneCount, 3);
});

test('装修进度随存档往返', () => {
  const c = clock();
  const g = GameState.newGame({ now: c.now, rng: () => 0.5 });
  g.player.coins = 100;
  g.completeTask('facade-1');
  const store = new MemoryStore();
  saveGame(g, store);
  const g2 = loadGame(store, { now: c.now })!;
  assert.equal(g2.decor.isDone('facade-1'), true);
  assert.deepEqual(g2.decor.currentTasks().map((t) => t.task.id), ['facade-2', 'hall-1']);
  // 老存档没有 decor 字段也能读
  const raw = JSON.parse(store.getItem('merge-restaurant-save-v1')!);
  delete raw.decor;
  store.setItem('merge-restaurant-save-v1', JSON.stringify(raw));
  assert.equal(loadGame(store, { now: c.now })!.decor.doneCount, 0);
});

console.log('CloudSave');
test('本地 / 云端存档挑 savedAt 新的那份', () => {
  const c = clock();
  const g = GameState.newGame({ now: c.now, rng: () => 0.5 });
  const older = g.toJSON();
  c.advance(60_000);
  g.player.coins = 999;
  const newer = g.toJSON();
  assert.equal(newerSave(null, null), null);
  assert.equal(newerSave(older, null), older);
  assert.equal(newerSave(null, newer), newer);
  assert.equal(newerSave(older, newer), newer);
  assert.equal(newerSave(newer, older), newer);
  assert.equal(newerSave(older, newer)!.player.coins, 999);
});

console.log('Daily / Share');
test('签到：一天一次，连签递进，断签重头，7 天一轮', () => {
  const DAY = 24 * 3600 * 1000;
  const base = Date.UTC(2026, 8, 16, 4); // 北京时间 2026-09-16 12:00，签到按 UTC+8 过日子，不依赖本机时区
  const d = new Daily();
  assert.equal(d.canClaim(base), true);
  assert.equal(d.todayIndex(base), 1);
  assert.deepEqual(d.claim(base), DAILY_REWARDS[0]);
  assert.equal(d.claim(base + 3600 * 1000), null); // 同一天不能再领
  assert.equal(d.todayIndex(base), 1);
  assert.deepEqual(d.claim(base + DAY), DAILY_REWARDS[1]); // 第二天连上
  assert.equal(d.streak, 2);
  assert.deepEqual(d.claim(base + 3 * DAY), DAILY_REWARDS[0]); // 隔了一天，重头
  assert.equal(d.streak, 1);
  for (let k = 1; k <= 7; k++) d.claim(base + (3 + k) * DAY);
  assert.equal(d.streak, 8);
  assert.equal(d.todayIndex(base + 10 * DAY), 1); // 第 8 天回到轮次第 1 天
  const d2 = Daily.fromJSON(JSON.parse(JSON.stringify(d.toJSON())));
  assert.deepEqual(d2.toJSON(), d.toJSON());
  assert.equal(dayKey(base), '2026-09-16');
});

test('GameState：签到发钱发体力，分享每天限次', () => {
  const c = clock(Date.UTC(2026, 8, 16, 4));
  const g = GameState.newGame({ now: c.now, rng: () => 0.5 });
  const claimed: number[] = [];
  g.events.on('dailyClaimed', (e) => claimed.push(e.day));
  const r = g.claimDaily();
  assert.ok(r && r.coins === DAILY_REWARDS[0].coins);
  assert.equal(g.player.coins, DAILY_REWARDS[0].coins);
  assert.equal(g.claimDaily(), null);
  assert.deepEqual(claimed, [1]);
  assert.equal(g.shareLeft(), SHARE.perDay);
  const e0 = g.energy.value;
  for (let i = 0; i < SHARE.perDay; i++) assert.equal(g.rewardShare(), true);
  assert.equal(g.rewardShare(), false);
  assert.equal(g.energy.value, e0 + SHARE.energy * SHARE.perDay);
  c.advance(24 * 3600 * 1000);
  assert.equal(g.shareLeft(), SHARE.perDay);
  // 存档往返
  const store = new MemoryStore();
  saveGame(g, store);
  const g2 = loadGame(store, { now: c.now })!;
  assert.equal(g2.daily.streak, 1);
  assert.equal(g2.shareLeft(), SHARE.perDay);
});

test('存档时间戳来自未来：体力 / 充能倒计时不会算出负数或超一个周期', () => {
  const ms = ENERGY.regenSeconds * 1000;
  const e = new Energy(50, 10 * ms); // lastTs 在 10 个周期之后
  assert.equal(e.tick(0), false);
  assert.equal(e.lastTs, 0);
  assert.ok(e.secondsToNext(0) <= ENERGY.regenSeconds);
  const b = new Board(2, 2);
  const gen = b.createGenerator('veg', 999_999_999);
  b.place(0, gen);
  b.spawn(0, 999_999_999); // 用掉一格充能，开始计时（时间戳在未来）
  b.tickGenerators(0);
  assert.equal(gen.lastRechargeTs, 0);
  assert.ok(b.generatorRechargeIn(gen, 0) <= GENERATOR.rechargeSeconds);
});

console.log('Polish');
test('升级发体力和金币', () => {
  const c = clock();
  const g = GameState.newGame({ now: c.now, rng: () => 0.5 });
  const b = g.board;
  g.energy.value = 10;
  g.player.coins = 0;
  g.player.xp = LEVEL_XP[0] - 1;
  b.place(b.index(0, 0), b.createItem('veg', 1));
  b.place(b.index(1, 0), b.createItem('veg', 1));
  g.drop(b.index(0, 0), b.index(1, 0));
  assert.equal(g.player.level, 2);
  assert.equal(g.energy.value, 10 + LEVEL_UP_REWARD.energy);
  assert.equal(g.player.coins, LEVEL_UP_REWARD.coinsPerLevel * 2);
});

test('换一单：换掉那张、进入冷却、冷却后可再换、存档带冷却', () => {
  const c = clock();
  const g = GameState.newGame({ now: c.now, rng: () => 0.5 });
  const first = g.orders.orders[0];
  assert.equal(g.skipOrder(first.id), true);
  assert.equal(g.orders.orders.length, ORDER.slots);
  assert.equal(g.orders.get(first.id), undefined);
  const toasts: string[] = [];
  g.events.on('toast', (t) => toasts.push(t));
  assert.equal(g.skipOrder(g.orders.orders[1].id), false);
  assert.ok(toasts[0].includes('分钟'));
  const store = new MemoryStore();
  saveGame(g, store);
  const g2 = loadGame(store, { now: c.now })!;
  assert.equal(g2.orders.canSkip(c.now()), false);
  c.advance(ORDER.skipCooldownSeconds * 1000);
  assert.equal(g2.orders.canSkip(c.now()), true);
  assert.equal(g2.skipOrder(g2.orders.orders[0].id), true);
});

test('连升两级：奖励按每一级分别发，levelup 事件按序', () => {
  const c = clock();
  const g = GameState.newGame({ now: c.now, rng: () => 0.5 });
  const b = g.board;
  g.energy.value = 10;
  g.player.coins = 0;
  g.player.xp = LEVEL_XP[0] + LEVEL_XP[1] - 1;
  const ups: number[] = [];
  g.events.on('levelup', (lv) => ups.push(lv));
  b.place(b.index(0, 0), b.createItem('veg', 1));
  b.place(b.index(1, 0), b.createItem('veg', 1));
  g.drop(b.index(0, 0), b.index(1, 0));
  assert.equal(g.player.level, 3);
  assert.deepEqual(ups, [2, 3]);
  assert.equal(g.energy.value, 10 + LEVEL_UP_REWARD.energy * 2);
  assert.equal(g.player.coins, LEVEL_UP_REWARD.coinsPerLevel * (2 + 3));
});

test('换一单：其余订单原位不动、无效 id 不消耗冷却、冷却时间戳来自未来时钳制', () => {
  const c = clock();
  const g = GameState.newGame({ now: c.now, rng: () => 0.5 });
  const ids = g.orders.orders.map((o) => o.id);
  assert.equal(g.skipOrder(999999), false);
  assert.equal(g.orders.canSkip(c.now()), true, '无效 id 不进入冷却');
  assert.equal(g.skipOrder(ids[1]), true);
  const after = g.orders.orders.map((o) => o.id);
  assert.equal(after[0], ids[0]);
  assert.equal(after[2], ids[2]);
  assert.notEqual(after[1], ids[1]);
  // 存档里的 skipReadyAt 领先真实时间 10 天：最多等一个完整冷却
  g.orders.skipReadyAt = c.now() + 10 * 24 * 3600 * 1000;
  assert.ok(g.orders.skipWaitSeconds(c.now()) <= ORDER.skipCooldownSeconds);
  c.advance(ORDER.skipCooldownSeconds * 1000);
  assert.equal(g.orders.canSkip(c.now()), true);
});

test('新手引导进度：新档从 0 开始，只增不减，老存档视为已完成', () => {
  const c = clock();
  const g = GameState.newGame({ now: c.now, rng: () => 0.5 });
  assert.equal(g.tutorialStep, 0);
  g.setTutorialStep(2);
  g.setTutorialStep(1);
  assert.equal(g.tutorialStep, 2);
  const store = new MemoryStore();
  saveGame(g, store);
  assert.equal(loadGame(store, { now: c.now })!.tutorialStep, 2);
  const raw = JSON.parse(store.getItem('merge-restaurant-save-v1')!);
  delete raw.tutorial;
  store.setItem('merge-restaurant-save-v1', JSON.stringify(raw));
  assert.ok(loadGame(store, { now: c.now })!.tutorialStep >= 4);
});

console.log('\n' + passed + ' tests passed');
