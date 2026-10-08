import { ENERGY } from '../config/GameConfig';

export interface EnergyJSON {
  value: number;
  lastTs: number;
}

/** 体力：按时间自动恢复，离线期间也照算 */
export class Energy {
  value: number;
  /** 上次结算恢复的时间戳 */
  lastTs: number;

  constructor(value = ENERGY.initial, now = Date.now()) {
    this.value = value;
    this.lastTs = now;
  }

  get max(): number {
    return ENERGY.max;
  }

  get isFull(): boolean {
    return this.value >= ENERGY.max;
  }

  /** 结算恢复，返回是否有变化 */
  tick(now: number): boolean {
    const ms = ENERGY.regenSeconds * 1000;
    // 存档时间戳比现在还晚（改过时间 / 换机 / 云档）：当作现在，别让倒计时算出负数
    if (this.lastTs > now) this.lastTs = now;
    if (this.value >= ENERGY.max) {
      this.lastTs = now;
      return false;
    }
    const gained = Math.floor((now - this.lastTs) / ms);
    if (gained <= 0) return false;
    this.value = Math.min(ENERGY.max, this.value + gained);
    this.lastTs = this.value >= ENERGY.max ? now : this.lastTs + gained * ms;
    return true;
  }

  /** 距下一点恢复的秒数，满了返回 0 */
  secondsToNext(now: number): number {
    if (this.value >= ENERGY.max) return 0;
    const ms = ENERGY.regenSeconds * 1000;
    const elapsed = Math.max(0, now - this.lastTs);
    return Math.max(0, Math.ceil((ms - (elapsed % ms)) / 1000));
  }

  canAfford(n: number): boolean {
    return this.value >= n;
  }

  consume(n: number, now: number): boolean {
    if (this.value < n) return false;
    if (this.value >= ENERGY.max) this.lastTs = now; // 从满开始计时
    this.value -= n;
    return true;
  }

  /** 广告/道具补充，可超过上限 */
  add(n: number): void {
    this.value += n;
  }

  toJSON(): EnergyJSON {
    return { value: this.value, lastTs: this.lastTs };
  }

  static fromJSON(d: EnergyJSON): Energy {
    const e = new Energy(d.value, d.lastTs);
    return e;
  }
}
