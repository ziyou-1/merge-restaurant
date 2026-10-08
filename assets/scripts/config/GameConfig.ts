/**
 * 全部可调参数集中在这里。数值策划改这个文件即可，不用碰逻辑代码。
 */

/** 棋盘尺寸（列 × 行） */
export const BOARD_COLS = 7;
export const BOARD_ROWS = 8;

/** 每条合成链的最高等级 */
export const MAX_LEVEL = 7;

export interface ChainDef {
  /** 唯一 id，存档里用它，不要改 */
  id: string;
  /** 链名，UI 用 */
  name: string;
  /** 物品底色（十六进制） */
  color: string;
  /** 各等级物品名，下标 0 = 1 级 */
  items: string[];
}

export const CHAINS: ChainDef[] = [
  { id: 'bread',   name: '面点', color: '#F2B46B', items: ['麦粒', '面粉', '面团', '小面包', '法棍', '奶油蛋糕', '婚礼蛋糕'] },
  { id: 'drink',   name: '饮品', color: '#6FB8E8', items: ['清水', '柠檬', '柠檬水', '鲜果汁', '奶茶', '香槟', '鸡尾酒'] },
  { id: 'veg',     name: '蔬菜', color: '#8CCB6E', items: ['种子', '嫩芽', '生菜', '沙拉', '蔬菜汤', '焗蔬菜', '素食拼盘'] },
  { id: 'meat',    name: '肉类', color: '#EF8A7A', items: ['碎肉', '肉饼', '汉堡', '烤肠', '牛排', '烤鸡', '烤全羊'] },
  { id: 'dessert', name: '甜品', color: '#C89AEA', items: ['方糖', '糖浆', '曲奇', '布丁', '冰淇淋', '马卡龙', '提拉米苏'] },
  // 第二章：咖啡角任务解锁
  { id: 'coffee', name: '咖啡', color: '#B07A4F', items: ['咖啡豆', '咖啡粉', '浓缩咖啡', '美式咖啡', '拿铁', '卡布奇诺', '招牌拉花'] },
];

export const CHAIN_MAP: Record<string, ChainDef> = Object.fromEntries(CHAINS.map((c) => [c.id, c]));

export function itemName(chain: string, level: number): string {
  const def = CHAIN_MAP[chain];
  return def ? def.items[level - 1] ?? `${def.name}${level}` : `${chain}${level}`;
}

/** 体力 */
export const ENERGY = {
  max: 100,
  /** 每恢复 1 点体力所需秒数 */
  regenSeconds: 120,
  /** 生成器点一次消耗 */
  spawnCost: 1,
  /** 看一次激励视频补多少 */
  adRefill: 30,
  /** 新档初始体力 */
  initial: 100,
};

/** 生成器 */
export const GENERATOR = {
  maxCharges: 12,
  /** 每恢复 1 次点击机会所需秒数 */
  rechargeSeconds: 30,
  /** 生成 2 级物品的概率（其余为 1 级） */
  level2Chance: 0.15,
};

/** 订单 */
export const ORDER = {
  slots: 3,
  maxRequirements: 2,
  /** 订单要求的最低物品等级（1 级太容易，不出） */
  minLevel: 2,
  /** 订单要求的最高等级：6 级要 32 点体力，7 级 64 点太久，只给装修任务用 */
  maxLevel: 6,
  /** 「换一单」冷却（秒），三个槽共用 */
  skipCooldownSeconds: 180,
  /** 顾客名要和 resources/art/chars_customers 的头像一一对应 */
  customers: ['阿强', '王阿姨', '李老板', '豆豆', '张教授', '外卖小哥'],
};

/** 升级奖励：体力固定加，金币按新等级乘 */
export const LEVEL_UP_REWARD = { energy: 20, coinsPerLevel: 30 };

/** 每个等级升到下一级所需 xp，下标 = 当前等级 - 1；超出表长按最后一项递增 */
export const LEVEL_XP = [40, 90, 160, 260, 400, 580, 800, 1100, 1500, 2000];

/**
 * 达到某等级解锁的合成链（会往棋盘放对应生成器）。
 * 肉类 / 甜品不在这里，由装修任务解锁（见 config/Decor.ts 的 unlockChain）。
 */
export const LEVEL_UNLOCKS: Record<number, string[]> = {
  1: ['bread', 'drink', 'veg'],
};

/**
 * 数值的锚点：一个 L 级物品要点 2^(L-1) 次生成器（= 2^(L-1) 点体力）。
 * 所以奖励按“体力成本”定：交订单每点体力换 COINS_PER_SPAWN 金币，直接卖只换 1 金币，
 * 这样订单永远比卖划算，但棋盘满了卖东西也不至于亏太多。
 */
export const COINS_PER_SPAWN = 4;

/** L 级物品的体力成本 */
export function spawnCost(level: number): number {
  return 2 ** (level - 1);
}

/** 出售物品得到的金币 */
export function sellPrice(level: number): number {
  return spawnCost(level);
}

/** 玩家每升一级，订单金币 +5%，封顶 2 倍：后期任务贵，收入也要跟着涨 */
export function levelBonus(playerLevel: number): number {
  return Math.min(2, 1 + 0.05 * Math.max(0, playerLevel - 1));
}

/** 订单奖励：按体力成本给钱，两件以上的单多给 20%，再乘等级加成 */
export function orderReward(levels: number[], playerLevel = 1): { coins: number; xp: number } {
  let coins = 0;
  let xp = 0;
  for (const lv of levels) {
    coins += spawnCost(lv) * COINS_PER_SPAWN;
    xp += lv * 4;
  }
  if (levels.length > 1) coins *= 1.2;
  coins = Math.round(coins * levelBonus(playerLevel));
  return { coins, xp };
}

/** 合成一次给的 xp（按合成后的等级） */
export function mergeXp(newLevel: number): number {
  return newLevel;
}

/** 每日签到奖励，7 天一轮，断签从头来 */
export interface DailyReward {
  coins?: number;
  energy?: number;
}
export const DAILY_REWARDS: DailyReward[] = [
  { coins: 60 },
  { energy: 20 },
  { coins: 120 },
  { energy: 30 },
  { coins: 240 },
  { energy: 50 },
  { coins: 500, energy: 50 },
];

/** 分享得体力 */
export const SHARE = {
  energy: 10,
  /** 每天最多几次有奖励 */
  perDay: 3,
  title: '来帮我把外婆的餐厅修回来！',
  /** 分享卡片图，5:4，留空用截图 */
  imageUrl: '',
};

/** 订阅消息模板 id（mp.weixin.qq.com → 订阅消息 里申请，"体力已回满"类）。留空不显示提醒按钮 */
export const SUBSCRIBE_TMPL_ID = '';

/** 离线超过这么久回来才弹“离线恢复”提示 */
export const OFFLINE_HINT_MIN_MS = 10 * 60 * 1000;

/** 微信流量主：激励视频广告位 id，开通后到 mp.weixin.qq.com 流量主页面申请 */
export const AD_UNIT_ID = 'adunit-xxxxxxxxxxxxxxxx';

/**
 * 微信云开发环境 id（微信开发者工具 → 云开发 → 设置 里看）。留空 = 不用云：不校时、不云存档。
 * 用云要先在开发者工具里部署 build-templates/wechatgame/cloudfunctions 下的三个云函数。
 */
export const CLOUD_ENV = '';

/** 调试工具（页脚清档按钮）。发布前改成 false */
export const DEBUG_TOOLS = true;

/** 本地存档 key，改了等于清档 */
export const SAVE_KEY = 'merge-restaurant-save-v1';
