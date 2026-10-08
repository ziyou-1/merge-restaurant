import { LEVEL_XP } from '../config/GameConfig';

export interface PlayerJSON {
  coins: number;
  xp: number;
  level: number;
}

/** 金币 / 经验 / 等级 */
export class Player {
  coins = 0;
  xp = 0;
  level = 1;

  /** 当前等级升下一级需要的 xp */
  xpForNext(): number {
    const i = this.level - 1;
    if (i < LEVEL_XP.length) return LEVEL_XP[i];
    const last = LEVEL_XP[LEVEL_XP.length - 1];
    return last + (i - LEVEL_XP.length + 1) * 500;
  }

  /** 加经验，返回升了几级 */
  addXp(n: number): number {
    this.xp += n;
    let ups = 0;
    while (this.xp >= this.xpForNext()) {
      this.xp -= this.xpForNext();
      this.level += 1;
      ups += 1;
    }
    return ups;
  }

  addCoins(n: number): void {
    this.coins += n;
  }

  spend(n: number): boolean {
    if (this.coins < n) return false;
    this.coins -= n;
    return true;
  }

  toJSON(): PlayerJSON {
    return { coins: this.coins, xp: this.xp, level: this.level };
  }

  static fromJSON(d: PlayerJSON): Player {
    const p = new Player();
    p.coins = d.coins;
    p.xp = d.xp;
    p.level = d.level;
    return p;
  }
}
