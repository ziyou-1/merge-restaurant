import { DAILY_REWARDS } from '../config/GameConfig';
import type { DailyReward } from '../config/GameConfig';

export interface DailyJSON {
  lastClaim: string;
  streak: number;
}

/** 固定按北京时间（UTC+8）过日子：不受手机时区影响，也没有夏令时，减 24 小时就是昨天 */
const DAY_TZ_OFFSET_MS = 8 * 3600 * 1000;

/** 日期 key：YYYY-MM-DD */
export function dayKey(ms: number): string {
  const d = new Date(ms + DAY_TZ_OFFSET_MS);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

const DAY_MS = 24 * 3600 * 1000;

/**
 * 每日签到：连续签到 7 天一轮，断一天从第 1 天重来。
 * 只记“上次领取是哪天、连续几天”，奖励表在 GameConfig.DAILY_REWARDS。
 */
export class Daily {
  lastClaim = '';
  streak = 0;

  canClaim(now: number): boolean {
    return dayKey(now) !== this.lastClaim;
  }

  /** 昨天签过 → 今天接着连；否则重头 */
  private nextStreak(now: number): number {
    return this.lastClaim === dayKey(now - DAY_MS) ? this.streak + 1 : 1;
  }

  /** 今天对应轮次里的第几天（1..7）。已领过就返回已领的那天，方便 UI 高亮 */
  todayIndex(now: number): number {
    const s = this.canClaim(now) ? this.nextStreak(now) : this.streak;
    return ((Math.max(1, s) - 1) % DAILY_REWARDS.length) + 1;
  }

  /** 领取；今天领过返回 null */
  claim(now: number): DailyReward | null {
    if (!this.canClaim(now)) return null;
    this.streak = this.nextStreak(now);
    this.lastClaim = dayKey(now);
    return DAILY_REWARDS[(this.streak - 1) % DAILY_REWARDS.length];
  }

  toJSON(): DailyJSON {
    return { lastClaim: this.lastClaim, streak: this.streak };
  }

  static fromJSON(d: DailyJSON | undefined): Daily {
    const x = new Daily();
    x.lastClaim = d?.lastClaim ?? '';
    x.streak = d?.streak ?? 0;
    return x;
  }
}
