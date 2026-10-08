/**
 * 节奏模拟器：一个“体力用光就走、体力回满再来”的休闲玩家，用纯逻辑层把两章从头玩到尾，
 * 输出每个任务在第几局 / 第几小时完成、钱和菜谁是瓶颈。
 *
 *   node --no-warnings --import ./tests/register.mjs tools/sim.ts [--seed 1] [--verbose]
 *
 * 不依赖 Cocos。改 GameConfig / Decor 的数值后跑一遍，比真机试快得多。
 */
import { GameState } from '../assets/scripts/core/GameState';
import { AREAS, CHAPTERS, findTask } from '../assets/scripts/config/Decor';
import { ENERGY, MAX_LEVEL, sellPrice } from '../assets/scripts/config/GameConfig';
import type { BoardItem } from '../assets/scripts/core/Board';

const args = process.argv.slice(2);
const seed = Number(args[args.indexOf('--seed') + 1] || 1);
const verbose = args.includes('--verbose');

// ---------- 可复现随机 ----------
function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(seed);

// ---------- 时钟 ----------
let now = 1_000_000_000;
const HOUR = 3600 * 1000;
const g = GameState.newGame({ now: () => now, rng });

// ---------- 统计 ----------
interface TaskDone {
  id: string;
  session: number;
  hours: number;
  waitedFor: 'coins' | 'items' | 'none';
}
const done: TaskDone[] = [];
const firstSeen = new Map<string, { session: number; blockedCoins: number; blockedItems: number }>();
let session = 0;
let spawns = 0;
let merges = 0;
let sells = 0;
let deliveries = 0;
let coinsEarned = 0;
const levelAt: { level: number; hours: number }[] = [];

g.events.on('merge', () => merges++);
g.events.on('delivered', (d) => {
  deliveries++;
  coinsEarned += d.order.coins;
});
g.events.on('levelup', (lv) => levelAt.push({ level: lv, hours: (now - 1_000_000_000) / HOUR }));

// ---------- 需求分析：现在订单 + 任务要哪些东西 ----------
function needs(): Map<string, number> {
  const need = new Map<string, number>();
  const add = (chain: string, level: number, n: number) => {
    const k = chain + ':' + level;
    need.set(k, (need.get(k) ?? 0) + n);
  };
  for (const o of g.orders.orders) for (const r of o.reqs) add(r.chain, r.level, 1);
  for (const t of g.decor.currentTasks()) for (const r of t.task.items) add(r.chain, r.level, r.count);
  return need;
}

/** 某条链上“最高有用等级”：订单 / 任务里这条链要的最高等级；没人要就 2 */
function usefulLevel(chain: string): number {
  let lv = 2;
  for (const [k, n] of needs()) {
    const [c, l] = k.split(':');
    if (c === chain && n > 0) lv = Math.max(lv, Number(l));
  }
  return lv;
}

// ---------- 一局：把能做的都做掉 ----------
function playSession(): void {
  session++;
  let progress = true;
  let guard = 0;
  while (progress && guard++ < 2000) {
    progress = false;
    // 1) 交订单（正在攒 6 级任务材料的链，先别拿去交单——像个有目标的玩家）
    const reserved = new Set<string>();
    for (const t of g.decor.currentTasks()) for (const r of t.task.items) if (r.level >= 6) reserved.add(r.chain);
    for (const o of [...g.orders.orders]) {
      if (o.reqs.some((r) => reserved.has(r.chain) && r.level >= 3)) continue;
      if (g.orders.canFulfill(o, g.board)) {
        g.deliver(o.id);
        progress = true;
      }
    }
    // 2) 做任务
    for (const t of g.decor.currentTasks()) {
      const chk = g.decor.check(t.task, g.player.coins, g.board);
      const fs = firstSeen.get(t.task.id) ?? { session, blockedCoins: 0, blockedItems: 0 };
      if (!firstSeen.has(t.task.id)) firstSeen.set(t.task.id, fs);
      if (chk.ok) {
        g.completeTask(t.task.id);
        done.push({
          id: t.task.id,
          session,
          hours: (now - 1_000_000_000) / HOUR,
          waitedFor: fs.blockedCoins > fs.blockedItems ? 'coins' : fs.blockedItems > 0 ? 'items' : 'none',
        });
        progress = true;
      } else {
        if (!chk.coinsOk) fs.blockedCoins++;
        if (!chk.itemsOk) fs.blockedItems++;
      }
    }
    // 3) 合成：同链同级的一对就合，除非那一级正好是订单/任务要的且数量刚够
    const need = needs();
    const byKey = new Map<string, number[]>();
    for (const { idx, item } of g.board.entries()) {
      if (item.kind !== 'item' || item.level >= MAX_LEVEL) continue;
      const k = item.chain + ':' + item.level;
      byKey.set(k, [...(byKey.get(k) ?? []), idx]);
    }
    for (const [k, idxs] of byKey) {
      const keep = need.get(k) ?? 0;
      const [chain, lvStr] = k.split(':');
      const lv = Number(lvStr);
      // 超过有用等级就别再往上合了，白费
      if (lv >= usefulLevel(chain) && keep === 0 && lv >= 3) continue;
      let spare = idxs.length - keep;
      for (let i = 0; i + 1 < idxs.length && spare >= 2; i += 2) {
        const res = g.drop(idxs[i], idxs[i + 1]);
        if (res.type === 'merge') {
          progress = true;
          spare -= 2;
        }
      }
    }
    // 4) 生成：挑订单/任务最需要的链，体力和充能都有就点
    if (g.energy.value >= ENERGY.spawnCost && g.board.emptyCount() > 3) {
      const gens = g.board.entries().filter((e) => e.item.kind === 'generator' && (e.item.charges ?? 0) > 0);
      if (gens.length) {
        const score = (gen: BoardItem) => {
          let s = 0;
          for (const [k, n] of need) if (k.startsWith(gen.chain + ':')) s += n * Number(k.split(':')[1]);
          return s + rng() * 0.5;
        };
        gens.sort((a, b) => score(b.item) - score(a.item));
        if (g.spawn(gens[0].idx)) {
          spawns++;
          progress = true;
        }
      }
    }
    // 5) 棋盘快满了：卖掉没人要的低级货
    if (g.board.emptyCount() <= 3) {
      const junk = g.board
        .entries()
        .filter((e) => e.item.kind === 'item' && !(need.get(e.item.chain + ':' + e.item.level) ?? 0))
        .sort((a, b) => sellPrice(a.item.level) - sellPrice(b.item.level));
      for (const j of junk.slice(0, 4)) {
        g.sell(j.idx);
        sells++;
        progress = true;
      }
    }
  }
}

// ---------- 主循环：玩 → 等体力回满 → 再玩 ----------
const totalTasks = AREAS.reduce((n, a) => n + a.tasks.length, 0);
const MAX_SESSIONS = 400;
while (done.length < totalTasks && session < MAX_SESSIONS) {
  playSession();
  // 休闲玩家：等体力回满再来（满 100 点约 3.3 小时，一天大概 4 局）
  const energyWait = (ENERGY.max - g.energy.value) * ENERGY.regenSeconds * 1000;
  now += Math.max(30 * 60 * 1000, energyWait);
  g.tick();
}

// ---------- 报告 ----------
const hours = (now - 1_000_000_000) / HOUR;
console.log(`seed=${seed}  局数=${session}（每局约 100 点体力，一天 4 局）  总时长≈${hours.toFixed(1)} 小时`);
console.log(`点生成器 ${spawns} 次，合成 ${merges} 次，交单 ${deliveries} 单赚 ${coinsEarned} 金币，卖掉 ${sells} 个，最终 Lv.${g.player.level}`);
console.log('');
for (const c of CHAPTERS) {
  console.log(`== 第${c.id}章 ${c.name}`);
  for (const a of AREAS.filter((x) => x.chapter === c.id)) {
    for (const t of a.tasks) {
      const d = done.find((x) => x.id === t.id);
      const fs = firstSeen.get(t.id);
      const wait = fs && d ? d.session - fs.session : null;
      const line = d
        ? `第${String(d.session).padStart(3)}局 ${d.hours.toFixed(1).padStart(6)}h  等了${String(wait).padStart(2)}局  卡在${d.waitedFor === 'coins' ? '钱' : d.waitedFor === 'items' ? '菜' : '—'}`
        : '未完成';
      const items = t.items.map((r) => `${r.chain}${r.level}×${r.count}`).join(' ');
      console.log(`  ${t.id.padEnd(11)} ${String(t.coins).padStart(5)}金 ${items.padEnd(22)} ${line}`);
    }
  }
  const last = AREAS.filter((x) => x.chapter === c.id).flatMap((a) => a.tasks).map((t) => done.find((d) => d.id === t.id));
  if (last.every(Boolean)) {
    const end = Math.max(...last.map((d) => d!.hours));
    console.log(`  → 本章完成于 ${end.toFixed(1)} 小时 / 第${Math.max(...last.map((d) => d!.session))}局`);
  }
}
if (verbose) {
  console.log('\n升级时间：' + levelAt.map((l) => `Lv${l.level}@${l.hours.toFixed(1)}h`).join(' '));
}
